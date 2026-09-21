use crate::db;
use crate::models::{Kwitansi, PosSettings};

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

    // No (auto-generated nota number) & Tanggal
    buf.extend_from_slice(ESC_ALIGN_LEFT);
    let label = label_nomor_cetak(&k.nomor_kwitansi);
    buf.extend_from_slice(line(&format!("No   : {}/{}", label, nota_number)).as_bytes());
    buf.extend_from_slice(LF);
    let tgl_fmt = format_tanggal_cetak(&k.tanggal);
    buf.extend_from_slice(line(&format!("Tgl  : {}", tgl_fmt)).as_bytes());
    buf.extend_from_slice(LF);
    buf.extend_from_slice(line(&sep).as_bytes());
    buf.extend_from_slice(LF);

    // ══════════════════════════
    // ITEMS — dari uraian kwitansi
    // ══════════════════════════
    let uraian = &k.untuk_pembayaran;
    let items: Vec<&str> = uraian.lines().filter(|l| !l.trim().is_empty()).collect();
    if items.len() > 1 {
        // Multi-line: show as item list
        buf.extend_from_slice(ESC_BOLD_ON);
        buf.extend_from_slice(line("ITEM").as_bytes());
        buf.extend_from_slice(ESC_BOLD_OFF);
        buf.extend_from_slice(LF);
        for item in &items {
            buf.extend_from_slice(line(&format!("  {}", item.trim())).as_bytes());
            buf.extend_from_slice(LF);
        }
    } else {
        // Single item
        buf.extend_from_slice(ESC_BOLD_ON);
        buf.extend_from_slice(line("ITEM").as_bytes());
        buf.extend_from_slice(ESC_BOLD_OFF);
        buf.extend_from_slice(LF);
        let item_text = if items.is_empty() {
            "-"
        } else {
            items[0].trim()
        };
        buf.extend_from_slice(line(&format!("  {}", item_text)).as_bytes());
        buf.extend_from_slice(LF);
    }
    buf.extend_from_slice(line(&sep).as_bytes());
    buf.extend_from_slice(LF);

    // ══════════════════════════
    // TOTAL
    // ══════════════════════════
    buf.extend_from_slice(ESC_BOLD_ON);
    let total = format_currency(k.jumlah);
    let total_line = format!("TOTAL  : Rp {}", total);
    let pad = max_chars.saturating_sub(total_line.len());
    buf.extend_from_slice(line(&format!("{}{}", " ".repeat(pad), total_line)).as_bytes());
    buf.extend_from_slice(ESC_BOLD_OFF);
    buf.extend_from_slice(LF);

    // PPh 21 block (honorarium only)
    if k.kena_pph21 {
        let bruto = k.jumlah;
        let pph = (bruto * 0.06).round() as i64;
        let netto = bruto as i64 - pph;
        buf.extend_from_slice(line(&format!("Bruto  : Rp {}", format_currency(bruto))).as_bytes());
        buf.extend_from_slice(LF);
        buf.extend_from_slice(
            line(&format!("PPh 6% : Rp {}", format_currency(pph as f64))).as_bytes(),
        );
        buf.extend_from_slice(LF);
        buf.extend_from_slice(ESC_BOLD_ON);
        buf.extend_from_slice(
            line(&format!("NETTO  : Rp {}", format_currency(netto as f64))).as_bytes(),
        );
        buf.extend_from_slice(ESC_BOLD_OFF);
        buf.extend_from_slice(LF);
    }
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

// ============ HELPER: LABEL NOMOR CETAK ============

/// "BPU/07.12.04/001" -> "BPU", "BNU/07.12.04/001" -> "BNU", other -> as-is
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

/// "2026-06-21" -> "21 Juni 2026"
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
    let parts: Vec<&str> = tanggal.split('-').collect();
    if parts.len() == 3 {
        let year = parts[0];
        let month: u32 = parts[1].parse().unwrap_or(1);
        let day: u32 = parts[2].parse().unwrap_or(1);
        let month_name = if (month as usize) < months.len() {
            months[month as usize]
        } else {
            parts[1]
        };
        format!("{} {} {}", day, month_name, year)
    } else {
        tanggal.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
