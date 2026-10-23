//! # 本地个人工作台 · Tauri 桌面壳
//!
//! ## 架构（重要）
//!
//! Tauri 的 WebView 里没有 Node 运行时，而本项目的业务层是 Next.js API Route +
//! Drizzle + better-sqlite3 + OpenAI SDK（Agent 循环），全部跑在 Node 服务端。
//!
//! 为了**完全复用**这些业务代码（不改表结构、不改 Agent 工具、不改页面），
//! 这里采用「Tauri 窗口 + Node sidecar」结构：
//!
//! ```text
//! ┌────────────────────────────── Tauri 进程 ──────────────────────────────┐
//! │  WebView2  ──HTTP──▶  127.0.0.1:34115                                  │
//! │     ▲                    ▲                                             │
//! │     │ 窗口/原生对话框      │ 子进程（resources/node.exe server.js）        │
//! │  Rust 壳 ──spawn/env──────┘  ├─ %APPDATA%\com.local.workbench\*.db      │
//! │                              ├─ %APPDATA%\...\ai-material              │
//! │                              └─ %APPDATA%\...\backups                  │
//! └────────────────────────────────────────────────────────────────────────┘
//!                                     │ HTTP（唯一允许的外部连接）
//!                                     ▼
//!                           LM Studio 127.0.0.1:1234
//! ```
//!
//! Rust 只做四件事：起服务、给数据目录、弹系统对话框、管生命周期。
//! 业务逻辑一行没搬。
//!
//! ## 排障
//!
//! sidecar 的 stdout/stderr 会写到 `%APPDATA%\com.local.workbench\logs\server.log`。
//! 启动失败时错误页会直接显示日志尾部，不用再猜。

use std::{
    fs::{self, OpenOptions},
    net::TcpStream,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    time::{Duration, Instant},
};

use serde::Serialize;
use tauri::{AppHandle, Manager, RunEvent, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

/// 内置服务端口（仅监听 127.0.0.1，不对外暴露）
const SERVER_PORT: u16 = 34115;

/// 开发态由 Next dev server 提供页面
const DEV_URL: &str = "http://localhost:3000";

/// 启动超时。
/// 首次启动时 Windows Defender 会全量扫描 node.exe 与 server 目录（上万个文件），
/// 冷启动 60s+ 是正常现象，所以给到 90 秒。
const START_TIMEOUT: Duration = Duration::from_secs(90);

/// 日志轮转阈值
const LOG_MAX_BYTES: u64 = 2 * 1024 * 1024;

/// 内置服务端压缩包名（打包进 resources）
///
/// 为什么用 zip 而不是直接放目录？
/// Tauri 打包 resources 时按 glob 展开，`.next` 这类点开头的目录有被漏掉的风险；
/// 上万个散文件也会拖慢 NSIS 打包。压成单文件最稳，运行时首次解压即可。
const SERVER_ZIP: &str = "server.zip";

/// 子进程句柄，退出时负责回收
struct ServerProcess(Mutex<Option<Child>>);

/// 是否开发态（tauri dev / cargo build --debug）
fn is_dev() -> bool {
    cfg!(debug_assertions)
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    version: String,
    data_dir: String,
    db_file: String,
    material_dir: String,
    backup_dir: String,
    log_file: String,
    server_url: String,
    is_dev: bool,
}

/* -------------------------------------------------------------------------- */
/*  路径                                                                       */
/* -------------------------------------------------------------------------- */

/// 应用数据目录：%APPDATA%\com.local.workbench（Windows）
fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("无法定位应用数据目录: {e}"))
}

fn backup_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("backups"))
}

/// sidecar 日志文件：%APPDATA%\com.local.workbench\logs\server.log
fn log_file(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = data_dir(app)?.join("logs");
    fs::create_dir_all(&dir).map_err(|e| format!("创建日志目录失败 {}: {e}", dir.display()))?;
    Ok(dir.join("server.log"))
}

/// 首次启动时把目录建好，避免服务端写入失败
fn ensure_dirs(app: &AppHandle) -> Result<PathBuf, String> {
    let root = data_dir(app)?;
    for sub in ["", "ai-material", "backups", "logs"] {
        let dir = if sub.is_empty() {
            root.clone()
        } else {
            root.join(sub)
        };
        fs::create_dir_all(&dir).map_err(|e| format!("创建目录失败 {}: {e}", dir.display()))?;
    }
    Ok(root)
}

