mod commands;

use commands::dialog::reset_save_directory;
use commands::file::{get_file_metadata, read_log_file};
use commands::font::list_system_fonts;
use commands::watch::{get_watch_status, start_watch, stop_watch};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            read_log_file,
            get_file_metadata,
            start_watch,
            stop_watch,
            get_watch_status,
            list_system_fonts,
            reset_save_directory,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
