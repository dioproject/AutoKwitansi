use crate::db;
use crate::models::{
    BkuData, BkuPeriodItem, BpuDokumen, Kwitansi, PosSettings, PrintSettings, Sekolah,
};
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
    // Terbilang mengikuti total bayar (bruto − PPh − PPN opsional)
    sanitize_pajak(&mut kwitansi);
    kwitansi.terbilang = terbilang(total_netto(
        kwitansi.jumlah,
        kwitansi.kena_pph21,
        kwitansi.kena_pph21_5,
        kwitansi.kena_pph23,
        kwitansi.kena_pph23_2,
        kwitansi.ppn_nominal,
    ));
    db::insert_kwitansi(&kwitansi).map_err(|e| e.to_string())
}

#[command]
pub fn cmd_update_kwitansi(mut kwitansi: Kwitansi) -> Result<(), String> {
    let id = kwitansi.id.ok_or("ID kwitansi kosong".to_string())?;
    // Teks untuk_pembayaran sudah final dari user — jangan expand ulang.
    // Terbilang selalu dihitung ulang dari total bayar agar konsisten.
    sanitize_pajak(&mut kwitansi);
    kwitansi.terbilang = terbilang(total_netto(
        kwitansi.jumlah,
        kwitansi.kena_pph21,
        kwitansi.kena_pph21_5,
        kwitansi.kena_pph23,
        kwitansi.kena_pph23_2,
        kwitansi.ppn_nominal,
    ));
    db::update_kwitansi(id, &kwitansi).map_err(|e| e.to_string())
}

/// Tarif pajak: PPh 21 6% didahulukan, lalu PPh 21 5% (narasumber),
/// lalu PPh 23 4%, lalu PPh 23 2%
pub(crate) fn pajak_rate(
    kena_pph21: bool,
    kena_pph21_5: bool,
    kena_pph23: bool,
    kena_pph23_2: bool,
) -> f64 {
    if kena_pph21 {
        0.06
    } else if kena_pph21_5 {
        0.05
    } else if kena_pph23 {
        0.04
    } else if kena_pph23_2 {
        0.02
    } else {
        0.0
    }
}

/// Netto setelah potongan pajak (bruto jika tidak kena)
pub(crate) fn netto_pajak(
    jumlah: f64,
    kena_pph21: bool,
    kena_pph21_5: bool,
    kena_pph23: bool,
    kena_pph23_2: bool,
) -> f64 {
    jumlah - (jumlah * pajak_rate(kena_pph21, kena_pph21_5, kena_pph23, kena_pph23_2)).round()
}

/// Total bayar: bruto − PPh − PPN (PPN nominal rupiah opsional, 0 = nonaktif)
pub(crate) fn total_netto(
    jumlah: f64,
    kena_pph21: bool,
    kena_pph21_5: bool,
    kena_pph23: bool,
    kena_pph23_2: bool,
    ppn_nominal: f64,
) -> f64 {
    let pph = (jumlah * pajak_rate(kena_pph21, kena_pph21_5, kena_pph23, kena_pph23_2)).round();
    let ppn = if ppn_nominal > 0.0 {
        ppn_nominal.round()
    } else {
        0.0
    };
    jumlah - pph - ppn
}

/// Perbaiki terbilang basi: hitung ulang dari total terkini untuk semua baris.
/// Dijalankan tiap start agar "Uang sejumlah" selalu mengikuti total
/// (bruto − PPh − PPN) walau datanya ditulis oleh versi lama.
pub fn repair_terbilang() -> Result<usize, String> {
    let all = db::get_all_kwitansi().map_err(|e| e.to_string())?;
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    let mut fixed = 0;
    for k in &all {
        let id = match k.id {
            Some(id) => id,
            None => continue,
        };
        let expected = terbilang(total_netto(
            k.jumlah,
            k.kena_pph21,
            k.kena_pph21_5,
            k.kena_pph23,
            k.kena_pph23_2,
            k.ppn_nominal,
        ));
        if expected != k.terbilang {
            conn.execute(
                "UPDATE kwitansi SET terbilang=?1 WHERE id=?2",
                rusqlite::params![expected, id],
            )
            .map_err(|e| e.to_string())?;
            fixed += 1;
        }
    }
    Ok(fixed)
}
/// Normalisasi entri pajak dari frontend (PPh eksklusif + PPN wajar)
fn sanitize_pajak(k: &mut Kwitansi) {
    if k.kena_pph21 {
        k.kena_pph21_5 = false;
        k.kena_pph23 = false;
        k.kena_pph23_2 = false;
    } else if k.kena_pph21_5 {
        k.kena_pph23 = false;
        k.kena_pph23_2 = false;
    } else if k.kena_pph23 {
        k.kena_pph23_2 = false;
    }
    if k.ppn_nominal.is_nan() || k.ppn_nominal < 0.0 {
        k.ppn_nominal = 0.0;
    } else {
        k.ppn_nominal = k.ppn_nominal.round();
    }
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

/// Deteksi otomatis apakah transaksi makan minum kena PPh 23 4%.
/// Patokan: kode kegiatan 06.05.06 = Konsumsi Rapat Kedinasan dan Tamu
/// (Kode-Rekening-ARKAS-2026-Lengkap.pdf) + kata kunci uraian.
pub(crate) fn is_makan_pph23(no_bukti: &str, kode_kegiatan: &str, uraian: &str) -> bool {
    let _ = no_bukti;
    let kode = crate::kode_referensi::norm_kode(kode_kegiatan);
    if kode == "06.05.06" {
        return true;
    }
    let u = uraian.to_lowercase();
    u.contains("makan")
        || u.contains("minum")
        || u.contains("konsumsi")
        || u.contains("catering")
        || u.contains("katering")
        || u.contains("snack")
        || u.contains("jamuan")
}

/// Deteksi otomatis apakah transaksi honor kena PPh 21 6%.
/// Patokan kode kegiatan dari Kode-Rekening-ARKAS-2026-Lengkap.pdf:
/// seluruh rumpun 07.12.x = Pembayaran Honor.
pub(crate) fn is_honor_pph21(no_bukti: &str, kode_kegiatan: &str, uraian: &str) -> bool {
    let nomor = no_bukti.to_uppercase();
    let kode = crate::kode_referensi::norm_kode(kode_kegiatan).to_uppercase();
    let u = uraian.to_lowercase();
    nomor.contains("BNU")
        || kode.starts_with("07.12")
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
) -> Result<crate::models::ImportResult, String> {
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
