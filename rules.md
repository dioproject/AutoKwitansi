# Rules — AutoKwitansi v3.0

## Versioning (wajib tiap ada perubahan)
1. Setiap perubahan (fitur/fix) **wajib naik versi** di 4 tempat: `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, dan label versi sidebar `index.html`.
2. Semver: fitur baru → **minor** (3.x.0); fix/refactor tanpa fitur → **patch** (3.0.x); breaking/migrasi besar → **major**.
3. Tiap bump versi wajib tambah entri di `## Changelog` prd.md (`[NEW]`/`[IMPROVED]`/`[FIXED]`/`[REMOVED]`).

## Coding Rules

### Backend (Rust)
1. **Tidak ada feature flag** — semua modul (`bku_period.rs`, `pos_print.rs`, `bpu_docs.rs`) selalu dikompilasi; command didaftarkan di `lib.rs` tanpa `#[cfg]`.
2. Migrasi DB harus aman untuk DB lama: `CREATE TABLE IF NOT EXISTS` + `add_column_if_missing()` (ALTER TABLE). Jangan pernah DROP kolom/tabel.
3. Field baru di struct `Kwitansi`/`PosSettings` harus `#[serde(default)]` dan di-handle di semua query (insert, get_all, get_by_id, search) — pakai `KWITANSI_COLUMNS` + `row_to_kwitansi()` agar konsisten.
4. Kolom bool SQLite = INTEGER 0/1 — konversi eksplisit `as i32` (write) dan `!= 0` (read).
5. Error handling: semua command kembalikan `Result<T, String>` (`map_err(|e| e.to_string())`).
6. ESC/POS: semua teks wajib `sanitize_ascii()` dan `truncate_per_line()` per lebar kertas (32 char @58mm, 48 char @80mm).
7. Uang: `jumlah` (f64) selalu **bruto**; PPh/netto dihitung saat render, tidak disimpan.
8. Fungsi lintas-modul pakai `pub(crate)` (contoh: `is_honor_pph21`, `expand_bnu_description` di commands.rs dipakai bku_period.rs).
9. Test unit untuk helper murni (label, format tanggal, currency, sanitize) di `#[cfg(test)] mod tests`.

### Frontend (JavaScript)
1. Semua modul (`pos.js`, `bpu-docs.js`, `bku-period.js`) di-import **statis** di `main.js` — tidak ada dynamic import per varian.
2. Function yang dipanggil dari HTML (`onclick`, `onchange`) harus di-assign ke `window.*`.
3. Helper `isBpu()` hanya di `pos.js`; `isBnu()`/`labelNomorCetak()` boleh ada di main.js dan pos.js (logika sama, konteks render beda).
4. Selalu null-safe pada elemen DOM opsional (`document.getElementById(...)?.`) — riwayat merender ulang container sehingga elemen lama hilang.
5. Auto-refresh pakai debounce (300ms); `lastPreviewData` di-cache di `showPrintPreview()`/`showBatchPrintPreview()`.
6. Semua output user/DB lewat `esc()`/`escHtml()` — jangan trust data.
7. Toast: `showToast(message, type)` — type: `success`, `error`, `warning`.
8. State merge baris import = `{ rid, tx, orig, count }` dengan `rid` unik (jangan pakai index array — rawan bergeser setelah merge/urai).

## Business Rules

### Kwitansi
1. Field wajib: `nomor_kwitansi`, `tanggal`, `sudah_terima_dari`, `jumlah`, `untuk_pembayaran`, `penerima`.
2. `terbilang` auto-generate via Rust — dari **netto** jika `kena_pph21`/`kena_pph23`, selain itu dari bruto.
3. `bulan` diisi dari import BKU; kosong untuk input manual (masuk group "Tanpa BKU" di riwayat).
4. Nomor kwitansi dicetak **lengkap apa adanya** (mis. `BPU12`, `BNU16`) **tanpa awalan "No:"** — kertas pre-print / layout sudah menyediakan posisinya.

### PPh 21 6% (Honorarium) & PPh 23 4% (Makan Minum)
1. Kategori BNU = honorarium saja: tenaga ahli kode **07.12.04** dan instruktur/pelatih.
2. Auto-check PPh 21 jika: nomor mengandung BNU **atau** kode 07.12.04 **atau** uraian mengandung honor/honorarium/instruktur. User tetap bisa mengubah manual.
3. Auto-check PPh 23 jika: uraian mengandung makan/minum/konsumsi/catering/katering/snack/jamuan (**bukan** honorarium — PPh 21 didahulukan).
4. Kedua checkbox **saling eksklusif** (hanya satu yang aktif): PPh 21 6% / PPh 23 4% / PPh 23 2% (sewa/jasa, manual — tanpa auto-detect).
5. PPh 21 = 6% × bruto; PPh 23 = 4% × bruto; PPh 23 2% = 2% × bruto (dibulatkan); netto = bruto − PPh.
6. Tampilan bruto/PPh/netto hanya untuk kwitansi kena pajak (form, cetak kwitansi, struk POS).
7. **BNU tidak punya tombol POS** dan **tidak wajib dokumen toko** (dokumen hanya untuk BPU >1jt).

