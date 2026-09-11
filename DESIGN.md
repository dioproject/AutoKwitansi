# Design Document — AutoKwitansi

## Tujuan

Aplikasi desktop untuk bendahara sekolah dasar negeri di Indonesia yang membutuhkan cetak kwitansi SPJ (Surat Pertanggungjawaban) secara cepat dan konsisten di atas kertas pre-print **Silver Horse**.

## Pengguna Target

- **Bendahara BOS** sekolah dasar — input manual atau import dari BKU ARKAS.
- **Operator sekolah** — hanya mengecek/preview sebelum cetak.

## Halaman UI

| # | Nama | Fungsi |
|---|------|--------|
| 1 | **Buat Kwitansi** | Form input: nomor, tanggal, tahun anggaran, kode rekening, sudah terima dari, jumlah (auto-terbilang), untuk pembayaran, penerima, mengetahui/bendahara (auto dari data sekolah). Simpan → preview langsung. |
| 2 | **Riwayat** | Tabel semua kwitansi, pencarian, edit/hapus, checkbox multi-select → **Cetak yang Dipilih** (batch print). |
| 3 | **Import Data** | Dua tab: **PDF BKU** (parser Rust, grouping by No. Bukti) dan **CSV**. Preview + checkbox sebelum import. |
| 4 | **Data Sekolah** | Nama sekolah, alamat, kota, kepala sekolah + NIP, bendahara + NIP. Menjadi auto-fill untuk kwitansi baru. |
| 5 | **Pengaturan Cetak** | Mode (values_only / full), ukuran kertas, margin, font size, **Jarak TTD** (mm). Visual drag-and-drop editor untuk posisi field pada kertas preview. |
| 6 | **Preview Kwitansi** | Satu kwitansi, tombol Cetak. |
| 7 | **Batch Print** | Beberapa kwitansi sekaligus, `page-break-after: always`. |

## Mode Cetak

### Values Only (Kertas Pre-Print Silver Horse)

- Kwitansi sudah dicetak pabrik: border, "KWITANSI", "Silver Horse", kolom label tetap.
- Aplikasi **hanya mencetak nilai**: nomor, tahun anggaran, nama, jumlah, terbilang, tanda tangan.
- Semua field di-posisi **absolute** dalam satuan **mm**.
- **11 field draggable** di visual editor:

| Field | Default posisi (mm) | Isi |
|-------|---------------------|-----|
| No Kwitansi | 110, 18 | `No: 001/KWT/2026` |
| Tahun Anggaran | 15, 28 | `Tahun Anggaran: 2026` |
| Kode Rekening | 100, 28 | `Kode Rekening: 5.1.02...` |
| Sudah Terima Dari | 60, 40 | Nama bendahara BOS |
| Uang Sejumlah | 60, 52 | Terbilang (huruf) |
| Untuk Pembayaran | 60, 64 | Keterangan |
| Jumlah Rp | 120, 80 | `Rp 1.500.000` |
| **Mengetahui** | 15, 120 | Label + nama Kepsek + NIP (1 blok) |
| **Yang Menerima** | 100, 120 | Tanggal + label + nama penerima (1 blok) |
| **Bendahara** | 155, 120 | Label + nama Bendahara + NIP (1 blok) |
| Tanggal | 100, 120 | Tanggal panjang |

- Tiga blok tanda tangan (Mengetahui, Yang Menerima, Bendahara) masing-masing berisi **label + spacer jarak + nama + NIP** sebagai 1 field gabungan, bisa digeser bersama.

### Full (Kwitansi Lengkap / Kosongan)

- Mencetak seluruh kwitansi dari nol: header "KWITANSI", body label + nilai, footer tanda tangan.
- Cocok untuk kertas kosong (A5 / custom).
- Urutan footer: **Mengetahui (kiri) — Bendahara (tengah) — Yang Menerima (kanan)**.

## Pengaturan Cetak

| Field | Default | Keterangan |
|-------|---------|------------|
| Mode Cetak | values_only | Isi Nilai Saja / Kwitansi Lengkap |
| Lebar Kertas | 176 mm | Silver Horse ukuran standar |
| Tinggi Kertas | 190 mm | Silver Horse ukuran standar |
| Margin Atas | 10 mm | |
| Margin Bawah | 10 mm | |
| Margin Kiri | 10 mm | |
| Margin Kanan | 10 mm | |
| Ukuran Font | 9 pt | |
| **Jarak TTD** | **15 mm** | Jarak kosong antara label tanda tangan → nama (fleksibel 0–50 mm) |

## Alur BKU ARKAS → Kwitansi

1. Export BKU dari ARKAS ke PDF.
2. Klik **Import PDF BKU** → pilih file → parser Rust ekstrak transaksi.
3. Transaksi di-grouping per **No. Bukti** (BPU11, BNU16, dst.) → 1 BPU = 1 kwitansi.
4. Preview tabel → edit penerima per baris → centang yang mau di-import.
5. Isi field otomatis dari PDF: tahun anggaran, nama kepala/bendahara + NIP, sudah terima dari.
6. Import → masuk ke Riwayat → cetak individual atau batch.

## Keputusan Desain

1. **Mengetahui — Bendahara — Yang Menerima** (bukan Mengetahui — Yang Menerima — Bendahara) — mengikuti format kwitansi SPJ sekolah Indonesia.
2. **Spacing tanda tangan dikontrol user** via "Jarak TTD" global — fleksibel untuk ukuran tangan tanda tangan yang berbeda-beda.
3. **Visual editor drag-and-drop** — user tidak perlu hitung koordinat manual; cukup geser label ke posisi pada preview kertas.
4. **Dynamic `@page` CSS inject** saat cetak — `window.print()` otomatis pakai ukuran kertas dari pengaturan.
5. **PDF parser berbasis text extraction** (`pdf-extract` crate) — tidak pakai Python/pdfplumber, tetap pure Rust.
