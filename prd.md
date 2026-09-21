# PRD — AutoKwitansi v2.0

## Product Overview

**AutoKwitansi** adalah aplikasi desktop untuk pembuatan kwitansi SPJ sekolah yang terintegrasi dengan data BKU dari ARKAS. Versi 2.0 menambahkan kemampuan cetak nota POS thermal dan dokumen otomatis untuk belanja BPU.

## Target Users

- Bendahara sekolah (BOS/BOPP)
- Operator ARKAS
- Kepala sekolah (untuk tanda tangan)

## Goals

1. Percepatan pembuatan kwitansi dari BKU ARKAS (dari 30 menit → 2 menit per transaksi).
2. Cetak nota POS langsung dari aplikasi tanpa perlu ketik manual.
3. Otomasi dokumen pendukung belanja BPU >Rp1jt (BAST, Surat Pesanan, Invoice, BAP).
4. Organisasi data per bulan untuk kemudahan pelaporan.

## Features

### F1: Kwitansi SPJ (Existing, Enhanced)
- Buat kwitansi manual atau import dari BKU/CSV.
- Cetak kwitansi mode `values_only` (pre-print Silver Horse) atau `full` (kosongan).
- Batch print untuk beberapa kwitansi sekaligus.
- Auto-refresh preview saat ubah pengaturan cetak.

### F2: Import Data
- **PDF BKU**: Parse 1 file PDF BKU dari ARKAS → ekstrak transaksi BPU/BNU.
- **CSV**: Import dari file CSV dengan format yang ditentukan.
- **Import BKU Per Bulan**: Parse beberapa file PDF BKU sekaligus → kelompokkan per bulan/tahun → import.

### F3: Cetak Nota POS [NEW]
- Hanya untuk kwitansi jenis BPU (`nomor_kwitansi` mengandung "BPU").
- Pilihan kertas: 58mm atau 80mm.
- Pilihan koneksi: USB atau Bluetooth (dipakai sebagai referensi printer).
- Cetak via `window.print()` → driver printer sistem (USB/Bluetooth pairing).
- Nota POS: struk monospace — kop sekolah, No BPU, tanggal, toko, uraian, jumlah, terbilang, footer.

### F4: Dokumen BPU >Rp1jt [NEW]
- **Pemicu**: Kwitansi BPU dengan jumlah > Rp1.000.000.
- **Input wajib**: Nama toko, alamat toko, pimpinan toko.
- **4 dokumen wajib** (centang status):
  1. **BAST** (Berita Acara Serah Terima) — antara penjual ↔ sekolah.
  2. **Surat Pesanan** — dari sekolah ke toko.
  3. **Invoice** — dari toko ke sekolah.
  4. **BAP** (Berita Acara Pemeriksaan Barang) — pemeriksaan oleh panitia.
- **Validasi**: Cetak Nota POS terkunci jika dokumen belum 4/4. Simpan kwitansi tetap boleh (draft).
- **Preview**: User bisa preview 4 dokumen tanpa harus centang dulu.

### F5: Auto-Refresh Pengaturan Cetak
- Setiap perubahan pada input pengaturan (lebar, tinggi, margin, font, mode) langsung memperbarui preview secara otomatis.
- Debounce 300ms agar tidak lag.
- Tombol `Refresh Preview` tersedia sebagai fallback manual.

## Non-Goals (v2.0)

- ESC/POS raw printing (tanpa driver) — rencanakan di v3.0.
- Upload file/scan dokumen — cukup checklist manual.
- Multi-user / networking — tetap desktop single-user.
- Export PDF dari dokumen — cukup cetak langsung.

## Success Metrics

| Metric | Target |
|--------|--------|
| Waktu cetak 1 kwitansi | < 30 detik |
| Waktu import 10 transaksi BKU | < 1 menit |
| Waktu generate 4 dokumen BPU | < 2 menit |
| User satisfaction ( survey) | > 4/5 |

## Technical Constraints

- Tauri v2 + SQLite (bundled) — tidak perlu install DB terpisah.
- Printer POS harus sudah pairing/install driver di Windows.
- Tidak ada backend server — semua data lokal di `%APPDATA%/AutoKwitansi/`.
- DB lama harus tetap bisa dibuka (migrasi ALTER TABLE yang aman).

## Build Variants

| Variant | Contents | Installer Name |
|---------|----------|---------------|
| Default | Kwitansi + Import | AutoKwitansi-Setup.exe |
| Full | Semua fitur | AutoKwitansi-Full-Setup.exe |

## Changelog

### v2.0.0 (Current)
- [NEW] Cetak Nota POS 58/80mm via USB/Bluetooth
- [NEW] Dokumen BPU >1jt: BAST, Surat Pesanan, Invoice, BAP
- [NEW] Import BKU Per Bulan (multi-PDF)
- [NEW] Auto-refresh preview saat ubah pengaturan cetak
- [NEW] Badge BPU di riwayat
- [NEW] Filter bulan di riwayat
- [NEW] Data toko untuk dokumen
- [IMPROVED] Database schema: tambah kolom bulan, toko
- [IMPROVED] Build variants: default vs full

### v1.1.0
- Import PDF BKU dari ARKAS
- Import CSV
- Cetak kwitansi mode values_only + full
- Batch print
- Pengaturan cetak dengan drag-drop editor
