//! Tauri v2 外壳
//! ---------------------------------------------------------------------------
//! 运行模型（sidecar 模式）：
//!   1. 打包时把 Next.js standalone 产物放进 resources/app
//!   2. 把 node.exe 放进 resources/node.exe
//!   3. 启动时用内置 node 跑 `server.js`（监听 127.0.0.1 上的空闲端口）
//!   4. 轮询端口就绪后，把窗口导航到本地地址
//!   5. 窗口销毁时杀掉 node 子进程
//!
//! 为什么不用 tauri-plugin-shell：
//!   直接用 std::process::Command 更可控，也不用额外配 capability 权限。

use std::net::{SocketAddr, TcpStream};
use std::process::{Child, Command};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use tauri::Manager;

/// node 子进程句柄（窗口关闭时统一回收）
static NODE_CHILD: Mutex<Option<Child>> = Mutex::new(None);

/// 端口是否可绑定
fn port_available(port: u16) -> bool {
    std::net::TcpListener::bind(("127.0.0.1", port)).is_ok()
}

/// 从 3210 起找一个空闲端口
fn pick_port() -> u16 {
    for port in 3210u16..=3260u16 {
        if port_available(port) {
            return port;
        }
    }
    3210
}

/// 轮询直到端口可连接（说明 Next 服务已起来）
fn wait_ready(port: u16, timeout: Duration) -> bool {
    let addr: SocketAddr = match format!("127.0.0.1:{port}").parse() {
        Ok(a) => a,
        Err(_) => return false,
    };
    let start = Instant::now();
    while start.elapsed() < timeout {
        if TcpStream::connect_timeout(&addr, Duration::from_millis(400)).is_ok() {
            return true;
        }
        thread::sleep(Duration::from_millis(300));
    }
    false
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // ---------- 路径解析 ----------
            let res_dir = app.path().resource_dir()?;
            let app_dir = res_dir.join("resources").join("app");
            let node_exe = res_dir.join("resources").join("node.exe");

            // 用户数据目录：%APPDATA%\<identifier>\
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db_path = data_dir.join("workbench.db");

            if !app_dir.exists() || !node_exe.exists() {
                return Err(format!(
                    "资源缺失：\n  app = {}\n  node = {}\n请用 GitHub Actions 打出的安装包运行。",
                    app_dir.display(),
                    node_exe.display()
                )
                .into());
            }

            // ---------- 启动 Next sidecar ----------
            let port = pick_port();
            let child = Command::new(&node_exe)
                .arg("server.js")
                .current_dir(&app_dir)
                .env("PORT", port.to_string())
                .env("HOSTNAME", "127.0.0.1")
                .env("NODE_ENV", "production")
                .env("DATABASE_URL", db_path.to_string_lossy().to_string())
                .env("APP_DATA_DIR", data_dir.to_string_lossy().to_string())
                .spawn()?;

            if let Ok(mut guard) = NODE_CHILD.lock() {
                *guard = Some(child);
            }

            // ---------- 就绪后导航 ----------
            let handle = app.handle().clone();
            thread::spawn(move || {
                if !wait_ready(port, Duration::from_secs(45)) {
                    eprintln!("[tauri] Next 服务启动超时（端口 {port}）");
                    return;
                }

                let target = format!("http://127.0.0.1:{port}");
                if let Some(win) = handle.get_webview_window("main") {
                    match tauri::Url::parse(&target) {
                        Ok(url) => {
                            if win.navigate(url).is_err() {
                                let _ = win.eval(&format!("location.href='{target}'"));
                            }
                        }
                        Err(_) => {
                            let _ = win.eval(&format!("location.href='{target}'"));
                        }
                    }
                }
            });

            Ok(())
        })
        .on_window_event(|_window, event| {
            // 窗口关闭 → 回收 node 进程，避免端口占用残留
            if let tauri::WindowEvent::Destroyed = event {
                if let Ok(mut guard) = NODE_CHILD.lock() {
                    if let Some(mut child) = guard.take() {
                        let _ = child.kill();
                        let _ = child.wait();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("Tauri 应用启动失败");
}
