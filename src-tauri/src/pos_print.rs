use crate::db;
use crate::models::{Kwitansi, Penjualan, PosSettings};

// ============ SETTINGS ============

pub fn get_pos_settings() -> Result<PosSettings, String> {
    db::get_pos_settings().map_err(|e| e.to_string())
}

pub fn save_pos_settings(settings: &PosSettings) -> Result<(), String> {
    db::save_pos_settings(settings).map_err(|e| e.to_string())
}

// ============ ESC/POS COMMANDS ============

const ESC_ALIGN_CENTER: &[u8] = &[0x1B, 0x61, 0x01];
const ESC_ALIGN_LEFT: &[u8] = &[0x1B, 0x61, 0x00];
const ESC_BOLD_ON: &[u8] = &[0x1B, 0x45, 0x01];
const ESC_BOLD_OFF: &[u8] = &[0x1B, 0x45, 0x00];
const GS_CUT: &[u8] = &[0x1D, 0x56, 0x01];
const LF: &[u8] = &[0x0A];

fn sanitize_ascii(s: &str) -> String {
    s.chars()
        .map(|c| if c.is_ascii() { c } else { '?' })
        .collect()
}

fn truncate_per_line(s: &str, max_chars: usize) -> String {
    let lines: Vec<&str> = s.split('\n').collect();
    let mut result = Vec::new();
    for line in lines {
        let truncated: String = line.chars().take(max_chars).collect();
        result.push(truncated);
    }
    result.join("\n")
}

fn format_currency(val: f64) -> String {
    // Format with thousand separator
    let formatted = format!("{:.*}", 0, val);
    let mut result = String::new();
    let chars: Vec<char> = formatted.chars().rev().collect();
    for (i, c) in chars.iter().enumerate() {
        if i > 0 && i % 3 == 0 {
            result.push('.');
        }
        result.push(*c);
    }
    result.chars().rev().collect()
}