/* -------------------------------------------------------------------------- */
/*  服务端进程                                                                  */
/* -------------------------------------------------------------------------- */

/// 端口是否已可连接
fn port_in_use(port: u16) -> bool {
    let addr = match format!("127.0.0.1:{port}").parse() {
        Ok(a) => a,
        Err(_) => return false,
    };
    TcpStream::connect_timeout(&addr, Duration::from_millis(400)).is_ok()
}

/// 运行时目录：%APPDATA%\com.local.workbench\runtime\<版本>
/// 用版本号做子目录，升级后自动重新解压，避免新旧文件混用
fn runtime_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?
        .join("runtime")
        .join(env!("CARGO_PKG_VERSION")))
}

/// 确保服务端运行时已解压，返回可用目录
fn ensure_runtime(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = runtime_dir(app)?;
    let marker = dir.join(".ready");

    if marker.exists() && dir.join("server.js").exists() {
        return Ok(dir);
    }

    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("无法定位资源目录: {e}"))?;
    let zip_path = resource_dir.join(SERVER_ZIP);

    if !zip_path.exists() {
        return Err(format!(
            "找不到内置服务包：{}\n安装包可能不完整，请重新安装；\n若是本地构建，请先执行 npm run build:desktop",
            zip_path.display()
        ));
    }

    // 残留的半成品目录先清掉
    if dir.exists() {
        let _ = fs::remove_dir_all(&dir);
    }
    fs::create_dir_all(&dir).map_err(|e| format!("创建运行时目录失败 {}: {e}", dir.display()))?;

    let file = fs::File::open(&zip_path)
        .map_err(|e| format!("打开服务包失败 {}: {e}", zip_path.display()))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| format!("服务包损坏（不是合法 zip）: {e}"))?;
    archive
        .extract(&dir)
        .map_err(|e| format!("解压服务包失败: {e}"))?;

    fs::write(&marker, b"ok").map_err(|e| format!("写入标记失败: {e}"))?;
    Ok(dir)
}

/// 拉起内置 Node 服务端
///
/// 二进制布局（打包后）：
///   <安装目录>\本地个人工作台.exe
///   <安装目录>\node.exe        ← 由 scripts/prepare-sidecar.mjs 从构建机 Node 复制
///   <安装目录>\server.zip      ← Next standalone 产物（首次启动解压到 App 数据目录）
/// 运行时（首次启动后）：
///   %APPDATA%\com.local.workbench\runtime\<版本>\server.js
fn spawn_server(app: &AppHandle, runtime: &Path, root: &Path) -> Result<Child, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("无法定位资源目录: {e}"))?;

    let node_bin = if cfg!(windows) {
        resource_dir.join("node.exe")
    } else {
        resource_dir.join("node")
    };
    // 服务端跑在 App 数据目录里（首次启动从 server.zip 解压出来）
    let server_dir = runtime.to_path_buf();
    let server_js = server_dir.join("server.js");

    if !server_js.exists() {
        return Err(format!(
            "找不到服务端入口：{}\n请删除 {} 后重启应用以重新解压",
            server_js.display(),
            runtime.display()
        ));
    }
    if !node_bin.exists() {
        return Err(format!(
            "找不到内置 Node 运行时：{}\n请执行 node scripts/prepare-sidecar.mjs 复制",
            node_bin.display()
        ));
    }

    // 日志：追加写入，超过阈值就清空重来
    let log_path = log_file(app)?;
    if let Ok(meta) = fs::metadata(&log_path) {
        if meta.len() > LOG_MAX_BYTES {
            let _ = fs::remove_file(&log_path);
        }
    }
    let mut log = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|e| format!("无法写入日志文件 {}: {e}", log_path.display()))?;
    // 每次启动打一条分隔，方便定位是哪一次
    use std::io::Write;
    let _ = writeln!(
        log,
        "\n===== [{}] 启动 sidecar =====\nnode : {}\nentry: {}\ndata : {}",
        chrono_like_now(),
        node_bin.display(),
        server_js.display(),
        root.display()
    );

    let log_err = log
        .try_clone()
        .map_err(|e| format!("日志句柄复制失败: {e}"))?;

    let mut cmd = Command::new(&node_bin);
    cmd.arg(&server_js)
        .current_dir(&server_dir)
        .env("NODE_ENV", "production")
        .env("PORT", SERVER_PORT.to_string())
        .env("HOSTNAME", "127.0.0.1")
        // 关键：把数据目录交给服务端，业务层据此定位 db / ai-material / backups
        .env("WORKBENCH_DATA_DIR", root)
        // LM Studio 仍然是外部程序，这里只是把地址固化下来
        .env("LM_STUDIO_BASE_URL", "http://127.0.0.1:1234/v1")
        // 让 Node 的错误堆栈更完整，便于排障
        .env("NODE_OPTIONS", "--enable-source-maps")
        .stdin(Stdio::null())
        .stdout(Stdio::from(log))
        .stderr(Stdio::from(log_err));

    // Windows 下隐藏黑框控制台
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    cmd.spawn().map_err(|e| {
        format!(
            "启动内置服务失败: {e}\n可执行文件: {}",
            node_bin.display()
        )
    })
}

