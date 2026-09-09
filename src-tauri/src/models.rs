use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Sekolah {
    pub id: Option<i64>,
    pub nama_sekolah: String,
    pub alamat: String,
    pub kota: String,
    pub kepala_sekolah: String,
    pub nip_kepala: String,
    pub bendahara: String,
    pub nip_bendahara: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Kwitansi {
    pub id: Option<i64>,
    pub nomor_kwitansi: String,
    pub tanggal: String,
    pub sudah_terima_dari: String,
    pub jumlah: f64,
    pub terbilang: String,
    pub untuk_pembayaran: String,
    pub kode_rekening: String,
    pub tahun_anggaran: String,
    pub mengetahui: String,
    pub nip_mengetahui: String,
    pub bendahara: String,
    pub nip_bendahara: String,
    pub penerima: String,
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CsvRow {
    pub nomor_kwitansi: String,
    pub tanggal: String,
    pub sudah_terima_dari: String,
    pub jumlah: f64,
    pub untuk_pembayaran: String,
    pub kode_rekening: String,
    pub penerima: String,
}