/// Build ESC/POS byte array for a single nota POS as store receipt
/// Content is distinct from kwitansi: uses toko data as header, auto-generated nota number
fn build_escpos_nota(k: &Kwitansi, settings: &PosSettings, nota_number: &str) -> Vec<u8> {
    let paper_width = settings.paper_width;
    let max_chars = if paper_width >= 80 { 48 } else { 32 };
    let line = |s: &str| truncate_per_line(&sanitize_ascii(s), max_chars);
    let sep = "─".repeat(max_chars);
    let double_sep = "═".repeat(max_chars);

    let mut buf = Vec::new();

    // ══════════════════════════
    // HEADER — data toko (BPU) atau custom text
    // ══════════════════════════
    buf.extend_from_slice(ESC_ALIGN_CENTER);

    let has_toko = !k.nama_toko.trim().is_empty();
    let custom_header = settings.header_text.trim();

    if !custom_header.is_empty() {
        // User-defined custom header
        for hline in custom_header.lines() {
            buf.extend_from_slice(line(hline).as_bytes());
            buf.extend_from_slice(LF);
        }
    } else if has_toko {
        // BPU: show toko as store header
        buf.extend_from_slice(ESC_BOLD_ON);
        buf.extend_from_slice(line(&k.nama_toko).as_bytes());
        buf.extend_from_slice(LF);
        buf.extend_from_slice(ESC_BOLD_OFF);
        if !k.alamat_toko.trim().is_empty() {
            buf.extend_from_slice(line(&k.alamat_toko).as_bytes());
            buf.extend_from_slice(LF);
        }
        if !k.pimpinan_toko.trim().is_empty() {
            buf.extend_from_slice(line(&format!("Pimp: {}", k.pimpinan_toko)).as_bytes());
            buf.extend_from_slice(LF);
        }
    } else {
        // Fallback: simple header
        buf.extend_from_slice(ESC_BOLD_ON);
        buf.extend_from_slice(line("NOTA PEMBAYARAN").as_bytes());
        buf.extend_from_slice(LF);
        buf.extend_from_slice(ESC_BOLD_OFF);
    }
    buf.extend_from_slice(line(&double_sep).as_bytes());
    buf.extend_from_slice(LF);

    // No (auto-generated, tanpa label BPU/BNU) & Tanggal
    buf.extend_from_slice(ESC_ALIGN_LEFT);
    buf.extend_from_slice(line(&format!("No   : {}", nota_number)).as_bytes());
    buf.extend_from_slice(LF);
    let tgl_fmt = format_tanggal_cetak(&k.tanggal);
    buf.extend_from_slice(line(&format!("Tgl  : {}", tgl_fmt)).as_bytes());
    buf.extend_from_slice(LF);
    buf.extend_from_slice(line(&sep).as_bytes());
    buf.extend_from_slice(LF);

    // ══════════════════════════
    // ITEM — kalimat gabungan uraian + kode rekening + tahun anggaran
    // ══════════════════════════
    buf.extend_from_slice(ESC_BOLD_ON);
    buf.extend_from_slice(line("ITEM").as_bytes());
    buf.extend_from_slice(ESC_BOLD_OFF);
    buf.extend_from_slice(LF);
    let kalimat = compose_payment_sentence(k);
    for wl in wrap_text(&kalimat, max_chars.saturating_sub(4).max(10)) {
        buf.extend_from_slice(line(&format!("  {}", wl)).as_bytes());
        buf.extend_from_slice(LF);
    }
    buf.extend_from_slice(line(&sep).as_bytes());
    buf.extend_from_slice(LF);

    // ══════════════════════════
    // TOTAL — total bayar (bruto − PPh + PPN nominal opsional)
    // ══════════════════════════
    let (pph_label, pph_rate): (&str, f64) = if k.kena_pph21 {
        ("PPh 21 6%", 0.06)
    } else if k.kena_pph21_5 {
        ("PPh 21 5%", 0.05)
    } else if k.kena_pph23 {
        ("PPh 23 4%", 0.04)
    } else if k.kena_pph23_2 {
        ("PPh 23 2%", 0.02)
    } else {
        ("", 0.0)
    };
    let pph: f64 = (k.jumlah * pph_rate).round();
    let ppn: f64 = if k.ppn_nominal > 0.0 {
        k.ppn_nominal.round()
    } else {
        0.0
    };
    let netto = k.jumlah - pph - ppn;
    if pph_rate > 0.0 {
        buf.extend_from_slice(
            line(&format!("Bruto  : Rp {}", format_currency(k.jumlah))).as_bytes(),
        );
        buf.extend_from_slice(LF);
        buf.extend_from_slice(
            line(&format!("{} : Rp {}", pph_label, format_currency(pph))).as_bytes(),
        );
        buf.extend_from_slice(LF);
    }
    if ppn > 0.0 {
        buf.extend_from_slice(line(&format!("PPN    : - Rp {}", format_currency(ppn))).as_bytes());
        buf.extend_from_slice(LF);
    }
    buf.extend_from_slice(ESC_BOLD_ON);
    let total_line = format!("TOTAL  : Rp {}", format_currency(netto));
    let pad = max_chars.saturating_sub(total_line.len());
    buf.extend_from_slice(line(&format!("{}{}", " ".repeat(pad), total_line)).as_bytes());
    buf.extend_from_slice(ESC_BOLD_OFF);
    buf.extend_from_slice(LF);
    buf.extend_from_slice(line(&sep).as_bytes());
    buf.extend_from_slice(LF);

    // ══════════════════════════
    // PENERIMA (yang menerima uang, bukan bendahara)
    // ══════════════════════════
    buf.extend_from_slice(line(&format!("Penerima: {}", k.penerima)).as_bytes());
    buf.extend_from_slice(LF);

    buf.extend_from_slice(line(&sep).as_bytes());
    buf.extend_from_slice(LF);

    // ══════════════════════════
    // FOOTER (customizable)
    // ══════════════════════════
    let footer_raw = settings.footer_text.trim();
    buf.extend_from_slice(ESC_ALIGN_CENTER);
    if !footer_raw.is_empty() {
        for fline in footer_raw.lines() {
            buf.extend_from_slice(line(fline).as_bytes());
            buf.extend_from_slice(LF);
        }
    } else {
        buf.extend_from_slice(line("Terima kasih").as_bytes());
        buf.extend_from_slice(LF);
    }

    // Feed + cut
    buf.extend_from_slice(LF);
    buf.extend_from_slice(&[0x1B, 0x64, 0x03]); // Feed 3 lines
    buf.extend_from_slice(GS_CUT);

    buf
}

