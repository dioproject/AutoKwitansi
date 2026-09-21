# Spec Desain — AutoKwitansi v3.0: Aplikasi Tunggal + Cetak POS Langsung

Tanggal: 2026-09-21
Status: Disetujui user (A–G), menunggu review spec ini sebelum rencana implementasi.

## 1. Latar & Tujuan

AutoKwitansi v2.0 memiliki dua varian (lite/full) yang menyulitkan pemakaian dan
perawatan. Cetak POS masih lewat dialog print browser (setting USB/Bluetooth tidak
terpakai). Riwayat masih tabel datar tanpa grouping bulan. Kwitansi honorarium
(BNU) belum menangani PPh 21.

Tujuan v3.0: **satu aplikasi utuh**, cetak POS **langsung ke printer thermal USB**
tanpa dialog, riwayat **grup per bulan (accordion)**, kategori **BNU honorarium**
dengan **PPh 21 6%**, layout kertas kwitansi disederhanakan, dokumentasi disatukan.

Keputusan ini **menggantikan** non-goal "ESC/POS raw printing — rencanakan di v3.0"
di `prd.md` (sekarang menjadi scope v3.0).

## 2. Ruang Lingkup

| ID | Item | Status |
|----|------|--------|
| A | Unifikasi lite+full → satu aplikasi | Disetujui |
| B | Cetak POS langsung (ESC/POS, thermal USB) | Disetujui, opsi A |
| C | Label cetak No: BPU/BNU saja + badge BNU | Disetujui |
| D | Riwayat grup "BKU {bulan} {tahun}" accordion inline | Disetujui |
| F | PPh 21 6% honorarium (tenaga ahli 07.12.04, instruktur pelatih) | Disetujui |
| G | Layout kertas kwitansi: hanya 8 field | Disetujui |
| E | Tulis ulang 6 file markdown | Disetujui |

Out of scope: Bluetooth printing, printer USB murni non-virtual-COM (ditangani
fallback), perubahan layout mode values-only (mengikuti form pre-print fisik),
penomoran otomatis, export PDF dokumen.

## 3. A — Unifikasi Varian

Hapus seluruh sistem varian; semua fitur selalu aktif.

- `vite.config.js`: hapus `APP_VARIANT`, `outDir: "dist"`, hapus `define.__APP_VARIANT__`.
- `package.json`: script menjadi `dev`, `build`, `preview`, `tauri`, `tauri:dev`,
  `tauri:build`. Hapus `dev:full`, `build:lite`, `build:full`, `tauri:lite`, `tauri:full`.
- `index.html`: hapus semua atribut `data-require="full"` (7 lokasi).
- `src/styles.css`: hapus rule `[data-require="full"]`.
- `src/main.js`: hapus `isFull`, stub `isBpu`, blok show/hide DOMContentLoaded, guard
  `if (!isFull) return`, kondisi `isFull &&`. Import statis:
  `import { isBpu, ... } from "./pos.js"` + import bpu-docs/bku-period selalu jalan.
- Rust: hapus `[features]` di `Cargo.toml`; hapus semua `#[cfg(feature=...)]` dan
  `cfg_attr(not(feature...))` di `lib.rs`, `commands.rs`, `db.rs`, `models.rs`.
- `src-tauri/`: hanya `tauri.conf.json` (`frontendDist: ../dist`,
  `beforeBuildCommand: bun run build`, identifier `com.autokwitansi.app`,
  productName `AutoKwitansi`). Hapus `tauri.lite.json`, `tauri.full.json`.
- `.gitignore`: tambah `dist-lite/`, `dist-full/` (bersihkan folder build lama dari repo).
- Aturan lama "Build Variants" di `rules.md`/`prd.md` dihapus saat pengerjaan E.

## 4. B — Cetak POS Langsung via Backend

### 4.1 Prinsip

Tombol POS memanggil command backend yang menulis byte ESC/POS ke port serial
printer thermal (mayoritas printer kasir USB muncul sebagai virtual COM).
Tidak ada dialog browser pada jalur utama.

### 4.2 Perubahan data (`pos_settings`)

Kolom baru (migration, DB lama aman):
`port TEXT NOT NULL DEFAULT ''` (mis. `COM3` / `/dev/ttyUSB0`),
`baud_rate INTEGER NOT NULL DEFAULT 9600`.
Kolom lama `connection` tidak dipakai lagi (dibiarkan, tidak di-drop agar DB lama aman).
Struct `PosSettings`: tambah `port: String`, `baud_rate: i32`.

