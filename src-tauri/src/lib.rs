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
    // Perbaiki terbilang basi dari versi lama agar ikut total terkini.
    match repair_terbilang() {
        Ok(n) if n > 0 => eprintln!("Perbaiki terbilang {} kwitansi lama", n),
        Ok(_) => {}
        Err(e) => eprintln!("Gagal perbaiki terbilang: {}", e),
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            cmd_terbilang,
            cmd_get_sekolah,
            cmd_update_sekolah,
            cmd_update_kwitansi,
            cmd_get_all_kwitansi,
            cmd_get_kwitansi,
            cmd_delete_kwitansi,
            cmd_search_kwitansi,
            cmd_dashboard_stats,
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
            cmd_get_backup_dir,
            cmd_set_backup_dir,
            cmd_backup_now,
            cmd_list_backups,
            cmd_restore_backup,
            cmd_pos_checkout,
            cmd_get_all_penjualan,
            cmd_get_penjualan,
            cmd_delete_penjualan,
            cmd_update_penjualan,
            cmd_print_penjualan,
            cmd_pos_test_print_with,
            cmd_upload_logo,
            cmd_hapus_logo,
            cmd_list_serial_ports,
            cmd_get_all_produk,
            cmd_simpan_produk,
            cmd_update_produk,
            cmd_delete_produk,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