/// Build a simple test print page
fn build_test_print(paper_width: i32) -> Vec<u8> {
    let max_chars = if paper_width >= 80 { 48 } else { 32 };
    let mut buf = Vec::new();

    buf.extend_from_slice(ESC_ALIGN_CENTER);
    buf.extend_from_slice(ESC_BOLD_ON);
    let title = truncate_per_line("TEST PRINT", max_chars);
    buf.extend_from_slice(title.as_bytes());
    buf.extend_from_slice(ESC_BOLD_OFF);
    buf.extend_from_slice(LF);
    buf.extend_from_slice(LF);

    buf.extend_from_slice(ESC_ALIGN_LEFT);
    let msg = truncate_per_line("Printer POS OK", max_chars);
    buf.extend_from_slice(msg.as_bytes());
    buf.extend_from_slice(LF);
    buf.extend_from_slice(LF);

    buf.extend_from_slice(ESC_ALIGN_CENTER);
    let now = chrono::Local::now().format("%d %B %Y %H:%M").to_string();
    buf.extend_from_slice(sanitize_ascii(&now).as_bytes());
    buf.extend_from_slice(LF);
    buf.extend_from_slice(LF);

    buf.extend_from_slice(&[0x1B, 0x64, 0x03]);
    buf.extend_from_slice(GS_CUT);

    buf
}

// ============ PUBLIC API ============

fn send_bytes(settings: &PosSettings, bytes: &[u8], ctx: &str) -> Result<(), String> {
    if settings.port.is_empty() {
        return Err("Port printer belum diatur".into());
    }
    match serialport::new(&settings.port, settings.baud_rate as u32)
        .timeout(std::time::Duration::from_secs(5))
        .open()
    {
        Ok(mut port) => {
            port.write_all(bytes)
                .map_err(|e| format!("Gagal kirim {} ke printer: {}", ctx, e))?;
            port.flush()
                .map_err(|e| format!("Gagal flush printer: {}", e))?;
            Ok(())
        }
        Err(e) => Err(format!("Tidak bisa buka port {}: {}", settings.port, e)),
    }
}

