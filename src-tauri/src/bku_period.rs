use crate::db;
use crate::models::{BkuData, BkuPeriodItem, ImportResult, Kwitansi};
use crate::pdf_import::parse_bku_pdf;
use crate::terbilang::terbilang;

pub fn parse_bku_pdfs(file_paths: Vec<String>) -> Result<Vec<BkuData>, String> {
    let mut results = Vec::new();
    for path in file_paths {
        let data = parse_bku_pdf(&path)?;
        results.push(data);
    }
    Ok(results)
}

pub fn import_bku_period(
    items: &Vec<BkuPeriodItem>,
    tahun_anggaran: &str,
    sudah_terima_dari: &str,
    mengetahui: &str,
    nip_mengetahui: &str,
    bendahara: &str,
    nip_bendahara: &str,
) -> Result<ImportResult, String> {
    let mut inserted = 0;
    let mut skipped = 0;
    for item in items {
        let bulan = item.bulan.clone();
        let tahun = if item.tahun.is_empty() {
            tahun_anggaran.to_string()
        } else {
            item.tahun.clone()
        };
        for tx in &item.transactions {
            let pph21 =
                crate::commands::is_honor_pph21(&tx.no_bukti, &tx.kode_kegiatan, &tx.uraian);
            let pph23 = !pph21
                && crate::commands::is_makan_pph23(&tx.no_bukti, &tx.kode_kegiatan, &tx.uraian);
            let kwitansi = Kwitansi {
                id: None,
                nomor_kwitansi: tx.no_bukti.clone(),
                tanggal: tx.tanggal.clone(),
                sudah_terima_dari: sudah_terima_dari.to_string(),
                jumlah: tx.pengeluaran,
                terbilang: terbilang(crate::commands::netto_pajak(
                    tx.pengeluaran,
                    pph21,
                    false,
                    pph23,
                    false,
                )),
                untuk_pembayaran: crate::commands::expand_bnu_description(
                    &tx.no_bukti,
                    &tx.kode_kegiatan,
                    &tx.uraian,
                    &bulan,
                    &tahun,
                ),
                kode_rekening: tx.kode_rekening.clone(),
                tahun_anggaran: tahun.clone(),
                bulan: bulan.clone(),
                mengetahui: mengetahui.to_string(),
                nip_mengetahui: nip_mengetahui.to_string(),
                bendahara: bendahara.to_string(),
                nip_bendahara: nip_bendahara.to_string(),
                penerima: tx.penerima.clone(),
                nama_toko: String::new(),
                alamat_toko: String::new(),
                pimpinan_toko: String::new(),
                created_at: None,
                kena_pph21: pph21,
                kena_pph21_5: false,
                kena_pph23: pph23,
                kena_pph23_2: false,
                ppn_nominal: 0.0,
                kode_kegiatan: tx.kode_kegiatan.clone(),
            };
            // Import ulang BKU yang sama: lewati yang sudah ada (jangan ubah/timpa).
            // Data lama hanya bisa diubah lewat Edit di Riwayat.
            if db::kwitansi_exists(&kwitansi.nomor_kwitansi, &bulan, &tahun)
                .map_err(|e| e.to_string())?
            {
                skipped += 1;
                continue;
            }
            db::insert_kwitansi(&kwitansi).map_err(|e| e.to_string())?;
            inserted += 1;
        }
    }
    Ok(ImportResult { inserted, skipped })
}