/// 极简时间戳（不引第三方 crate，避免额外依赖）
fn chrono_like_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("unix:{secs}")
}

/// 等待端口就绪；进程提前退出则立即返回，不用干等 90 秒
fn wait_ready(port: u16, timeout: Duration, child: &mut Child) -> Result<(), String> {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if port_in_use(port) {
            return Ok(());
        }
        match child.try_wait() {
            Ok(Some(status)) => {
                return Err(format!(
                    "服务进程已退出（退出码 {}），通常是缺少依赖或数据库无法打开，详见下方日志",
                    status.code().unwrap_or(-1)
                ));
            }
            Ok(None) => {}
            Err(e) => return Err(format!("无法获取服务进程状态: {e}")),
        }
        std::thread::sleep(Duration::from_millis(300));
    }
    Err(format!(
        "等待端口 {port} 超时（{}s）。首次启动可能被杀毒软件全盘扫描拖慢，详见下方日志",
        timeout.as_secs()
    ))
}

/// 读日志尾部
fn tail_log(app: &AppHandle, max_lines: usize) -> String {
    let Ok(path) = log_file(app) else {
        return String::new();
    };
    let Ok(text) = fs::read_to_string(&path) else {
        return String::new();
    };
    let lines: Vec<&str> = text.lines().collect();
    let start = lines.len().saturating_sub(max_lines);
    lines[start..].join("\n")
}

fn kill_server(state: &State<ServerProcess>) {
    if let Ok(mut guard) = state.0.lock() {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

/* -------------------------------------------------------------------------- */
/*  命令                                                                       */
/* -------------------------------------------------------------------------- */

/// 应用信息（前端「数据目录」按钮、关于页、排障用）
#[tauri::command]
fn app_info(app: AppHandle) -> Result<AppInfo, String> {
    let root = data_dir(&app)?;
    Ok(AppInfo {
        version: app.package_info().version.to_string(),
        data_dir: root.to_string_lossy().to_string(),
        db_file: root.join("workbench.db").to_string_lossy().to_string(),
        material_dir: root.join("ai-material").to_string_lossy().to_string(),
        backup_dir: root.join("backups").to_string_lossy().to_string(),
        log_file: root.join("logs").join("server.log").to_string_lossy().to_string(),
        server_url: format!("http://127.0.0.1:{SERVER_PORT}"),
        is_dev: is_dev(),
    })
}

/// 读取 sidecar 日志尾部（错误页 / 排障面板用）
#[tauri::command]
fn read_server_log(app: AppHandle, lines: Option<usize>) -> Result<String, String> {
    Ok(tail_log(&app, lines.unwrap_or(80)))
}

/// 把服务端生成的备份复制到用户选择的位置（系统「另存为」对话框）
///
/// 只允许 source 位于 App 数据目录 backups/ 内，避免前端传入任意路径
#[tauri::command]
async fn save_backup_as(
    app: AppHandle,
    source: String,
    suggested: String,
) -> Result<Option<String>, String> {
    let dir = backup_dir(&app)?;
    let src = PathBuf::from(&source);

    if !src.starts_with(&dir) {
        return Err("拒绝访问：备份源文件必须位于应用备份目录内".into());
    }
    if !src.exists() {
        return Err("备份文件不存在，请重新导出".into());
    }

    let picked = app
        .dialog()
        .file()
        .set_title("保存工作台备份")
        .set_file_name(suggested.as_str())
        .add_filter("ZIP 备份", &["zip"])
        .blocking_save_file();

    match picked {
        Some(path) => {
            let dest = path
                .into_path()
                .map_err(|e| format!("无效的保存路径: {e}"))?;
            fs::copy(&src, &dest).map_err(|e| format!("写入失败: {e}"))?;
            Ok(Some(dest.to_string_lossy().to_string()))
        }
        None => Ok(None), // 用户取消
    }
}

/// 选择要导入的备份：弹系统「打开」对话框，并复制进 App 数据目录
///
/// 复制而不是直接把外部路径交给服务端，是为了让导入接口只接受
/// 「数据目录内的路径」，Web 端也无法借机读取系统任意文件。
#[tauri::command]
async fn pick_backup_to_import(app: AppHandle) -> Result<Option<String>, String> {
    let picked = app
        .dialog()
        .file()
        .set_title("选择工作台备份")
        .add_filter("ZIP 备份", &["zip"])
        .blocking_pick_file();

    match picked {
        Some(path) => {
            let src = path
                .into_path()
                .map_err(|e| format!("无效的文件路径: {e}"))?;
            let dir = backup_dir(&app)?;
            fs::create_dir_all(&dir).map_err(|e| format!("创建备份目录失败: {e}"))?;
            let dest = dir.join("_import.zip");
            fs::copy(&src, &dest).map_err(|e| format!("读取备份失败: {e}"))?;
            Ok(Some(dest.to_string_lossy().to_string()))
        }
        None => Ok(None),
    }
}

/// 在资源管理器里打开数据目录
#[tauri::command]
fn reveal_data_dir(app: AppHandle) -> Result<(), String> {
    let root = data_dir(&app)?;
    app.opener()
        .open_path(root.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| format!("打开目录失败: {e}"))
}

/// 用系统默认浏览器打开外部链接（避免应用窗口被导航走）
#[tauri::command]
fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("只允许打开 http/https 链接".into());
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| format!("打开链接失败: {e}"))
}

