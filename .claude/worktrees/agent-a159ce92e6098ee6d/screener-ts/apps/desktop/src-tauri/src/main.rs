// Tauri v2 desktop shell. Financial APIs are reached through tauri-plugin-http
// (Rust HTTP) to avoid browser CORS; storage uses tauri-plugin-fs.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
