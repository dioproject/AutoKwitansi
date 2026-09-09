use tauri::command;
use crate::db;
use crate::models::{Kwitansi, Sekolah, CsvRow};
use crate::terbilang::terbilang;
use crate::csv_import::parse_csv;

// ============ TERBILANG ============

#[command]
pub fn cmd_terbilang(jumlah: f64) -> String {
    terbilang(jumlah)
}

// ============ SEKOLAH ============

#[command]
pub fn cmd_get_sekolah() -> Result<Sekolah, String> {
    db::get_sekolah().map_err(|e| e.to_string())
}

#[command]
pub fn cmd_update_sekolah(sekolah: Sekolah) -> Result<(), String> {
    db::update_sekolah(&sekolah).map_err(|e| e.to_string())
}

// ============ KWITANSI ============

#[command]
pub fn cmd_simpan_kwitansi(mut kwitansi: Kwitansi) -> Result<i64, String> {
    kwitansi.terbilang = terbilang(kwitansi.jumlah);
    db::insert_kwitansi(&kwitansi).map_err(|e| e.to_string())
}

#[command]
pub fn cmd_get_all_kwitansi() -> Result<Vec<Kwitansi>, String> {
    db::get_all_kwitansi().map_err(|e| e.to_string())
}

#[command]
pub fn cmd_get_kwitansi(id: i64) -> Result<Kwitansi, String> {
    db::get_kwitansi_by_id(id).map_err(|e| e.to_string())
}

#[command]
pub fn cmd_delete_kwitansi(id: i64) -> Result<(), String> {
    db::delete_kwitansi(id).map_err(|e| e.to_string())
}

#[command]
pub fn cmd_search_kwitansi(query: String) -> Result<Vec<Kwitansi>, String> {
    db::search_kwitansi(&query).map_err(|e| e.to_string())
}

// ============ CSV IMPORT ============

#[command]
pub fn cmd_parse_csv(content: String) -> Result<Vec<CsvRow>, String> {
    parse_csv(&content)
}

#[command]
pub fn cmd_import_csv(rows: Vec<CsvRow>, tahun_anggaran: String, mengetahui: String, nip_mengetahui: String, bendahara: String, nip_bendahara: String) -> Result<usize, String> {
    let mut count = 0;
    for row in &rows {
        let kwitansi = Kwitansi {
            id: None,
            nomor_kwitansi: row.nomor_kwitansi.clone(),
            tanggal: row.tanggal.clone(),
            sudah_terima_dari: row.sudah_terima_dari.clone(),
            jumlah: row.jumlah,
            terbilang: terbilang(row.jumlah),
            untuk_pembayaran: row.untuk_pembayaran.clone(),
            kode_rekening: row.kode_rekening.clone(),
            tahun_anggaran: tahun_anggaran.clone(),
            mengetahui: mengetahui.clone(),
            nip_mengetahui: nip_mengetahui.clone(),
            bendahara: bendahara.clone(),
            nip_bendahara: nip_bendahara.clone(),
            penerima: row.penerima.clone(),
            created_at: None,
        };
        db::insert_kwitansi(&kwitansi).map_err(|e| e.to_string())?;
        count += 1;
    }
    Ok(count)
}
