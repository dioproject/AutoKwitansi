use crate::models::{BkuData, BkuTransaction};
use regex::Regex;
use std::collections::BTreeMap;

pub fn parse_bku_pdf(file_path: &str) -> Result<BkuData, String> {
    // Read PDF and extract text
    let bytes = std::fs::read(file_path).map_err(|e| format!("Gagal membaca file: {}", e))?;
    let text = pdf_extract::extract_text_from_mem(&bytes)
        .map_err(|e| format!("Gagal mengekstrak teks dari PDF: {}", e))?;

    let lines: Vec<&str> = text.lines().collect();

    // Parse header info
    let header = parse_header(&lines)?;

    // Parse signature page info
    let signature = parse_signature(&lines);

    // Parse transactions
    let raw_transactions = parse_transactions(&lines)?;

    // Group transactions by no_bukti
    let grouped = group_transactions(raw_transactions);

    Ok(BkuData {
        bulan: header.bulan,
        tahun: header.tahun,
        nama_sekolah: header.nama_sekolah,
        alamat: header.alamat,
        kabupaten: header.kabupaten,
        kepala_sekolah: signature.kepala_sekolah,
        nip_kepala: signature.nip_kepala,
        bendahara: signature.bendahara,
        nip_bendahara: signature.nip_bendahara,
        tanggal_tutup: signature.tanggal_tutup,
        transactions: grouped,
    })
}

// ========== HEADER PARSING ==========

struct HeaderInfo {
    bulan: String,
    tahun: String,
    nama_sekolah: String,
    alamat: String,
    kabupaten: String,
}

fn parse_header(lines: &[&str]) -> Result<HeaderInfo, String> {
    let mut bulan = String::new();
    let mut tahun = String::new();
    let mut nama_sekolah = String::new();
    let mut alamat = String::new();
    let mut kabupaten = String::new();

    // pdf-extract output format may have labels and values on separate lines
    // e.g. "Nama Sekolah" on one line, ": SD NEGERI ..." on another
    // Or "BULAN : APRIL TAHUN : 2026" on one line
    let re_bulan = Regex::new(r"(?i)BULAN\s*:\s*(\w+)").unwrap();
    let re_tahun = Regex::new(r"(?i)TAHUN\s*:\s*(\d{4})").unwrap();

    // Join all lines into one text for more flexible matching
    let full_text = lines.join("\n");

    // Try to find BULAN and TAHUN
    if let Some(cap) = re_bulan.captures(&full_text) {
        bulan = cap[1].trim().to_string();
    }
    if let Some(cap) = re_tahun.captures(&full_text) {
        tahun = cap[1].trim().to_string();
    }

    // Find nama sekolah - look for ": SD" or ": SMP" etc patterns, or "Nama Sekolah" label
    // pdf-extract may output: "Nama Sekolah" then later ": SD NEGERI ..."
    let re_sekolah_inline = Regex::new(r"(?i)Nama\s+Sekolah\s*:\s*(.+)").unwrap();
    let re_sekolah_value = Regex::new(r":\s*((?:SD|SMP|SMA|SMK|TK|MI|MTS|MA)\s+.+)").unwrap();

    // Also try matching from BKU footer which always has "Nama Sekolah : XXX"
    let re_footer_sekolah = Regex::new(r"Nama Sekolah\s*:\s*(.+?)(?:\s*Halaman|\s*$)").unwrap();

    if let Some(cap) = re_sekolah_inline.captures(&full_text) {
        nama_sekolah = cap[1].trim().to_string();
    } else if let Some(cap) = re_footer_sekolah.captures(&full_text) {
        nama_sekolah = cap[1].trim().to_string();
    } else if let Some(cap) = re_sekolah_value.captures(&full_text) {
        nama_sekolah = cap[1].trim().to_string();
    }

    // Find alamat
    let re_val = Regex::new(r":\s*(.+)").unwrap();
    for (i, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        if trimmed.contains("Desa/Kecamatan") || trimmed.contains("Desa/Kec") {
            // Value might be on this line or the next
            if let Some(cap) = re_val.captures(trimmed) {
                alamat = cap[1].trim().to_string();
            } else if i + 1 < lines.len() {
                let next = lines[i + 1].trim();
                if let Some(cap) = re_val.captures(next) {
                    alamat = cap[1].trim().to_string();
                }
            }
        }
        if trimmed.contains("Kabupaten") {
            if let Some(cap) = re_val.captures(trimmed) {
                kabupaten = cap[1].trim().to_string();
            } else if i + 1 < lines.len() {
                let next = lines[i + 1].trim();
                if let Some(cap) = re_val.captures(next) {
                    kabupaten = cap[1].trim().to_string();
                }
            }
        }
    }

    // Also try to find alamat/kab from value-only lines starting with ":"
    for (i, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        if i > 0 {
            let prev = lines[i - 1].trim();
            if prev.contains("Desa/Kecamatan") && trimmed.starts_with(':') {
                alamat = trimmed.trim_start_matches(':').trim().to_string();
            }
            if prev.contains("Kabupaten") && trimmed.starts_with(':') {
                kabupaten = trimmed.trim_start_matches(':').trim().to_string();
            }
        }
    }

    if nama_sekolah.is_empty() {
        return Err(
            "Tidak dapat menemukan header BKU. Pastikan file adalah PDF BKU dari ARKAS."
                .to_string(),
        );
    }

    Ok(HeaderInfo {
        bulan,
        tahun,
        nama_sekolah,
        alamat,
        kabupaten,
    })
}