/// Struk nota toko untuk penjualan POS kasir (mandiri, bukan kwitansi).
/// Header: custom header_text → nama_toko/alamat → "NOTA PEMBAYARAN".
fn build_escpos_struk(p: &Penjualan, settings: &PosSettings) -> Vec<u8> {
    let paper_width = settings.paper_width;
    let max_chars = if paper_width >= 80 { 48 } else { 32 };
    let line = |s: &str| truncate_per_line(&sanitize_ascii(s), max_chars);
    let sep = "-".repeat(max_chars);
    let double_sep = "=".repeat(max_chars);
    // "kiri .... kanan" dalam satu baris
    let row_2col = |left: &str, right: &str| -> String {
        let l: String = sanitize_ascii(left).chars().take(max_chars).collect();
        let r: String = sanitize_ascii(right).chars().take(max_chars).collect();
        if l.len() + 1 + r.len() <= max_chars {
            format!("{}{}{}", l, " ".repeat(max_chars - l.len() - r.len()), r)
        } else {
            format!("{} {}", l, r)
        }
    };

    let mut buf = Vec::new();

    // HEADER toko
    buf.extend_from_slice(ESC_ALIGN_CENTER);
    let custom_header = settings.header_text.trim();
    if !custom_header.is_empty() {
        for hline in custom_header.lines() {
            buf.extend_from_slice(line(hline).as_bytes());
            buf.extend_from_slice(LF);
        }
    } else if !p.nama_toko.trim().is_empty() {
        buf.extend_from_slice(ESC_BOLD_ON);
        buf.extend_from_slice(line(&p.nama_toko).as_bytes());
        buf.extend_from_slice(LF);
        buf.extend_from_slice(ESC_BOLD_OFF);
        if !p.alamat_toko.trim().is_empty() {
            buf.extend_from_slice(line(&p.alamat_toko).as_bytes());
            buf.extend_from_slice(LF);
        }
        if !p.pimpinan_toko.trim().is_empty() {
            buf.extend_from_slice(line(&format!("Telp: {}", p.pimpinan_toko)).as_bytes());
            buf.extend_from_slice(LF);
        }
    } else {
        buf.extend_from_slice(ESC_BOLD_ON);
        buf.extend_from_slice(line("NOTA PEMBAYARAN").as_bytes());
        buf.extend_from_slice(LF);
        buf.extend_from_slice(ESC_BOLD_OFF);
    }
    buf.extend_from_slice(line(&double_sep).as_bytes());
    buf.extend_from_slice(LF);

    // No & Tanggal
    buf.extend_from_slice(ESC_ALIGN_LEFT);
    buf.extend_from_slice(line(&format!("No  : {}", p.no_nota)).as_bytes());
    buf.extend_from_slice(LF);
    buf.extend_from_slice(line(&format!("Tgl : {}", format_tanggal_cetak(&p.tanggal))).as_bytes());
    buf.extend_from_slice(LF);
    buf.extend_from_slice(line(&sep).as_bytes());
    buf.extend_from_slice(LF);

    // ITEMS
    let mut subtotal = 0.0;
    for it in &p.items {
        let sub = (it.harga * it.qty as f64).round();
        subtotal += sub;
        for wl in wrap_text(&it.nama, max_chars) {
            buf.extend_from_slice(line(&wl).as_bytes());
            buf.extend_from_slice(LF);
        }
        let kiri = format!("  {} x {}", it.qty, format_currency(it.harga));
        buf.extend_from_slice(line(&row_2col(&kiri, &format_currency(sub))).as_bytes());
        buf.extend_from_slice(LF);
    }
    buf.extend_from_slice(line(&sep).as_bytes());
    buf.extend_from_slice(LF);

    // TOTAL
    let diskon = p.diskon.max(0.0).min(subtotal);
    let total = subtotal - diskon;
    buf.extend_from_slice(
        line(&row_2col(
            "Subtotal",
            &format!("Rp {}", format_currency(subtotal)),
        ))
        .as_bytes(),
    );
    buf.extend_from_slice(LF);
    if diskon > 0.0 {
        buf.extend_from_slice(
            line(&row_2col(
                "Diskon",
                &format!("-Rp {}", format_currency(diskon)),
            ))
            .as_bytes(),
        );
        buf.extend_from_slice(LF);
    }
    buf.extend_from_slice(ESC_BOLD_ON);
    buf.extend_from_slice(
        line(&row_2col(
            "TOTAL",
            &format!("Rp {}", format_currency(total)),
        ))
        .as_bytes(),
    );
    buf.extend_from_slice(ESC_BOLD_OFF);
    buf.extend_from_slice(LF);
    buf.extend_from_slice(
        line(&row_2col(
            "Tunai",
            &format!("Rp {}", format_currency(p.tunai)),
        ))
        .as_bytes(),
    );
    buf.extend_from_slice(LF);
    buf.extend_from_slice(
        line(&row_2col(
            "Kembali",
            &format!("Rp {}", format_currency(p.kembalian)),
        ))
        .as_bytes(),
    );
    buf.extend_from_slice(LF);
    buf.extend_from_slice(line(&sep).as_bytes());
    buf.extend_from_slice(LF);

    if !p.penerima.trim().is_empty() {
        buf.extend_from_slice(line(&format!("Kasir: {}", p.penerima)).as_bytes());
        buf.extend_from_slice(LF);
        buf.extend_from_slice(line(&sep).as_bytes());
        buf.extend_from_slice(LF);
    }

    // FOOTER
    let footer_raw = settings.footer_text.trim();
    buf.extend_from_slice(ESC_ALIGN_CENTER);
    if !footer_raw.is_empty() {
        for fline in footer_raw.lines() {
            buf.extend_from_slice(line(fline).as_bytes());
            buf.extend_from_slice(LF);
        }
    } else {
        buf.extend_from_slice(line("Terima kasih").as_bytes());
        buf.extend_from_slice(LF);
    }

    buf.extend_from_slice(LF);
    buf.extend_from_slice(&[0x1B, 0x64, 0x03]);
    buf.extend_from_slice(GS_CUT);

    buf
}

