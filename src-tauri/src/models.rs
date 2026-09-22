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
    #[serde(default)]
    pub bulan: String,
    pub mengetahui: String,
    pub nip_mengetahui: String,
    pub bendahara: String,
    pub nip_bendahara: String,
    pub penerima: String,
    #[serde(default)]
    pub nama_toko: String,
    #[serde(default)]
    pub alamat_toko: String,
    #[serde(default)]
    pub pimpinan_toko: String,
    pub created_at: Option<String>,
    #[serde(default)]
    pub kena_pph21: bool,
    #[serde(default)]
    pub kena_pph23: bool,
    #[serde(default)]
    pub kode_kegiatan: String,
}

// ============ BKU PDF MODELS ============

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BkuTransaction {
    pub no_bukti: String,
    pub tanggal: String,
    pub kode_kegiatan: String,
    pub kode_rekening: String,
    pub uraian: String,
    pub pengeluaran: f64,
    pub penerima: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BkuData {
    pub bulan: String,
    pub tahun: String,
    pub nama_sekolah: String,
    pub alamat: String,
    pub kabupaten: String,
    pub kepala_sekolah: String,
    pub nip_kepala: String,
    pub bendahara: String,
    pub nip_bendahara: String,
    pub tanggal_tutup: String,
    pub transactions: Vec<BkuTransaction>,
}

// ============ PRINT SETTINGS ============

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PrintSettings {
    pub id: Option<i64>,
    pub mode: String,
    pub paper_width: f64,
    pub paper_height: f64,
    pub margin_top: f64,
    pub margin_bottom: f64,
    pub margin_left: f64,
    pub margin_right: f64,
    pub font_size: f64,
    pub sig_gap: f64,
    pub field_positions: String,
}

// ============ POS SETTINGS ============

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PosSettings {
    pub id: Option<i64>,
    pub paper_width: i32,
    pub port: String,
    pub baud_rate: i32,
    #[serde(default)]
    pub header_text: String,
    #[serde(default)]
    pub footer_text: String,
    #[serde(default)]
    pub last_pos_number: i64,
}

// ============ BPU DOKUMEN ============

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BpuDokumen {
    pub id: Option<i64>,
    pub kwitansi_id: i64,
    pub dok_bast: bool,
    pub dok_surat_pesanan: bool,
    pub dok_invoice: bool,
    pub dok_bap: bool,
    pub updated_at: Option<String>,
}

// ============ BKU PERIOD ============

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BkuPeriodItem {
    pub bulan: String,
    pub tahun: String,
    pub transactions: Vec<BkuTransaction>,
}