### Deskripsi BNU (anti-monoton)
1. `expand_bnu_description()` memperpanjang uraian pendek (<40 char) saat save/import:
   - 07.12.04 / "tenaga ahli" / "narasumber" → "Pembayaran Honorarium Tenaga Ahli/Narasumber — {uraian} Bulan {bulan} TA {tahun}"
   - "instruktur" / "pelatih" / "guru" → "Pembayaran Honorarium Instruktur/Pelatih — ..."
   - "honor" umum → "Pembayaran Honorarium — ..."
2. Uraian yang sudah panjang tidak ditimpa penuh — hanya ditambah konteks bulan/TA.
3. Non-BNU tidak diubah.

### Import BKU
1. 1 PDF BKU = 1 bulan. Parse header → `bulan` + `tahun`.
2. Transaksi di-group per `no_bukti`; skip: Saldo Bank/Tunai, Tarik/Setor Tunai, Pergeseran, Bunga, Pajak, SIPLah, PPh, PPN.
3. Multi-PDF: kelompokkan per `bulan+tahun`; bulan/tahun bisa diedit inline per group.
4. Deteksi PPh 21/23 & expand deskripsi BNU berjalan otomatis per transaksi saat import.
5. Import ulang BKU yang sama **tidak menduplikat**: baris dengan (nomor + bulan + tahun) yang sudah ada **dilewati** (data lama tidak diubah); hanya data baru yang masuk. Ubah data lama hanya lewat Edit di Riwayat.

### Merge Transaksi (Import)
1. User memilih sendiri baris yang digabung (centang 2+ → Gabungkan) — **tidak harus** kode rekening sama.
2. Hasil merge: `pengeluaran` = Σ; `uraian` = unique-join `"; "`; `penerima` = unique-join `", "`; `no_bukti` = join `", "`; `kode_rekening` = unique-join `" + "`; `tanggal` = terlama.
3. Merge hanya dalam **satu bulan/group** yang sama (Import BKU Per Bulan).
4. Setiap gabungan bisa diuraikan kembali (✖ per baris, atau Uraikan Semua).
5. Edit input penerima disimpan ke state sebelum merge/render ulang (`capture*PenerimaEdits()`).
6. Import = baris tercentang; 1 baris gabungan = 1 kwitansi.

### Cetak Nota POS
1. Tombol POS hanya untuk kwitansi **BPU** (`nomor_kwitansi` mengandung "BPU", case-insensitive).
2. Alur: klik POS → **modal preview** struk → user pilih Thermal (ESC/POS via COM) atau Printer (browser fallback).
3. **No nota = random auto-generate** `YYYYMMDD-NNNN` per cetak — bukan nomor kwitansi. Label BPU/BNU tetap ditampilkan.
4. Header struk: `header_text` kustom → fallback `nama_toko`+`alamat_toko` (BPU) → fallback "NOTA PEMBAYARAN". Footer: `footer_text` → fallback "Terima kasih".
5. Isi struk **berbeda dari kwitansi**: tanpa "Sudah terima dari", tanpa bendahara/mengetahui/NIP — hanya ITEM, TOTAL, Penerima.
6. BPU >1jt dengan dokumen belum 4/4 → warning konfirmasi (boleh lanjut).
7. Port kosong / gagal open COM → error inline di modal, user bisa fallback Printer.
8. Test Print tersedia di halaman Printer Thermal (simpan dulu setting sebelum test).

### Dokumen BPU >Rp1.000.000
1. Pemicu: `isBpu(nomor) && jumlah > 1000000`.
2. Wajib isi: `nama_toko`, `alamat_toko`, `pimpinan_toko`.
3. 4 dokumen checklist: BAST, Surat Pesanan, Invoice, BAP.
4. Cetak POS **memberi peringatan** jika belum 4/4 — simpan kwitansi tetap boleh (draft).
5. Preview 4 dokumen (A4) tersedia tanpa harus centang dulu.

### Riwayat
1. Group accordion per `"BKU {bulan} {tahun_anggaran}"`; kwitansi tanpa bulan → group "Tanpa BKU".
2. Group pertama (terbaru, data urut id DESC) terbuka default.
3. Mode search = tabel flat (tanpa accordion).
4. Select-all per group; batch button muncul jika ≥2 baris tercentang.

### Build & Release
1. Satu varian: `bun run tauri build` → NSIS + MSI. Tidak ada lagi `tauri:lite`/`tauri:full`.
2. `frontendDist: ../dist`; outDir vite = `dist/`.
3. Versi sinkron di 3 tempat: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` (+ footer sidebar index.html).