/// Print struk penjualan POS kasir ke printer thermal
pub fn print_penjualan(penjualan: &Penjualan, settings: &PosSettings) -> Result<(), String> {
    let bytes = build_escpos_struk(penjualan, settings);
    send_bytes(settings, &bytes, "struk penjualan")
}

/// Print kwitansi nota directly to POS thermal printer via ESC/POS
pub fn print_nota(kwitansi: &Kwitansi, settings: &PosSettings) -> Result<(), String> {
    if settings.port.is_empty() {
        return Err("Port printer belum diatur".into());
    }

    let nota_number = db::generate_pos_number()
        .unwrap_or_else(|_| format!("{:06}", rand::random::<u32>() % 1000000));
    let bytes = build_escpos_nota(kwitansi, settings, &nota_number);

    match serialport::new(&settings.port, settings.baud_rate as u32)
        .timeout(std::time::Duration::from_secs(5))
        .open()
    {
        Ok(mut port) => {
            port.write_all(&bytes)
                .map_err(|e| format!("Gagal kirim data ke printer: {}", e))?;
            port.flush()
                .map_err(|e| format!("Gagal flush printer: {}", e))?;
            Ok(())
        }
        Err(e) => Err(format!("Tidak bisa buka port {}: {}", settings.port, e)),
    }
}

/// Test print — send a test page
pub fn test_print(settings: &PosSettings) -> Result<(), String> {
    if settings.port.is_empty() {
        return Err("Port printer belum diatur".into());
    }

    let bytes = build_test_print(settings.paper_width);

    match serialport::new(&settings.port, settings.baud_rate as u32)
        .timeout(std::time::Duration::from_secs(5))
        .open()
    {
        Ok(mut port) => {
            port.write_all(&bytes)
                .map_err(|e| format!("Gagal kirim test print: {}", e))?;
            port.flush()
                .map_err(|e| format!("Gagal flush printer: {}", e))?;
            Ok(())
        }
        Err(e) => Err(format!("Tidak bisa buka port {}: {}", settings.port, e)),
    }
}

/// Gabung uraian + uraian resmi ARKAS + kode rekening + tahun anggaran
/// jadi 1 kalimat panjang yang natural.
/// Uraian resmi dilookup dari Kode-Rekening-ARKAS-2026-Lengkap.pdf
/// (kode_referensi.rs) berdasarkan kode kegiatan.
fn compose_payment_sentence(k: &Kwitansi) -> String {
    let raw = k
        .untuk_pembayaran
        .trim()
        .replace(|c: char| c == '\n' || c == '\r' || c == '\t', " ");
    let raw: String = raw.split_whitespace().collect::<Vec<_>>().join(" ");
    let raw = raw.trim_end_matches('.').trim().to_string();
    // Uraian resmi: coba kode kegiatan dulu, lalu kode rekening
    // (user kadang mengetik kode pendek di kolom kode rekening).
    let resmi: Option<&str> = crate::kode_referensi::lookup_uraian_kegiatan(&k.kode_kegiatan)
        .or_else(|| crate::kode_referensi::lookup_uraian_kegiatan(&k.kode_rekening));
    let raw_lower = raw.to_lowercase();
    let base = match resmi {
        Some(r) if !raw_lower.contains(&r.to_lowercase()) => {
            if raw.is_empty() {
                r.to_string()
            } else {
                format!("{} untuk {}", raw, r)
            }
        }
        _ => raw,
    };
    let kode = k.kode_rekening.trim();
    let tahun = k.tahun_anggaran.trim();
    let has_kode = !kode.is_empty() && !base.contains(kode);
    let has_tahun = !tahun.is_empty() && !base.contains(tahun);
    if base.is_empty() {
        if has_kode && has_tahun {
            return format!(
                "Dengan Kode Rekening {} pada Tahun Anggaran {}",
                kode, tahun
            );
        } else if has_kode {
            return format!("Dengan Kode Rekening {}", kode);
        } else if has_tahun {
            return format!("Pada Tahun Anggaran {}", tahun);
        }
        return "-".to_string();
    }
    if has_kode && has_tahun {
        format!(
            "{} dengan Kode Rekening {} pada Tahun Anggaran {}",
            base, kode, tahun
        )
    } else if has_kode {
        format!("{} dengan Kode Rekening {}", base, kode)
    } else if has_tahun {
        format!("{} pada Tahun Anggaran {}", base, tahun)
    } else {
        base
    }
}

