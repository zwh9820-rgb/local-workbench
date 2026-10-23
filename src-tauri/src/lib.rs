// 发布版不弹出控制台窗口（main.rs 已声明，这里保持 lib 侧干净）
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

use std::{
    fs,
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

/// 启动超时：首次解压 + SQLite 建表，给足 40 秒
const START_TIMEOUT: Duration = Duration::from_secs(40);

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

/// 首次启动时把三件套目录建好，避免服务端写入失败
fn ensure_dirs(app: &AppHandle) -> Result<PathBuf, String> {
    let root = data_dir(app)?;
    for sub in ["", "ai-material", "backups"] {
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

/// 拉起内置 Node 服务端
///
/// 二进制布局（打包后）：
///   <安装目录>\本地个人工作台.exe
///   <安装目录>\node.exe            ← 由 scripts/prepare-sidecar.mjs 从本机 Node 复制
///   <安装目录>\server\server.js    ← Next standalone 产物入口
fn spawn_server(app: &AppHandle, root: &Path) -> Result<Child, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("无法定位资源目录: {e}"))?;

    let node_bin = if cfg!(windows) {
        resource_dir.join("node.exe")
    } else {
        resource_dir.join("node")
    };
    let server_dir = resource_dir.join("server");
    let server_js = server_dir.join("server.js");

    if !server_js.exists() {
        return Err(format!(
            "找不到服务端入口：{}\n请先执行 npm run build:desktop 生成 standalone 产物",
            server_js.display()
        ));
    }
    if !node_bin.exists() {
        return Err(format!(
            "找不到内置 Node 运行时：{}\n请执行 node scripts/prepare-sidecar.mjs 复制",
            node_bin.display()
        ));
    }

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
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    // Windows 下隐藏黑框控制台
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    cmd.spawn()
        .map_err(|e| format!("启动内置服务失败: {e}"))
}

/// 轮询等待端口就绪
fn wait_for_port(port: u16, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if TcpStream::connect_timeout(
            &format!("127.0.0.1:{port}").parse().unwrap(),
            Duration::from_millis(300),
        )
        .is_ok()
        {
            return true;
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    false
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

/// 应用信息（前端「数据目录」按钮、关于页用）
#[tauri::command]
fn app_info(app: AppHandle) -> Result<AppInfo, String> {
    let root = data_dir(&app)?;
    Ok(AppInfo {
        version: app.package_info().version.to_string(),
        data_dir: root.to_string_lossy().to_string(),
        db_file: root.join("workbench.db").to_string_lossy().to_string(),
        material_dir: root.join("ai-material").to_string_lossy().to_string(),
        backup_dir: root.join("backups").to_string_lossy().to_string(),
        server_url: format!("http://127.0.0.1:{SERVER_PORT}"),
        is_dev: is_dev(),
    })
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
            } else {
                let child = match spawn_server(&handle, &root) {
                    Ok(c) => c,
                    Err(e) => {
                        show_fatal(&window, &e);
                        window.show()?;
                        return Ok(());
                    }
                };

                *app.state::<ServerProcess>().0.lock().unwrap() = Some(child);

                if !wait_for_port(SERVER_PORT, START_TIMEOUT) {
                    show_fatal(
                        &window,
                        "内置服务启动超时（40s）。\n可能原因：杀毒软件拦截、端口被占用、安装包缺少 server 目录。",
                    );
                    window.show()?;
                    return Ok(());
                }

                let url: tauri::Url = format!("http://127.0.0.1:{SERVER_PORT}")
                    .parse()
                    .expect("服务地址解析失败");
                window.navigate(url)?;
                window.show()?;
            }

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

/// 启动失败时给用户一个可读的提示页，而不是白屏
fn show_fatal(window: &tauri::WebviewWindow, message: &str) {
    let html = format!(
        r#"<!doctype html><html><head><meta charset="utf-8"><style>
        body{{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;
        background:#F7F6F3;color:#1F2937;font-family:"Microsoft YaHei",system-ui,sans-serif}}
        .box{{max-width:560px;padding:28px 32px;background:#fff;border:1px solid rgba(16,36,46,.08);
        border-radius:12px;box-shadow:0 8px 24px rgba(16,36,46,.12)}}
        h1{{font-size:16px;margin:0 0 10px;color:#DC2626}}
        pre{{white-space:pre-wrap;font-size:12.5px;line-height:1.8;color:#374151;margin:0}}
        </style></head><body><div class="box"><h1>启动失败</h1><pre>{}</pre></div></body></html>"#,
        message.replace('&', "&amp;").replace('<', "&lt;")
    );
    let _ = window.eval(&format!(
        "document.open();document.write({});document.close();",
        serde_json::to_string(&html).unwrap_or_else(|_| "\"\"".into())
    ));
}
