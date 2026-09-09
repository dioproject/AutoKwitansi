use crate::models::CsvRow;
use std::io::Cursor;

pub fn parse_csv(content: &str) -> Result<Vec<CsvRow>, String> {
    let cursor = Cursor::new(content);
    let mut rdr = csv::ReaderBuilder::new()
        .has_headers(true)
        .flexible(true)
        .trim(csv::Trim::All)
        .from_reader(cursor);

    let mut rows = Vec::new();

    for (i, result) in rdr.records().enumerate() {
        let record = result.map_err(|e| format!("Baris {}: {}", i + 2, e))?;

        if record.len() < 7 {
            return Err(format!(
                "Baris {}: jumlah kolom kurang (butuh 7, dapat {}). Kolom: nomor_kwitansi, tanggal, sudah_terima_dari, jumlah, untuk_pembayaran, kode_rekening, penerima",
                i + 2,
                record.len()
            ));
        }

        let jumlah_str = record[3].replace('.', "").replace(',', ".");
        let jumlah: f64 = jumlah_str
            .trim()
            .parse()
            .map_err(|_| format!("Baris {}: jumlah '{}' bukan angka valid", i + 2, &record[3]))?;

        rows.push(CsvRow {
            nomor_kwitansi: record[0].trim().to_string(),
            tanggal: record[1].trim().to_string(),
            sudah_terima_dari: record[2].trim().to_string(),
            jumlah,
            untuk_pembayaran: record[4].trim().to_string(),
            kode_rekening: record[5].trim().to_string(),
            penerima: record[6].trim().to_string(),
        });
    }

    Ok(rows)
}
