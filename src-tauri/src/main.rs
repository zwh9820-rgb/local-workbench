// 发布版不弹出控制台窗口
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    local_workbench_lib::run();
}