// ========== SIGNATURE PAGE PARSING ==========

struct SignatureInfo {
    kepala_sekolah: String,
    nip_kepala: String,
    bendahara: String,
    nip_bendahara: String,
    tanggal_tutup: String,
}

fn parse_signature(lines: &[&str]) -> SignatureInfo {
    let mut kepala_sekolah = String::new();
    let mut nip_kepala = String::new();
    let mut bendahara = String::new();
    let mut nip_bendahara = String::new();
    let mut tanggal_tutup = String::new();
    let re_tanggal_tutup =
        Regex::new(r"(\d{1,2}\s+\w+\s+\d{4})\s+Buku\s+Kas\s+Umum\s+Ditutup").unwrap();
    let re_tanggal_ttd = Regex::new(r"(?:Kec\.\s*[\w,]+\s*,?\s*)(\d{1,2}\s+\w+\s+\d{4})").unwrap();
    let re_nip = Regex::new(r"NIP[.\s:]+(\d+)").unwrap();
    let re_name =
        Regex::new(r"^([A-Z][A-Z\s,.']+(?:S\.Pd|M\.Pd|S\.E|M\.M|S\.Ag|M\.Si|S\.Sos)?)$").unwrap();

    let full_text = lines.join("\n");

    // Find tanggal tutup
    if let Some(cap) = re_tanggal_tutup.captures(&full_text) {
        tanggal_tutup = cap[1].trim().to_string();
    }
    if tanggal_tutup.is_empty() {
        if let Some(cap) = re_tanggal_ttd.captures(&full_text) {
            tanggal_tutup = cap[1].trim().to_string();
        }
    }

    // Find Kepala Sekolah and Bendahara names and NIPs
    // In pdf-extract output, the signature section looks like:
    // "Kepala Sekolah Kec. Yosowilangun, 30 April 2026"
    // "Bendahara,"
    // ""
    // "SAMAK BASAR, S.Pd"
    // ""
    // "NIP. 196702071993041001"
    // " MISNOADI, S.Pd"
    // ""
    // "NIP. 197102052006041016"

    let start = if lines.len() > 40 {
        lines.len() - 40
    } else {
        0
    };

    // Collect all NIP values and names from the signature section
    let mut names: Vec<String> = Vec::new();
    let mut nips: Vec<String> = Vec::new();

    for line in &lines[start..] {
        let trimmed = line.trim();
        if let Some(cap) = re_nip.captures(trimmed) {
            nips.push(cap[1].to_string());
        } else if let Some(cap) = re_name.captures(trimmed) {
            names.push(cap[1].trim().to_string());
        }
    }

    // First name = Kepala Sekolah, second = Bendahara (based on BKU layout)
    if !names.is_empty() {
        kepala_sekolah = names[0].clone();
    }
    if names.len() > 1 {
        bendahara = names[1].clone();
    }
    if !nips.is_empty() {
        nip_kepala = nips[0].clone();
    }
    if nips.len() > 1 {
        nip_bendahara = nips[1].clone();
    }

    SignatureInfo {
        kepala_sekolah,
        nip_kepala,
        bendahara,
        nip_bendahara,
        tanggal_tutup,
    }
}

// ========== TRANSACTION PARSING ==========

