# Rules — AutoKwitansi v2.0

## Coding Rules

### Backend (Rust)
1. Setiap modul baru (`bku_period.rs`, `pos_print.rs`, `bpu_docs.rs`) harus kompilasi tanpa feature flag — semua modul selalu ada.
2. Command baru didaftarkan di `lib.rs` tanpa `#[cfg]` — karena semua fitur selalu aktif di build `full`.
3. Migrasi DB harus `IF NOT EXISTS` / `ALTER TABLE` yang aman untuk DB lama.
4. Field baru di struct `Kwitansi` harus di-handle di semua query (`insert`, `get_all`, `get_by_id`, `search`).
5. Jangan ubah 14 command lama — hanya tambah command baru.
6. Error handling: semua command kembalikan `Result<T, String>`.

### Frontend (JavaScript)
1. Module baru (`pos.js`, `bpu-docs.js`, `bku-period.js`) harus ES module — export function, tidak hanya `window.*`.
2. Function yang dipanggil dari HTML (`onclick`, `onchange`) harus di-assign ke `window.*`.
3. Helper `isBpu()` hanya ada di `pos.js` — jangan duplikasi.
4. Auto-refresh harus pakai debounce (300ms) — jangan trigger render setiap keystroke.
5. `lastPreviewData` harus di-cache di `showPrintPreview()` dan `showBatchPrintPreview()`.
6. Semua `esc()` / `escHtml()` harus dipakai untuk user input — jangan trust data dari DB.
7. Toast notification: `showToast(message, type)` — type: `success`, `error`, `warning`.

## Business Rules

### Kwitansi
1. Setiap kwitansi wajib punya: `nomor_kwitansi`, `tanggal`, `sudah_terima_dari`, `jumlah`, `untuk_pembayaran`, `penerima`.
2. `terbilang` auto-generate dari `jumlah` via Rust `terbilang()`.
3. `bulan` diisi otomatis dari import BKU, kosong untuk input manual.

### Import BKU
1. 1 PDF BKU = 1 bulan. Parse header → `bulan` + `tahun`.
2. Transaksi di-group per `no_bukti` (BPU11, BNU16, dst).
3. Skip transaksi: Saldo Bank/Tunai, Tarik/Setor Tunai, Pergeseran, Bunga, Pajak, SIPLah, PPh, PPN.
4. Import multi-PDF: dikelompokkan per `bulan+tahun`, checkbox per-grup dan per-baris.

### Cetak Nota POS
1. Hanya untuk kwitansi dengan `nomor_kwitansi` mengandung "BPU" (case-insensitive).
2. Non-BPU: tombol POS tidak muncul.
3. Paper width: 58mm atau 80mm (dipilih user).
4. Koneksi: USB atau Bluetooth (preferensi, tidak mengubah cara cetak via `window.print()`).

### Dokumen BPU >Rp1.000.000
1. Pemicu: `isBpu(nomor) && jumlah > 1000000`.
2. Wajib isi: `nama_toko`, `alamat_toko`, `pimpinan_toko`.
3. 4 dokumen wajib dicentang: BAST, Surat Pesanan, Invoice, BAP.
4. Cetak Nota POS **terkunci** jika dokumen belum 4/4 — tetapi **simpan kwitansi tetap boleh** (draft).
5. User bisa preview 4 dokumen tanpa harus centang dulu.

### Build Variants
1. Default: kwitansi + import dasar saja.
2. Full: semua fitur (POS + Dokumen + BKU Per Bulan).
3. File JS (`pos.js`, `bpu-docs.js`, `bku-period.js`) selalu di-bundle — feature flag hanya untuk Rust commands.
