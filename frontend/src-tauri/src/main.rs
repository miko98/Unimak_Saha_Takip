#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

fn main() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_process::init());

    // Public key must live in tauri.conf.json -> plugins.updater.pubkey as full minisign .pub text
    // (including the "untrusted comment: ..." line). Do not pass a single-line base64 via env here.
    builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_decorations(true);
                let _ = window.set_minimizable(true);
                let _ = window.set_maximizable(true);
                let _ = window.set_closable(true);
                let _ = window.set_resizable(true);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