/// Word-wrap teks ke lebar maksimum (per kata)
fn wrap_text(s: &str, width: usize) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut cur = String::new();
    for w in s.split_whitespace() {
        if cur.is_empty() {
            cur.push_str(w);
        } else if cur.len() + 1 + w.len() <= width {
            cur.push(' ');
            cur.push_str(w);
        } else {
            out.push(std::mem::take(&mut cur));
            cur.push_str(w);
        }
    }
    if !cur.is_empty() {
        out.push(cur);
    }
    if out.is_empty() {
        out.push("-".to_string());
    }
    out
}

// ============ HELPER: LABEL NOMOR CETAK ============

/// "BPU/07.12.04/001" -> "BPU", "BNU/07.12.04/001" -> "BNU", other -> as-is
/// Dipakai untuk label No pada cetak kwitansi (bukan nota POS).
#[allow(dead_code)]
pub fn label_nomor_cetak(nomor: &str) -> String {
    let upper = nomor.to_uppercase();
    if upper.contains("BNU") {
        "BNU".to_string()
    } else if upper.contains("BPU") {
        "BPU".to_string()
    } else {
        nomor.to_string()
    }
}

// ============ HELPER: FORMAT TANGGAL ============

/// "2026-06-21" atau "21-06-2026" (juga / dan .) -> "21 Juni 2026"
/// Hari tanpa nol depan ("01" -> "1"). Format tak dikenal dikembalikan apa adanya.
fn format_tanggal_cetak(tanggal: &str) -> String {
    let months = [
        "",
        "Januari",
        "Februari",
        "Maret",
        "April",
        "Mei",
        "Juni",
        "Juli",
        "Agustus",
        "September",
        "Oktober",
        "November",
        "Desember",
    ];
    let month_name = |m: u32| {
        if (m as usize) < months.len() && m >= 1 {
            months[m as usize].to_string()
        } else {
            m.to_string()
        }
    };
    let s = tanggal.trim();
    // Coba YYYY-MM-DD dulu (tahun 4 digit di depan)
    let norm = s.replace('/', "-").replace('.', "-");
    let parts: Vec<&str> = norm.split('-').collect();
    if parts.len() >= 3 {
        if parts[0].len() == 4 {
            // YYYY-MM-DD
            let year = parts[0];
            let month: u32 = parts[1].parse().unwrap_or(0);
            let day: u32 = parts[2].parse().unwrap_or(0);
            if month >= 1 && month <= 12 && day >= 1 {
                return format!("{} {} {}", day, month_name(month), year);
            }
        } else if parts[2].len() == 4 {
            // DD-MM-YYYY (format BKU/ARKAS)
            let day: u32 = parts[0].parse().unwrap_or(0);
            let month: u32 = parts[1].parse().unwrap_or(0);
            let year = parts[2];
            if month >= 1 && month <= 12 && day >= 1 {
                return format!("{} {} {}", day, month_name(month), year);
            }
        }
    }
    s.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{Penjualan, PenjualanItem};

    #[test]
    fn test_build_escpos_struk() {
        let p = Penjualan {
            id: None,
            no_nota: "20260924-1234".into(),
            tanggal: "2026-09-24".into(),
            total: 19000.0,
            diskon: 1000.0,
            tunai: 20000.0,
            kembalian: 1000.0,
            penerima: "Kasir".into(),
            nama_toko: "Toko Makmur".into(),
            alamat_toko: "Jl. Sudirman 1".into(),
            pimpinan_toko: "".into(),
            created_at: None,
            items: vec![PenjualanItem {
                id: None,
                penjualan_id: None,
                produk_id: 1,
                nama: "Pensil 2B".into(),
                harga: 5000.0,
                qty: 4,
                subtotal: 20000.0,
            }],
        };
        let settings = PosSettings {
            id: None,
            paper_width: 58,
            port: "".into(),
            baud_rate: 9600,
            header_text: "".into(),
            footer_text: "".into(),
            last_pos_number: 0,
        };
        let out = String::from_utf8_lossy(&build_escpos_struk(&p, &settings)).to_string();
        assert!(out.contains("Toko Makmur"), "header toko:\n{}", out);
        assert!(out.contains("20260924-1234"), "no nota:\n{}", out);
        assert!(out.contains("Pensil 2B"), "item:\n{}", out);
        assert!(out.contains("TOTAL"), "total:\n{}", out);
        assert!(out.contains("20.000"), "subtotal:\n{}", out);
        assert!(out.contains("Kembali"), "kembalian:\n{}", out);
    }

    #[test]
    fn test_label_nomor_cetak_bpu() {
        assert_eq!(label_nomor_cetak("BPU/07.12.04/001"), "BPU");
    }

    #[test]
    fn test_label_nomor_cetak_bnu() {
        assert_eq!(label_nomor_cetak("BNU/07.12.04/001"), "BNU");
    }

    #[test]
    fn test_label_nomor_cetak_other() {
        assert_eq!(label_nomor_cetak("ABC/001"), "ABC/001");
    }

    #[test]
    fn test_format_tanggal() {
        assert_eq!(format_tanggal_cetak("2026-06-21"), "21 Juni 2026");
        assert_eq!(format_tanggal_cetak("2026-01-01"), "1 Januari 2026");
        assert_eq!(format_tanggal_cetak("2026-12-31"), "31 Desember 2026");
        // Format BKU/ARKAS: DD-MM-YYYY
        assert_eq!(format_tanggal_cetak("21-06-2026"), "21 Juni 2026");
        assert_eq!(format_tanggal_cetak("01-01-2026"), "1 Januari 2026");
        assert_eq!(format_tanggal_cetak("05/02/2026"), "5 Februari 2026");
    }

    #[test]
    fn test_compose_payment_sentence() {
        use crate::models::Kwitansi;
        let k = Kwitansi {
            id: None,
            nomor_kwitansi: "BPU001".into(),
            tanggal: "2026-06-21".into(),
            sudah_terima_dari: "Bendahara".into(),
            jumlah: 1500000.0,
            terbilang: "".into(),
            untuk_pembayaran: "Pembelian ATK untuk kegiatan belajar".into(),
            kode_rekening: "5.1.02.01.01.0001".into(),
            tahun_anggaran: "2026".into(),
            bulan: "".into(),
            mengetahui: "".into(),
            nip_mengetahui: "".into(),
            bendahara: "".into(),
            nip_bendahara: "".into(),
            penerima: "".into(),
            nama_toko: "".into(),
            alamat_toko: "".into(),
            pimpinan_toko: "".into(),
            created_at: None,
            kena_pph21: false,
            kena_pph21_5: false,
            kena_pph23: false,
            kena_pph23_2: false,
            ppn_nominal: 0.0,
            kode_kegiatan: "".into(),
        };
        assert_eq!(
            compose_payment_sentence(&k),
            "Pembelian ATK untuk kegiatan belajar dengan Kode Rekening 5.1.02.01.01.0001 pada Tahun Anggaran 2026"
        );
    }

    #[test]
    fn test_lookup_kegiatan_dan_compose_resmi() {
        use crate::kode_referensi::{lookup_uraian_kegiatan, norm_kode};
        assert_eq!(norm_kode("07.12.04."), "07.12.04");
        assert_eq!(
            lookup_uraian_kegiatan("06.05.06"),
            Some("Konsumsi Rapat Kedinasan dan Tamu Sekolah (di luar kegiatan lain)")
        );
        assert_eq!(lookup_uraian_kegiatan("99.99.99"), None);
        use crate::models::Kwitansi;
        let k = Kwitansi {
            id: None,
            nomor_kwitansi: "BPU001".into(),
            tanggal: "2026-06-21".into(),
            sudah_terima_dari: "Bendahara".into(),
            jumlah: 1500000.0,
            terbilang: "".into(),
            untuk_pembayaran: "Belanja snack rapat".into(),
            kode_rekening: "5.1.02.01.01.0001".into(),
            tahun_anggaran: "2026".into(),
            bulan: "".into(),
            mengetahui: "".into(),
            nip_mengetahui: "".into(),
            bendahara: "".into(),
            nip_bendahara: "".into(),
            penerima: "".into(),
            nama_toko: "".into(),
            alamat_toko: "".into(),
            pimpinan_toko: "".into(),
            created_at: None,
            kena_pph21: false,
            kena_pph21_5: false,
            kena_pph23: false,
            kena_pph23_2: false,
            ppn_nominal: 0.0,
            kode_kegiatan: "06.05.06".into(),
        };
        let s = compose_payment_sentence(&k);
        assert!(s.contains("Belanja snack rapat untuk Konsumsi Rapat Kedinasan dan Tamu Sekolah (di luar kegiatan lain)"), "got: {}", s);
        assert!(
            s.contains("dengan Kode Rekening 5.1.02.01.01.0001 pada Tahun Anggaran 2026"),
            "got: {}",
            s
        );
    }

    #[test]
    fn test_sanitize_ascii() {
        assert_eq!(sanitize_ascii("Hello"), "Hello");
        assert_eq!(sanitize_ascii("Héllo"), "H?llo");
    }

    #[test]
    fn test_format_currency() {
        assert_eq!(format_currency(1000000.0), "1.000.000");
        assert_eq!(format_currency(50000.5), "50.000");
    }

    #[test]
    fn test_pajak_rate_dan_netto() {
        use crate::commands::{is_makan_pph23, netto_pajak, pajak_rate, total_netto};
        assert_eq!(pajak_rate(true, false, false, false), 0.06);
        assert_eq!(pajak_rate(false, true, false, false), 0.05);
        assert_eq!(pajak_rate(false, false, true, false), 0.04);
        assert_eq!(pajak_rate(false, false, false, true), 0.02);
        assert_eq!(pajak_rate(false, false, false, false), 0.0);
        assert_eq!(pajak_rate(true, true, true, true), 0.06); // PPh 21 6% didahulukan
        assert_eq!(pajak_rate(false, true, true, true), 0.05); // lalu 5%
        assert_eq!(
            netto_pajak(1_000_000.0, false, false, true, false),
            960_000.0
        );
        assert_eq!(
            netto_pajak(1_000_000.0, false, true, false, false),
            950_000.0
        );
        assert_eq!(
            netto_pajak(1_000_000.0, false, false, false, true),
            980_000.0
        );
        assert_eq!(
            netto_pajak(1_000_000.0, true, false, false, false),
            940_000.0
        );
        assert_eq!(
            netto_pajak(1_000_000.0, false, false, false, false),
            1_000_000.0
        );
        assert_eq!(
            total_netto(1_000_000.0, false, false, false, false, 0.0),
            1_000_000.0
        );
        assert_eq!(
            total_netto(1_000_000.0, false, false, false, false, 110_000.0),
            890_000.0
        );
        assert_eq!(
            total_netto(1_000_000.0, false, false, true, false, 110_000.0),
            850_000.0
        );
        assert_eq!(
            total_netto(1_000_000.0, true, false, false, false, 0.0),
            940_000.0
        );
        assert_eq!(
            total_netto(2_000_000.0, false, true, false, false, 0.0),
            1_900_000.0
        );
        assert!(is_makan_pph23("", "", "Belanja makan dan minum rapat"));
        assert!(is_makan_pph23("", "", "Konsumsi kegiatan MPLS"));
        assert!(is_makan_pph23("", "", "Jasa catering acara wisuda"));
        assert!(!is_makan_pph23("", "", "Pembelian ATK"));
    }
}