#[derive(Debug, Clone)]
struct RawTransaction {
    tanggal: String,
    kode_kegiatan: String,
    kode_rekening: String,
    no_bukti: String,
    uraian: String,
    pengeluaran: f64,
}

/// Parse transactions from pdf-extract output.
///
/// pdf-extract produces a very different layout from pdfplumber:
/// - Transaction line: "DD-MM-YYYY URAIAN  0 AMOUNT SALDOKODE_KEG. KODE_REK_PREFIX"
/// - Next line: "KODE_REK_SUFFIX NO_BUKTI"
///
/// Example:
/// ```text
/// 18-04-2026 Tagihan Listrik-(2026-2)  0 60.000 55.841.73206.07.01. 5.1.02.02.01.00
/// 61 BPU11
/// ```
fn parse_transactions(lines: &[&str]) -> Result<Vec<RawTransaction>, String> {
    let mut transactions: Vec<RawTransaction> = Vec::new();

    // Date pattern: DD-MM-YYYY at start of line
    let re_date = Regex::new(r"^(\d{2}-\d{2}-\d{4})\s+(.+)$").unwrap();
    let re_bukti_line = Regex::new(r"^(\d{1,4})\s+(B[A-Z]{1,3}\d+)\s*$").unwrap();
    let re_kode_rek_end =
        Regex::new(r"(\d{2}\.\d{2}\.\d{2}\.)\s*(5\.\d\.\d{2}\.\d{2}\.\d{2}\.\d{2})\s*$").unwrap();
    let _re_amounts = Regex::new(r"\b(\d{1,3}(?:\.\d{3})+)\b").unwrap();
    let re_kode_keg = Regex::new(r"(\d{2}\.\d{2}\.\d{2}\.)").unwrap();

    // Content to skip
    let skip_keywords = [
        "Saldo Bank",
        "Saldo Tunai",
        "Saldo Buku",
        "Tarik Tunai",
        "Setor Tunai",
        "Pergeseran Uang",
        "Bunga Bank",
        "Pajak Bunga",
        "Jumlah",
    ];

    let re_trailing_zero = Regex::new(r"\s+0\s*$").unwrap();
    let mut i = 0;
    while i < lines.len() {
        let line = lines[i].trim();

        // Skip empty lines and noise
        if line.is_empty()
            || line.starts_with("1 2 3")
            || line.contains("B U K U")
            || line.contains("Halaman")
        {
            i += 1;
            continue;
        }

        // Try to match a transaction line starting with a date
        if let Some(date_cap) = re_date.captures(line) {
            let tanggal = date_cap[1].to_string();
            let rest = date_cap[2].to_string();

            // Check if this line should be skipped
            let should_skip = skip_keywords.iter().any(|p| rest.contains(p))
                || rest.starts_with("Terima ")
                || rest.starts_with("Setor ")
                || rest.contains("SIPLah")
                || rest.contains("Terima PPh")
                || rest.contains("Setor PPh")
                || rest.contains("Terima PPN")
                || rest.contains("Setor PPN");

            if should_skip {
                i += 1;
                // Skip continuation lines (kode_rek suffix, SIPLah markers, etc.)
                while i < lines.len() {
                    let next = lines[i].trim();
                    if next.is_empty()
                        || re_bukti_line.is_match(next)
                        || (next.len() < 5 && next.chars().all(|c| c.is_ascii_digit() || c == ' '))
                        || next.contains("SIPLah")
                        || next.contains("(Transaksi")
                        || next.starts_with("kesehatan")
                    {
                        i += 1;
                    } else {
                        break;
                    }
                }
                continue;
            }

            // This might be a valid transaction
            // Check next non-empty line for No Bukti
            let mut next_idx = i + 1;
            // Skip uraian continuation lines (for multi-line uraian)
            let _extra_uraian_lines: Vec<String> = Vec::new();

            while next_idx < lines.len() {
                let next = lines[next_idx].trim();
                if next.is_empty() {
                    next_idx += 1;
                    continue;
                }
                break;
            }

            if next_idx < lines.len() {
                let next = lines[next_idx].trim();

                // Check if next line has the pattern: "XX BPUNN" (kode_rek_suffix + no_bukti)
                if let Some(bukti_cap) = re_bukti_line.captures(next) {
                    let kode_rek_suffix = &bukti_cap[1];
                    let no_bukti = bukti_cap[2].to_string();

                    // Extract kode_rekening from the END of the current line
                    let mut kode_rekening = String::new();
                    let mut kode_kegiatan = String::new();

                    if let Some(rek_cap) = re_kode_rek_end.captures(&rest) {
                        kode_kegiatan = rek_cap[1].to_string();
                        let rek_prefix = &rek_cap[2];
                        kode_rekening = format!("{}{}", rek_prefix, kode_rek_suffix);
                    } else {
                        // Try just kode_kegiatan
                        if let Some(keg_cap) = re_kode_keg.captures(&rest) {
                            kode_kegiatan = keg_cap[1].to_string();
                        }
                    }

                    // Extract uraian: everything between date and the amounts/kode at end
                    // Remove kode_kegiatan and kode_rekening from the end
                    let mut uraian = rest.clone();

                    // Remove the kode_keg + kode_rek suffix from the end
                    if let Some(rek_match) = re_kode_rek_end.find(&uraian) {
                        uraian = uraian[..rek_match.start()].to_string();
                    }

                    // Extract amounts (PENERIMAAN PENGELUARAN SALDO)
                    let amounts = extract_amounts_from_line(&uraian);

                    // Remove amounts from uraian
                    uraian = remove_amounts_from_end(&uraian);

                    // Also remove leading/trailing zeros used as penerimaan marker
                    uraian = uraian.trim().to_string();
                    // Remove trailing " 0" that represents penerimaan=0
                    uraian = re_trailing_zero.replace(&uraian, "").trim().to_string();

                    // Get pengeluaran (first amount in most cases)
                    let pengeluaran = extract_pengeluaran(&amounts);

                    if pengeluaran > 0.0 && !uraian.is_empty() {
                        transactions.push(RawTransaction {
                            tanggal: tanggal.clone(),
                            kode_kegiatan,
                            kode_rekening,
                            no_bukti,
                            uraian,
                            pengeluaran,
                        });
                    }

                    i = next_idx + 1;
                    continue;
                } else {
                    // Next line doesn't have no_bukti - might be multi-line uraian
                    // or a line without bukti (skip)
                }
            }
        }

        i += 1;
    }

    Ok(transactions)
}