Modal POS settings menjadi: Port (teks) + Baud rate (select 9600/19200/57600/115200)
+ Lebar kertas (58/80mm) + tombol Simpan + **Test Print**.

### 4.3 Backend Rust

- Tambah dep `serialport` (8N1, timeout ~2 detik).
- `pos_print.rs`: fungsi `build_escpos_nota(k, settings) -> Vec<u8>`:
  init (`ESC @`), rata tengah untuk kop, tebal untuk total, pangkas (`GS V`).
  Teks di-sanitasi ke ASCII printable + newline (`─`/`Rp` non-ASCII diganti `-`;
  "Rp" sendiri ASCII, aman). Terbilang dipotong per lebar kertas (32/48 kolom).
- Command baru: `cmd_print_pos_nota(kwitansi_id) -> Result<(), String>`
  (ambil kwitansi + settings → format → tulis ke port → error jelas bila port hilang),
  `cmd_pos_test_print() -> Result<(), String>` (cetak struk uji).
- Isi nota: kop `KWITANSI POS`, No (label BPU/BNU, §6), Tgl, Dari, Barang/uraian,
  blok honorarium bila kena PPh (§8), Bendahara, Penerima.

### 4.4 Frontend

- `pos.js`: `cetakNotaPos()` → `invoke("cmd_print_pos_nota")`; sukses → toast;
  gagal → toast error + tawarkan fallback (`confirm` → render template HTML existing
  + `window.print()`). Template HTML nota POS dipertahankan **hanya** sebagai fallback.
- `handleCetakPosRiwayat` / `handleCetakPosBatch`: logika cek dokumen BPU tetap,
  lalu panggil jalur backend per kwitansi (batch: loop, laporkan yang gagal).
- Aturan `rules.md` "koneksi tidak mengubah cara cetak via window.print()" dihapus.

## 5. C — Label Nomor Cetak + Kategori BNU

- Helper `labelNomorCetak(nomor)`: mengandung "BNU" → `"BNU"`;
  mengandung "BPU" → `"BPU"`; selain itu tampil apa adanya.
- Dipakai di: template kwitansi lengkap, values-only, nota POS (backend + fallback).
  DB (`nomor_kwitansi` lengkap) dan tampilan Riwayat tidak berubah.
- Riwayat: tambah badge `BNU` (CSS `.badge-bnu`) di samping badge `BPU` existing.
- **BNU = kategori honorarium**: tanpa tombol POS, tanpa wajib dokumen BPU
  (terjadi otomatis karena `"BNU"` tidak mengandung `"BPU"`). Dokumen BAST/SP/Invoice/BAP
  tetap khusus BPU > Rp1jt.

## 6. D — Riwayat Grup Per Bulan (Accordion Inline)

- `loadRiwayat()`: grouping di frontend dari `cmd_get_all_kwitansi`.
  Kunci grup = bulan (`k.bulan`, atau diturunkan dari `k.tanggal` via nama bulan
  Indonesia) + tahun (`tahun_anggaran` atau dari tanggal). Tanpa keduanya → grup
  "Tanpa Bulan" di urutan terakhir. Urut: tahun desc, bulan desc.
- Header grup (satu baris, colspan 8, bisa diklik):
  `BKU {BULAN} {TAHUN} • {n} kwitansi • Total Rp {x}` + checkbox pilih-segrup.
  Bulan terbaru terbuka default; state buka/tutup di `Set` JS.
- Isi lipatan = baris tabel existing (checkbox, nomor+badge, tanggal, diterima,
  jumlah, pembayaran, aksi Cetak/POS/Hapus).
- Search non-kosong → mode datar existing (`renderTable`). Query kosong → mode grup.
- Seleksi batch lintas grup via `selectedKwitansiIds` global (tidak berubah);
  tombol "Cetak yang Dipilih" tidak berubah.
- "Gabung setelah import sukses" otomatis: grouping dihitung ulang dari DB setiap
  buka Riwayat — bulan yang sama (data lama + baru diimport) selalu satu grup.
  Alur import yang sudah `showPage("riwayat")` tidak perlu diubah.

## 7. F — PPh 21 6% Honorarium

