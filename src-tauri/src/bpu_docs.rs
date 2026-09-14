use crate::db;
use crate::models::BpuDokumen;

pub fn get_doc_status(kwitansi_id: i64) -> Result<BpuDokumen, String> {
    db::get_bpu_dokumen(kwitansi_id).map_err(|e| e.to_string())
}

pub fn set_doc_lengkap(
    kwitansi_id: i64,
    dok_bast: bool,
    dok_surat_pesanan: bool,
    dok_invoice: bool,
    dok_bap: bool,
) -> Result<(), String> {
    db::upsert_bpu_dokumen(
        kwitansi_id,
        dok_bast,
        dok_surat_pesanan,
        dok_invoice,
        dok_bap,
    )
    .map_err(|e| e.to_string())
}

pub fn update_toko(
    kwitansi_id: i64,
    nama_toko: &str,
    alamat_toko: &str,
    pimpinan_toko: &str,
) -> Result<(), String> {
    db::update_kwitansi_toko(kwitansi_id, nama_toko, alamat_toko, pimpinan_toko)
        .map_err(|e| e.to_string())
}