/// Extract pengeluaran from parsed amounts.
/// In BKU format: PENERIMAAN PENGELUARAN SALDO
/// For expense lines: penerimaan=0, so amounts = [PENGELUARAN, SALDO]
/// We want the first (smaller) amount = pengeluaran
fn extract_pengeluaran(amounts: &[f64]) -> f64 {
    if amounts.len() >= 2 {
        // First amount is pengeluaran, second (larger) is saldo
        // The pengeluaran is always smaller than saldo
        if amounts[0] < amounts[1] {
            return amounts[0];
        }
        return amounts[1];
    }
    if amounts.len() == 1 {
        return amounts[0];
    }
    0.0
}

fn extract_amounts_from_line(line: &str) -> Vec<f64> {
    let mut amounts = Vec::new();

    // Match numbers that look like Indonesian-formatted amounts: 60.000 or 55.841.732
    let re = Regex::new(r"\b(\d{1,3}(?:\.\d{3})+)\b").unwrap();

    for cap in re.captures_iter(line) {
        let num_str = cap[1].replace('.', "");
        if let Ok(num) = num_str.parse::<f64>() {
            amounts.push(num);
        }
    }

    amounts
}

fn remove_amounts_from_end(line: &str) -> String {
    // Remove trailing amounts (numbers with dot separators or standalone 0)
    let re =
        Regex::new(r"\s+(?:\d{1,3}(?:\.\d{3})+|0)(?:\s+(?:\d{1,3}(?:\.\d{3})+|0))*\s*$").unwrap();
    re.replace(line, "").trim().to_string()
}

// ========== GROUPING ==========

