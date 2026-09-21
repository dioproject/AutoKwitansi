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

/// Build ESC/POS byte array for a single kwitansi nota
fn build_escpos_nota(k: &Kwitansi, paper_width: i32) -> Vec<u8> {
    let max_chars = if paper_width >= 80 { 48 } else { 32 };
    let mut buf = Vec::new();

    // School header (center)
    buf.extend_from_slice(ESC_ALIGN_CENTER);
    buf.extend_from_slice(ESC_BOLD_ON);
    let header = truncate_per_line(&sanitize_ascii("KWITANSI"), max_chars);
    buf.extend_from_slice(header.as_bytes());
    buf.extend_from_slice(LF);
    buf.extend_from_slice(ESC_BOLD_OFF);

    // Spacing
    buf.extend_from_slice(LF);

    // No: BPU/BNU
    buf.extend_from_slice(ESC_ALIGN_LEFT);
    let label = label_nomor_cetak(&k.nomor_kwitansi);
    let no_line = format!("No: {}", sanitize_ascii(&label));
    buf.extend_from_slice(truncate_per_line(&no_line, max_chars).as_bytes());
    buf.extend_from_slice(LF);

    // Spacing
    buf.extend_from_slice(LF);

    // Sudah terima dari
    let sudah = format!("Sudah terima dari {}", sanitize_ascii(&k.sudah_terima_dari));
    buf.extend_from_slice(truncate_per_line(&sudah, max_chars).as_bytes());
    buf.extend_from_slice(LF);

    // Sejumlah
    let terbilang_str = &k.terbilang;
    let terbilang_trunc = truncate_per_line(&sanitize_ascii(terbilang_str), max_chars - 2);
    let jumlah_str = format_currency(k.jumlah);
    let sejumlah = format!("Sejumlah Rp {}", sanitize_ascii(&jumlah_str));
    buf.extend_from_slice(truncate_per_line(&sejumlah, max_chars).as_bytes());
    buf.extend_from_slice(LF);

    // Terbilang line
    let terb_line = format!("  ({})", sanitize_ascii(&terbilang_trunc));
    buf.extend_from_slice(terb_line.as_bytes());
    buf.extend_from_slice(LF);

    // Spacing
    buf.extend_from_slice(LF);

    // Untuk pembayaran
    let pembayaran = format!("Untuk pembayaran {}", sanitize_ascii(&k.untuk_pembayaran));
    buf.extend_from_slice(truncate_per_line(&pembayaran, max_chars).as_bytes());
    buf.extend_from_slice(LF);

    // PPh 21 block (honorarium only)
    if k.kena_pph21 {
        buf.extend_from_slice(LF);
        let bruto = k.jumlah;
        let pph = bruto * 0.06;
        let netto = bruto - pph;
        let bruto_str = format_currency(bruto);
        let pph_str = format_currency(pph);
        let netto_str = format_currency(netto);

        buf.extend_from_slice(ESC_ALIGN_LEFT);
        buf.extend_from_slice(
            truncate_per_line(
                &format!("Bruto    : Rp {}", sanitize_ascii(&bruto_str)),
                max_chars,
            )
            .as_bytes(),
        );
        buf.extend_from_slice(LF);
        buf.extend_from_slice(
            truncate_per_line(
                &format!("PPh 21 6%: Rp {}", sanitize_ascii(&pph_str)),
                max_chars,
            )
            .as_bytes(),
        );
        buf.extend_from_slice(LF);

        buf.extend_from_slice(ESC_BOLD_ON);
        buf.extend_from_slice(
            truncate_per_line(
                &format!("Netto    : Rp {}", sanitize_ascii(&netto_str)),
                max_chars,
            )
            .as_bytes(),
        );
        buf.extend_from_slice(ESC_BOLD_OFF);
        buf.extend_from_slice(LF);
    }

    // Spacing
    buf.extend_from_slice(LF);

    // Penerima + Tgl
    buf.extend_from_slice(ESC_ALIGN_LEFT);
    let penerima_line = format!("Penerima : {}", sanitize_ascii(&k.penerima));
    buf.extend_from_slice(truncate_per_line(&penerima_line, max_chars).as_bytes());
    buf.extend_from_slice(LF);

    // Format tanggal: "21 Juni 2026"
    let tgl_formatted = format_tanggal_cetak(&k.tanggal);
    let tgl_line = format!("Tgl      : {}", sanitize_ascii(&tgl_formatted));
    buf.extend_from_slice(truncate_per_line(&tgl_line, max_chars).as_bytes());
    buf.extend_from_slice(LF);

    // Spacing before signatures
    buf.extend_from_slice(LF);

    // Bendahara
    buf.extend_from_slice(ESC_ALIGN_LEFT);
    let bend = format!("Bendahara: {}", sanitize_ascii(&k.bendahara));
    buf.extend_from_slice(truncate_per_line(&bend, max_chars).as_bytes());
    buf.extend_from_slice(LF);
    let nip_bend = format!("NIP      : {}", sanitize_ascii(&k.nip_bendahara));
    buf.extend_from_slice(truncate_per_line(&nip_bend, max_chars).as_bytes());
    buf.extend_from_slice(LF);

    // Spacing
    buf.extend_from_slice(LF);

    // Mengetahui
    let mgt = format!("Mengetahui: {}", sanitize_ascii(&k.mengetahui));
    buf.extend_from_slice(truncate_per_line(&mgt, max_chars).as_bytes());
    buf.extend_from_slice(LF);
    let nip_mgt = format!("NIP       : {}", sanitize_ascii(&k.nip_mengetahui));
    buf.extend_from_slice(truncate_per_line(&nip_mgt, max_chars).as_bytes());
    buf.extend_from_slice(LF);

    // Spacing
    buf.extend_from_slice(LF);
    buf.extend_from_slice(LF);

    // Feed + cut
    buf.extend_from_slice(&[0x1B, 0x64, 0x05]); // Feed 5 lines
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

    let bytes = build_escpos_nota(kwitansi, settings.paper_width);

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
