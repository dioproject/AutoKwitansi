use crate::csv_import::parse_csv;
use crate::db;
use crate::models::{
    BkuData, BkuPeriodItem, BkuTransaction, BpuDokumen, CsvRow, Kwitansi, PosSettings,
    PrintSettings, Sekolah,
};
use crate::pdf_import::parse_bku_pdf;
use crate::terbilang::terbilang;
use tauri::command;

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
    // Expand BNU description
    kwitansi.untuk_pembayaran = expand_bnu_description(
        &kwitansi.nomor_kwitansi,
        &kwitansi.kode_rekening,
        &kwitansi.untuk_pembayaran,
        &kwitansi.bulan,
        &kwitansi.tahun_anggaran,
    );
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
pub fn cmd_import_csv(
    rows: Vec<CsvRow>,
    tahun_anggaran: String,
    mengetahui: String,
    nip_mengetahui: String,
    bendahara: String,
    nip_bendahara: String,
) -> Result<usize, String> {
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
            bulan: String::new(),
            mengetahui: mengetahui.clone(),
            nip_mengetahui: nip_mengetahui.clone(),
            bendahara: bendahara.clone(),
            nip_bendahara: nip_bendahara.clone(),
            penerima: row.penerima.clone(),
            nama_toko: String::new(),
            alamat_toko: String::new(),
            pimpinan_toko: String::new(),
            created_at: None,
            kena_pph21: false,
        };
        db::insert_kwitansi(&kwitansi).map_err(|e| e.to_string())?;
        count += 1;
    }
    Ok(count)
}

// ============ PDF BKU IMPORT ============

#[command]
pub fn cmd_parse_bku_pdf(file_path: String) -> Result<BkuData, String> {
    parse_bku_pdf(&file_path)
}

#[command]
pub fn cmd_import_bku(
    transactions: Vec<BkuTransaction>,
    bulan: String,
    tahun_anggaran: String,
    sudah_terima_dari: String,
    mengetahui: String,
    nip_mengetahui: String,
    bendahara: String,
    nip_bendahara: String,
) -> Result<usize, String> {
    let mut count = 0;
    for tx in &transactions {
        let pph21 = is_honor_pph21(&tx.no_bukti, &tx.kode_kegiatan, &tx.uraian);
        let kwitansi = Kwitansi {
            id: None,
            nomor_kwitansi: tx.no_bukti.clone(),
            tanggal: tx.tanggal.clone(),
            sudah_terima_dari: sudah_terima_dari.clone(),
            jumlah: tx.pengeluaran,
            terbilang: terbilang(tx.pengeluaran),
            untuk_pembayaran: expand_bnu_description(
                &tx.no_bukti,
                &tx.kode_kegiatan,
                &tx.uraian,
                &bulan,
                &tahun_anggaran,
            ),
            kode_rekening: tx.kode_rekening.clone(),
            tahun_anggaran: tahun_anggaran.clone(),
            bulan: bulan.clone(),
            mengetahui: mengetahui.clone(),
            nip_mengetahui: nip_mengetahui.clone(),
            bendahara: bendahara.clone(),
            nip_bendahara: nip_bendahara.clone(),
            penerima: tx.penerima.clone(),
            nama_toko: String::new(),
            alamat_toko: String::new(),
            pimpinan_toko: String::new(),
            created_at: None,
            kena_pph21: pph21,
        };
        db::insert_kwitansi(&kwitansi).map_err(|e| e.to_string())?;
        count += 1;
    }
    Ok(count)
}

/// Deteksi otomatis apakah transaksi kena PPh 21 6%
pub(crate) fn is_honor_pph21(no_bukti: &str, kode_kegiatan: &str, uraian: &str) -> bool {
    let nomor = no_bukti.to_uppercase();
    let kode = kode_kegiatan.to_uppercase();
    let u = uraian.to_lowercase();
    nomor.contains("BNU")
        || kode.contains("07.12.04")
        || u.contains("honor")
        || u.contains("honorarium")
        || u.contains("instruktur")
}

