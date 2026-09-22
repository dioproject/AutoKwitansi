mod bku_period;
mod bpu_docs;
mod commands;
mod db;
mod kode_referensi;
mod models;
mod pdf_import;
mod pos_print;
mod terbilang;

use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if let Err(e) = db::init_db() {
        eprintln!("Failed to initialize database: {}", e);
    }
    // Backup otomatis tiap start (pengaman data riwayat).
    db::backup_db();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            cmd_terbilang,
            cmd_get_sekolah,
            cmd_update_sekolah,
            cmd_simpan_kwitansi,
            cmd_update_kwitansi,
            cmd_get_all_kwitansi,
            cmd_get_kwitansi,
            cmd_delete_kwitansi,
            cmd_search_kwitansi,
            cmd_get_print_settings,
            cmd_save_print_settings,
            cmd_get_pos_settings,
            cmd_save_pos_settings,
            cmd_get_doc_status,
            cmd_set_doc_lengkap,
            cmd_update_toko,
            cmd_parse_bku_pdfs,
            cmd_import_bku_period,
            cmd_print_pos_nota,
            cmd_pos_test_print,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
