#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let updater_endpoint = option_env!("TAURI_UPDATER_ENDPOINT")
        .unwrap_or("https://github.com/miko98/Unimak_Saha_Takip/releases/latest/download/latest.json")
        .to_string();

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_process::init());

    if let Some(pubkey) = option_env!("TAURI_UPDATER_PUBLIC_KEY") {
        builder = builder.plugin(
            tauri_plugin_updater::Builder::new()
                .pubkey(pubkey)
                .endpoints(vec![updater_endpoint])
                .build(),
        );
    } else {
        eprintln!("TAURI_UPDATER_PUBLIC_KEY is not set; desktop auto-update is disabled.");
    }

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