- **Penanda**: checkbox form *"Honorarium — potong PPh 21 6%"*, tercentang otomatis bila:
  nomor mengandung `BNU`, atau kode mengandung `07.12.04`, atau uraian mengandung
  `honor`/`honorarium`/`instruktur`. User bisa override manual. Berlaku untuk input
  manual maupun hasil deteksi saat import (logika: `no_bukti` / `kode_kegiatan` /
  uraian transaksi).
- **Skema**: kolom baru `kwitansi.kena_pph21 INTEGER NOT NULL DEFAULT 0` (migration).
  `jumlah` tetap = bruto. Model Rust + semua query + frontend pass-through diupdate.
- **Hitung saat tampil/cetak**: `pph = round(6% × bruto)`, `netto = bruto − pph`.
- **Tampil**: blok jumlah kwitansi honorarium = `Bruto Rp` → `PPh 21 (6%) Rp` →
  `Diterima Rp (box)`. **Terbilang mengikuti Netto** (asumsi disetujui).
  Nota POS (§4.3) ikut menampilkan 3 baris yang sama. Riwayat: nominal bruto +
  badge `PPh 21 6%`.
- Mencakup tenaga ahli kode kegiatan 07.12.04 dan honor instruktur pelatih
  (keduanya 6%, satu mekanisme).

## 8. G — Layout Kertas Kwitansi Disederhanakan

Berlaku untuk template lengkap (`renderFullTemplate`); values-only tidak berubah.

Field yang tercetak (berurutan):
1. Judul `KWITANSI` + `No.` (label BPU/BNU per §5).
2. Sudah Terima Dari.
3. Sejumlah (terbilang; netto bila kena PPh per §7).
4. Untuk Pembayaran.
5. Box `Rp.` (netto bila kena PPh; baris Bruto/PPh hanya untuk honorarium).
6. Tiga kolom TTD: Mengetahui (nama+NIP) — Bendahara (nama+NIP) — Penerima yang
   **digabung tanggal**: tanggal format panjang auto (`21 Juni 2026`,
   `formatTanggalPanjang` existing) + `Penerima,` + nama.

Dihapus dari cetakan: Tahun Anggaran, Kode Rekening, merk "Silver Horse",
kotak "Materai", blok meta. Data tetap tersimpan (tahun dipakai grouping §6).
Form input tidak berubah (tetap kumpulkan tahun & kode rekening untuk arsip).

## 9. E — Pembaruan Markdown (6 file)

Tulis ulang dengan arsitektur tunggal v3.0; hapus semua jejak lite/full/variant:
`README.md` (fitur + cara build tunggal), `ARCHITECTURE.md` (struktur + modul
`pos_print` ESC/POS + skema DB baru), `DESIGN.md` (keputusan UI: accordion, modal
POS port/baud, layout 8 field, badge BNU/PPh), `prd.md` (F3 diganti cetak langsung;
hapus "Build Variants"; non-goal ESC/POS dicoret), `rules.md` (hapus §Build Variants;
tambah aturan PPh + label cetak + grouping), `schema.md` (kolom `kena_pph21`,
`port`, `baud_rate`).

## 10. Migrasi DB (ringkasan)

1. `ALTER TABLE kwitansi ADD COLUMN kena_pph21 INTEGER NOT NULL DEFAULT 0`.
2. `ALTER TABLE pos_settings ADD COLUMN port TEXT NOT NULL DEFAULT ''`.
3. `ALTER TABLE pos_settings ADD COLUMN baud_rate INTEGER NOT NULL DEFAULT 9600`.
Semua via helper `add_column_if_missing` existing (DB lama aman).

## 11. Testing

- `cargo check` (satu profil, tanpa features) + `cargo test` bila ada.
- `bun run build` sukses, smoke test desktop: buka tiap halaman tanpa error console.
- Matriks manual: cetak POS sukses (printer COM tersedia), cetak POS gagal
  (port salah → fallback dialog), kwitansi BNU auto-centang PPh, cetak honorarium
  tampil bruto/PPh/netto + terbilang netto, grup bulan tergabung setelah import,
  accordion + search + batch select, DB lama (v2.0) terbuka + termigrasi.

## 12. Risiko & Fallback

- Printer thermal USB murni tanpa virtual COM → tidak bisa jalur langsung;
  fallback preview-dialog menutupinya (user diberi tahu).
- WebView (`formatTanggalPanjang`, `toLocaleDateString id-ID`) mengandalkan ICU
  sistem; format `21 Juni 2026` diverifikasi saat testing.
- Encoding ESC/POS: sanitasi ASCII mencegah karakter rusak di struk.