fn group_transactions(transactions: Vec<RawTransaction>) -> Vec<BkuTransaction> {
    // Group by no_bukti
    let mut groups: BTreeMap<String, Vec<RawTransaction>> = BTreeMap::new();
    // Preserve insertion order with a separate list
    let mut order: Vec<String> = Vec::new();

    for tx in transactions {
        if !groups.contains_key(&tx.no_bukti) {
            order.push(tx.no_bukti.clone());
        }
        groups.entry(tx.no_bukti.clone()).or_default().push(tx);
    }

    let mut result = Vec::new();

    for no_bukti in &order {
        if let Some(items) = groups.get(no_bukti) {
            if items.is_empty() {
                continue;
            }

            // Use the first item's metadata
            let first = &items[0];
            let tanggal = first.tanggal.clone();
            let kode_kegiatan = first.kode_kegiatan.clone();
            let kode_rekening = first.kode_rekening.clone();

            // Combine uraian from all items (deduplicate)
            let mut uraian_parts: Vec<String> = Vec::new();
            let mut total_pengeluaran = 0.0;

            for item in items {
                total_pengeluaran += item.pengeluaran;
                let clean = item.uraian.trim().to_string();
                if !clean.is_empty() && !uraian_parts.contains(&clean) {
                    uraian_parts.push(clean);
                }
            }

            let uraian = uraian_parts.join(", ");

            // Try to extract penerima for honor-type items
            let penerima = extract_penerima(items);

            result.push(BkuTransaction {
                no_bukti: no_bukti.clone(),
                tanggal,
                kode_kegiatan,
                kode_rekening,
                uraian,
                pengeluaran: total_pengeluaran,
                penerima,
            });
        }
    }

    result
}

fn extract_penerima(items: &[RawTransaction]) -> String {
    // For honor-type items, the name is in the uraian followed by role in parentheses
    // Pattern: "Nama Lengkap (Role)" e.g. "Handrik Savitro (Penjaga Sekolah)"
    let re_name = Regex::new(
        r"^([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+)\s*\(((?:Penjaga|Non|Guru|Kepala|Pelatih|Instruktur|Pengawas|Operator|Tenaga|Honorer|GTT|PTT|Dapodik).+?)\)"
    ).unwrap();

    for item in items {
        if let Some(cap) = re_name.captures(&item.uraian) {
            return cap[1].trim().to_string();
        }
    }

    String::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_bku_pdf() {
        // Test with the actual BKU PDF file
        let pdf_path = concat!(env!("CARGO_MANIFEST_DIR"), "/../4. bku-output.pdf");

        let result = parse_bku_pdf(pdf_path);
        assert!(
            result.is_ok(),
            "Failed to parse BKU PDF: {:?}",
            result.err()
        );

        let data = result.unwrap();

        // Verify header
        println!("Bulan: {}", data.bulan);
        println!("Tahun: {}", data.tahun);
        println!("Nama Sekolah: {}", data.nama_sekolah);
        println!("Kepala Sekolah: {}", data.kepala_sekolah);
        println!("NIP Kepala: {}", data.nip_kepala);
        println!("Bendahara: {}", data.bendahara);
        println!("NIP Bendahara: {}", data.nip_bendahara);
        println!("Tanggal Tutup: {}", data.tanggal_tutup);

        assert!(
            !data.nama_sekolah.is_empty(),
            "Nama sekolah should not be empty"
        );
        assert!(!data.tahun.is_empty(), "Tahun should not be empty");

        // Verify transactions
        println!("\nTotal transaksi (grouped): {}", data.transactions.len());
        assert!(
            data.transactions.len() > 0,
            "Should have at least some transactions"
        );

        for tx in &data.transactions {
            println!(
                "  {} | {} | {} | {} | Rp {} | penerima: {}",
                tx.no_bukti, tx.tanggal, tx.kode_rekening, tx.uraian, tx.pengeluaran, tx.penerima
            );
        }

        // Verify some known transactions from the BKU
        // BPU11 = Tagihan Listrik
        let bpu11 = data.transactions.iter().find(|t| t.no_bukti == "BPU11");
        assert!(bpu11.is_some(), "BPU11 should exist");
        let bpu11 = bpu11.unwrap();
        assert!(
            bpu11.uraian.contains("Tagihan Listrik"),
            "BPU11 should be Tagihan Listrik, got: {}",
            bpu11.uraian
        );
        assert_eq!(bpu11.pengeluaran, 60000.0, "BPU11 should be 60.000");

        // BNU16 = grouped UKS items (Minyak kayu Putih, Betadine, etc.)
        let bnu16 = data.transactions.iter().find(|t| t.no_bukti == "BNU16");
        assert!(bnu16.is_some(), "BNU16 should exist");
        let bnu16 = bnu16.unwrap();
        // Total: 500.000 + 450.000 + 420.000 + 360.000 + 250.000 = 1.980.000
        assert_eq!(
            bnu16.pengeluaran, 1980000.0,
            "BNU16 total should be 1.980.000, got: {}",
            bnu16.pengeluaran
        );
    }
}