/// 开发态：开关 devtools（生产构建不可用）
#[tauri::command]
fn toggle_devtools(app: AppHandle) -> Result<(), String> {
    #[cfg(debug_assertions)]
    {
        if let Some(win) = app.get_webview_window("main") {
            if win.is_devtools_open() {
                win.close_devtools();
            } else {
                win.open_devtools();
            }
        }
        Ok(())
    }
    #[cfg(not(debug_assertions))]
    {
        let _ = app;
        Err("发布版未开启开发者工具".into())
    }
}

/* -------------------------------------------------------------------------- */
/*  启动                                                                       */
/* -------------------------------------------------------------------------- */

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .manage(ServerProcess(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            app_info,
            read_server_log,
            save_backup_as,
            pick_backup_to_import,
            reveal_data_dir,
            open_external,
            toggle_devtools
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let root = ensure_dirs(&handle)?;

            let window = app
                .get_webview_window("main")
                .ok_or("主窗口未创建，检查 tauri.conf.json 的 windows 配置")?;

            if is_dev() {
                // 开发态：devUrl 已经由 Tauri 自动加载，直接显示
                window.show()?;
                return Ok(());
            }

            // 1) 端口预检：此时还没 spawn，若已连通说明被别的进程占着
            if port_in_use(SERVER_PORT) {
                let detail = format!(
                    "端口 {port} 已被占用，内置服务无法启动。\n\n\
                     常见原因：\n\
                     · 上一次运行崩溃，残留了 node.exe 进程\n\
                     · 其他程序恰好占用该端口\n\n\
                     排查：任务管理器结束所有 node.exe 后重开；\n\
                     或在 PowerShell 执行：\n\
                     netstat -ano | findstr :{port}",
                    port = SERVER_PORT
                );
                show_fatal(&window, "端口被占用", &detail, &tail_log(&handle, 30));
                window.show()?;
                return Ok(());
            }

            // 2) 准备运行时：首次启动把 server.zip 解压到 App 数据目录
            let runtime = match ensure_runtime(&handle) {
                Ok(dir) => dir,
                Err(e) => {
                    show_fatal(&window, "运行时准备失败", &e, "");
                    window.show()?;
                    return Ok(());
                }
            };

            // 3) 拉起 sidecar
            let mut child = match spawn_server(&handle, &runtime, &root) {
                Ok(c) => c,
                Err(e) => {
                    show_fatal(&window, "启动失败", &e, &tail_log(&handle, 30));
                    window.show()?;
                    return Ok(());
                }
            };

            // 4) 等端口就绪（进程提前退出会立刻返回，不等满 90s）
            let ready = wait_ready(SERVER_PORT, START_TIMEOUT, &mut child);
            *app.state::<ServerProcess>().0.lock().unwrap() = Some(child);

            if let Err(reason) = ready {
                let node_display = handle
                    .path()
                    .resource_dir()
                    .map(|p| {
                        if cfg!(windows) {
                            p.join("node.exe")
                        } else {
                            p.join("node")
                        }
                        .display()
                        .to_string()
                    })
                    .unwrap_or_default();

                let detail = format!(
                    "{reason}\n\n日志文件：\n{log}\n\n\
                     手动复现（在命令行里执行，可直接看到完整报错）：\n\
                     cd \"{runtime}\"\n\
                     \"{node}\" .\\server.js",
                    reason = reason,
                    log = log_file(&handle)
                        .map(|p| p.display().to_string())
                        .unwrap_or_default(),
                    runtime = runtime.display(),
                    node = node_display,
                );
                show_fatal(&window, "内置服务启动失败", &detail, &tail_log(&handle, 60));
                window.show()?;
                return Ok(());
            }

            let url: tauri::Url = format!("http://127.0.0.1:{SERVER_PORT}")
                .parse()
                .expect("服务地址解析失败");
            window.navigate(url)?;
            window.show()?;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Tauri 应用初始化失败");

    // 退出时回收 sidecar，避免留下孤儿进程
    app.run(|handle, event| match event {
        RunEvent::ExitRequested { .. } | RunEvent::Exit => {
            kill_server(&handle.state::<ServerProcess>());
        }
        _ => {}
    });
}

/* -------------------------------------------------------------------------- */
/*  错误页                                                                     */
/* -------------------------------------------------------------------------- */

fn html_escape(input: &str) -> String {
    input
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

/// 启动失败时给出可读的诊断页，而不是白屏
fn show_fatal(window: &tauri::WebviewWindow, title: &str, detail: &str, log_tail: &str) {
    let log_block = if log_tail.trim().is_empty() {
        String::from("<p class=\"muted\">（暂无日志输出，进程可能根本没起来）</p>")
    } else {
        format!(
            "<h2>server.log（末尾）</h2><pre class=\"log\">{}</pre>",
            html_escape(log_tail)
        )
    };

    let html = format!(
        r#"<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>启动失败</title><style>
        *{{box-sizing:border-box}}
        body{{margin:0;min-height:100vh;display:flex;align-items:flex-start;justify-content:center;
        background:#F7F6F3;color:#1F2937;font-family:"Microsoft YaHei","PingFang SC",system-ui,sans-serif;padding:32px 20px}}
        .box{{width:100%;max-width:720px;background:#fff;border:1px solid rgba(16,36,46,.08);
        border-radius:12px;box-shadow:0 8px 24px rgba(16,36,46,.12);padding:24px 28px}}
        h1{{font-size:17px;margin:0 0 4px;color:#DC2626}}
        .sub{{font-size:12px;color:#6B7280;margin:0 0 16px}}
        h2{{font-size:12px;margin:18px 0 6px;color:#374151;font-weight:600}}
        pre{{white-space:pre-wrap;word-break:break-all;font-size:12px;line-height:1.75;
        color:#374151;margin:0;font-family:Consolas,"Courier New",monospace}}
        pre.log{{background:#0B181F;color:#D9ECF2;padding:12px 14px;border-radius:8px;max-height:300px;overflow:auto}}
        .muted{{font-size:12px;color:#9CA3AF;margin:0}}
        .tip{{margin-top:16px;padding:10px 12px;background:#F0F7F9;border-left:3px solid #3D97B5;
        border-radius:6px;font-size:12px;line-height:1.8;color:#1F4E5F}}
        </style></head><body><div class="box">
        <h1>{title}</h1>
        <p class="sub">本地个人工作台 · 内置服务未能就绪</p>
        <pre>{detail}</pre>
        {log_block}
        <div class="tip">
          排查建议：关闭本窗口后重新打开可重试；仍失败请把上面这段日志发出来。<br>
          数据与日志目录：<b>%APPDATA%\com.local.workbench</b>（logs\server.log）
        </div>
        </div></body></html>"#,
        title = html_escape(title),
        detail = html_escape(detail),
        log_block = log_block,
    );

    let js = format!(
        "document.open();document.write({});document.close();",
        serde_json::to_string(&html).unwrap_or_else(|_| "\"\"".into())
    );
    let _ = window.eval(&js);
}