/// Expand BNU description to be more descriptive and less monotonous
pub(crate) fn expand_bnu_description(
    nomor: &str,
    kode: &str,
    uraian: &str,
    bulan: &str,
    tahun: &str,
) -> String {
    let nomor_upper = nomor.to_uppercase();
    if !nomor_upper.contains("BNU") {
        return uraian.to_string();
    }

    let kode_upper = kode.to_uppercase();
    let uraian_lower = uraian.to_lowercase();
    let bulan_display = if bulan.is_empty() {
        "".to_string()
    } else {
        format!(" Bulan {}", bulan)
    };
    let tahun_display = if tahun.is_empty() {
        "".to_string()
    } else {
        format!(" TA {}", tahun)
    };

    // Expand based on kode rekening and uraian keywords
    if kode_upper.contains("07.12.04")
        || uraian_lower.contains("tenaga ahli")
        || uraian_lower.contains("narasumber")
    {
        // Tenaga Ahli / Narasumber
        let base = uraian.trim();
        if base.len() < 40 {
            format!(
                "Pembayaran Honorarium Tenaga Ahli/Narasumber — {}{}{}",
                base, bulan_display, tahun_display
            )
        } else {
            format!(
                "{} — Honorarium Tenaga Ahli/Narasumber{}{}",
                base, bulan_display, tahun_display
            )
        }
    } else if uraian_lower.contains("instruktur")
        || uraian_lower.contains("pelatih")
        || uraian_lower.contains("guru")
    {
        // Instruktur / Pelatih
        let base = uraian.trim();
        if base.len() < 40 {
            format!(
                "Pembayaran Honorarium Instruktur/Pelatih — {}{}{}",
                base, bulan_display, tahun_display
            )
        } else {
            format!(
                "{} — Honorarium Instruktur/Pelatih{}{}",
                base, bulan_display, tahun_display
            )
        }
    } else if uraian_lower.contains("honor") || uraian_lower.contains("honorarium") {
        // Generic honorarium
        let base = uraian.trim();
        if base.len() < 40 {
            format!(
                "Pembayaran Honorarium — {}{}{}",
                base, bulan_display, tahun_display
            )
        } else {
            format!("{}{}{}", base, bulan_display, tahun_display)
        }
    } else {
        // BNU but no honor keywords - just add context
        let base = uraian.trim();
        format!("{}{}{}", base, bulan_display, tahun_display)
    }
}

// ============ PRINT SETTINGS ============

#[command]
pub fn cmd_get_print_settings() -> Result<PrintSettings, String> {
    db::get_print_settings().map_err(|e| e.to_string())
}

#[command]
pub fn cmd_save_print_settings(settings: PrintSettings) -> Result<(), String> {
    db::save_print_settings(&settings).map_err(|e| e.to_string())
}

// ============ POS SETTINGS ============

#[command]
pub fn cmd_get_pos_settings() -> Result<PosSettings, String> {
    crate::pos_print::get_pos_settings()
}

#[command]
pub fn cmd_save_pos_settings(settings: PosSettings) -> Result<(), String> {
    crate::pos_print::save_pos_settings(&settings)
}

// ============ BPU DOKUMEN ============

#[command]
pub fn cmd_get_doc_status(kwitansi_id: i64) -> Result<BpuDokumen, String> {
    crate::bpu_docs::get_doc_status(kwitansi_id)
}

#[command]
pub fn cmd_set_doc_lengkap(
    kwitansi_id: i64,
    dok_bast: bool,
    dok_surat_pesanan: bool,
    dok_invoice: bool,
    dok_bap: bool,
) -> Result<(), String> {
    crate::bpu_docs::set_doc_lengkap(
        kwitansi_id,
        dok_bast,
        dok_surat_pesanan,
        dok_invoice,
        dok_bap,
    )
}

#[command]
pub fn cmd_update_toko(
    kwitansi_id: i64,
    nama_toko: String,
    alamat_toko: String,
    pimpinan_toko: String,
) -> Result<(), String> {
    crate::bpu_docs::update_toko(kwitansi_id, &nama_toko, &alamat_toko, &pimpinan_toko)
}

// ============ BKU PERIOD ============

#[command]
pub fn cmd_parse_bku_pdfs(file_paths: Vec<String>) -> Result<Vec<BkuData>, String> {
    crate::bku_period::parse_bku_pdfs(file_paths)
}

#[command]
pub fn cmd_import_bku_period(
    items: Vec<BkuPeriodItem>,
    tahun_anggaran: String,
    sudah_terima_dari: String,
    mengetahui: String,
    nip_mengetahui: String,
    bendahara: String,
    nip_bendahara: String,
) -> Result<usize, String> {
    crate::bku_period::import_bku_period(
        &items,
        &tahun_anggaran,
        &sudah_terima_dari,
        &mengetahui,
        &nip_mengetahui,
        &bendahara,
        &nip_bendahara,
    )
}

// ============ POS DIRECT PRINT ============

#[command]
pub fn cmd_print_pos_nota(kwitansi_id: i64) -> Result<(), String> {
    let k = db::get_kwitansi_by_id(kwitansi_id).map_err(|e| e.to_string())?;
    let s = db::get_pos_settings().map_err(|e| e.to_string())?;
    crate::pos_print::print_nota(&k, &s).map_err(|e| e.to_string())
}

#[command]
pub fn cmd_pos_test_print() -> Result<(), String> {
    let s = db::get_pos_settings().map_err(|e| e.to_string())?;
    crate::pos_print::test_print(&s).map_err(|e| e.to_string())
}
