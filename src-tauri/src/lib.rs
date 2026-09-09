mod commands;
mod csv_import;
mod db;
mod models;
mod terbilang;

use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize database
    if let Err(e) = db::init_db() {
        eprintln!("Failed to initialize database: {}", e);
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            cmd_terbilang,
            cmd_get_sekolah,
            cmd_update_sekolah,
            cmd_simpan_kwitansi,
            cmd_get_all_kwitansi,
            cmd_get_kwitansi,
            cmd_delete_kwitansi,
            cmd_search_kwitansi,
            cmd_parse_csv,
            cmd_import_csv,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
