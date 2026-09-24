# PRD — AutoKwitansi v3.0

## Product Overview

**AutoKwitansi** adalah aplikasi desktop untuk pembuatan kwitansi SPJ sekolah yang terintegrasi dengan data BKU dari ARKAS. Versi 3.0 menyatukan aplikasi menjadi **satu varian utuh**, menambahkan **cetak langsung ke printer thermal (ESC/POS)**, **PPh 21 6% untuk honorarium & PPh 23 4% untuk makan minum**, **riwayat group per bulan**, dan **merge transaksi manual saat import**.

## Target Users

- Bendahara sekolah (BOS/BOPP)
- Operator ARKAS
- Kepala sekolah (untuk tanda tangan)

## Goals

1. Percepatan pembuatan kwitansi dari BKU ARKAS (dari 30 menit → 2 menit per transaksi).
2. Cetak nota POS **langsung ke printer thermal USB tanpa dialog print**.
3. Kepatuhan pajak: honorarium (BNU, tenaga ahli 07.12.04, instruktur pelatih) otomatis terpotong PPh 21 6%, makan minum (konsumsi/catering/jamuan) terpotong PPh 23 4%, dengan rincian bruto/netto.
4. Fleibilitas import: gabungkan beberapa transaksi BKU menjadi 1 kwitansi sesuai keinginan user.
5. Organisasi data per bulan (accordion) untuk kemudahan pelaporan.

## Features

### F1: Satu Aplikasi Utuh (Unifikasi)
- Tidak ada lagi varian lite/full — semua fitur selalu aktif.
- Satu installer, satu `tauri.conf.json`, satu build.
- DB v2.0 lama otomatis dimigrasikan (ALTER TABLE aman).

### F2: Kwitansi SPJ (Enhanced)
- Sumber data tunggal: import BKU Per Bulan (form Buat manual dihapus v3.8.0); koreksi via Edit modal di Riwayat.
- Layout cetak full **disederhanakan**: No. (label BPU/BNU saja), Sudah Terima Dari, Sejumlah (terbilang), Untuk Pembayaran, box Rp, Mengetahui, Bendahara, Penerima + Tgl (format "21 Juni 2026"). Tanpa merk/materai/tahun anggaran/kode rekening.
- Mode `values_only` (kertas pre-print) dengan drag-drop editor tetap ada.
- Batch print multi-select.

### F3: PPh 21 6% Honorarium & PPh 23 4% Makan Minum
- **Kategori BNU** = honorarium saja: tenaga ahli (kode 07.12.04) dan instruktur/pelatih.
- Checkbox "Honorarium — potong PPh 21 6%" **auto-tercentang** jika: nomor mengandung BNU, atau kode rekening 07.12.04, atau uraian mengandung honor/honorarium/instruktur.
- Checkbox "Makan minum — potong PPh 23 4%" **auto-tercentang** jika: uraian mengandung makan/minum/konsumsi/catering/katering/snack/jamuan (bukan honorarium).
- Kedua checkbox saling eksklusif; rincian bruto → PPh → netto tampil di form, kwitansi cetak, dan struk POS.
- **Terbilang mengikuti netto**; `jumlah` di DB tetap bruto.
- BNU tidak punya tombol POS dan tidak wajib dokumen toko.

### F4: Cetak Nota POS Thermal (ESC/POS)
- Cetak **langsung ke printer thermal USB** via COM port (serialport crate) — tanpa dialog print browser.
- Setup di halaman **Printer Thermal**: port (COM3 dll), baud rate (9600–115200), lebar kertas 58/80mm, **header & footer struk kustom**, Test Print.
- **Format struk kasir** (bukan duplikat kwitansi): header (kustom → nama toko BPU → "NOTA PEMBAYARAN"), No (label + nomor acak), Tgl, ITEM, TOTAL, blok PPh, Penerima, footer (kustom → "Terima kasih").
- **No nota auto-generate random** per cetak (`YYYYMMDD-NNNN`) — bukan nomor kwitansi.
- **Modal preview** muncul sebelum cetak: user pilih 🖨️ Thermal (ESC/POS, status inline ✅/❌) atau 🖨️ Printer (fallback browser print).
- Tombol POS hanya untuk kwitansi BPU.

### F5: Import BKU Per Bulan + Merge Manual
- **Import BKU Per Bulan**: multi-PDF sekaligus, group per bulan/tahun, bulan/tahun bisa diedit inline.
- **Merge transaksi (baru)**:
  - Centang 2+ baris (bebas, tidak harus kode rekening sama) → **Gabungkan yang Dicentang** → jadi 1 kwitansi.
  - **Gabung Otomatis per Kode Rekening** — shortcut sekali klik.
  - **Uraikan Semua** / tombol ✖ per baris gabungan untuk membatalkan.
  - Baris gabungan: jumlah dijumlahkan, uraian digabung (`;`), penerima digabung (`,`), tanggal terlama, badge `Nx` + highlight kuning.
  - Import BKU per bulan: merge hanya dalam bulan yang sama.

### F6: Riwayat Group per Bulan
- Group accordion **"BKU {Bulan} {Tahun}"** (dari data import), group "Tanpa BKU" untuk input manual.
- Grup terbaru terbuka default; search = tampilan flat.
- Badge: BPU (biru), BNU (pink), PPh21/PPh23 (kuning).
- Select-all per group, batch print, POS per baris.

### F7: Dokumen BPU >Rp1jt
- **Pemicu**: kwitansi BPU dengan jumlah > Rp1.000.000.
- **Input wajib**: nama toko, alamat toko, pimpinan toko.
- **4 dokumen wajib** (checklist): BAST, Surat Pesanan, Invoice, BAP.
- Cetak POS memberi peringatan jika dokumen belum 4/4 (boleh lanjut dengan konfirmasi).
- Preview 4 dokumen (A4) tanpa harus centang dulu.

### F8: Auto-Refresh Pengaturan Cetak
- Perubahan input pengaturan langsung memperbarui preview (debounce 300ms).

## Non-Goals (v3.0)

- Bluetooth printing — hanya serial/COM (USB virtual COM).
- Printer USB murni non-virtual-COM — ditangani fallback browser print.
- Perubahan layout mode values-only — mengikuti form pre-print fisik.
- Penomoran kwitansi otomatis — nomor tetap input user.
- Export PDF dokumen — cukup cetak langsung.
- Multi-user / networking — desktop single-user.
- Upload file/scan dokumen — checklist manual.

## Success Metrics

| Metric | Target |
|--------|--------|
| Waktu cetak 1 kwitansi | < 30 detik |
| Waktu cetak nota POS (thermal) | < 5 detik tanpa dialog |
| Waktu import 10 transaksi BKU | < 1 menit |
| Waktu generate 4 dokumen BPU | < 2 menit |
| User satisfaction (survey) | > 4/5 |

## Technical Constraints

- Tauri v2 + SQLite (bundled) — tidak perlu install DB terpisah.
- Printer thermal harus muncul sebagai COM port di Windows (driver USB/virtual COM).
- ESC/POS: sanitasi ASCII (karakter non-ASCII → `?`), truncation 32 char (58mm) / 48 char (80mm), `GS V` cut.
- Tidak ada backend server — semua data lokal di `%APPDATA%/AutoKwitansi/`.
- DB lama harus tetap bisa dibuka (migrasi `add_column_if_missing` yang aman).

## Changelog

### v3.12.0 (Current)
- [NEW] Backup folder pilihan user: pilih folder, daftar backup, pulihkan tervalidasi (cadangan darurat otomatis), backup manual + otomatis tiap start

### v3.11.0
- [NEW] Halaman Dashboard: kartu total/BPU/BNU, pajak terkumpul per jenis, diagram per periode (sumber tunggal `cmd_dashboard_stats`)

### v3.10.0
- [NEW] Halaman Rekap SPJ: filter periode, kartu + tabel total (bruto/PPh/PPN/total), cetak rekapitulasi (kop + TTD, A4), export CSV

### v3.9.2
- [IMPROVED] Hapus preview inline di bawah preview kertas (cukup via tombol Lihat Preview) — halaman lebih clean

### v3.9.1
- [IMPROVED] Aksi riwayat jadi ikon + tooltip (🖨️✏️🧾🗑️); nav & simbol ber-emoji warna

### v3.9.0
- [NEW] Tombol Lihat Preview di Pengaturan Cetak: modal khusus hasil cetak (sinkron live saat angka diubah, nyaman di layar kecil)
- [IMPROVED] Field PPN di modal Edit pindah ke grid form sejajar field lain + label (Opsional)

### v3.8.1
- [FIXED] Edit modal: `populateKegiatanDatalist` ikut terhapus kemarin → ReferenceError saat buka Edit (fungsi dikembalikan)
- [FIXED] Nominal import ambil dari saldo: ekstraksi kini dari 3 token terakhir (posisi) + dukung nominal kecil tanpa titik; 2 regression test

### v3.8.0
- [REMOVED] Halaman Buat Kwitansi (form manual + `cmd_simpan_kwitansi`); alur tunggal via Import BKU Per Bulan + Edit modal; Riwayat jadi halaman awal
- [IMPROVED] Responsif: sidebar rel ikon ≤720px, grid 1 kolom, modal & preview scroll horizontal, kolom TTD 30% (dulu 120% overflow)

### v3.7.0
- [NEW] PPh 21 5% narasumber (manual di form & modal edit, eksklusif, kolom `kena_pph21_5`, badge PPh21 5%)

### v3.6.2
- [FIXED] Terbilang basi (masih bruto) di data lama: dihitung ulang otomatis tiap start mengikuti total terkini

### v3.6.1
- [FIXED] PPN mengurangi bruto (total = bruto − PPh − PPN), bukan menambah

### v3.6.0
- [NEW] PPN opsional nominal rupiah (form & modal edit, badge PPN, baris −Rp di cetak/POS, total = bruto − PPh − PPN, kolom `ppn_nominal`)

### v3.5.0
- [NEW] PPh 23 2% (sewa/jasa, manual di form & modal edit, eksklusif vs PPh lain, kolom `kena_pph23_2`)

### v3.4.2
- [FIXED] Install baru di atas DB lama gagal import "has no column named bulan": index bulan_tahun dipindah setelah migrasi + regression test

### v3.4.1
- [NEW] Import ulang anti-duplikat: hanya data baru yang masuk (`{inserted, skipped}`), data lama dilewati & tidak diubah
- [FIXED] Import & form otomatis ambil kepala sekolah/bendahara terbaru dari Data Sekolah (fallback ke nama di PDF bila kosong)

### v3.3.2
- [FIXED] Import lewatkan baris uraian 2-baris (mis. honor pengawas BPU14/BPU15): baris lanjutan kini digabung sebelum cari nomor bukti

### v3.3.1
- [FIXED] Preview hasil cetak live di Pengaturan Cetak (contoh data, ikut font/posisi/mode) — atur angka font & lihat langsung hasilnya

### v3.3.0
- [NEW] Edit kwitansi per baris via modal (terbilang netto dihitung ulang otomatis)
- [NEW] Hapus massal kwitansi yang dicentang di Riwayat
- [NEW] Field Pajak (Bruto/PPh/Netto) yang bisa digeser di Pengaturan Cetak values-only
- [NEW] Backup otomatis DB ke %APPDATA%/AutoKwitansi/backup/ tiap start (5 terbaru)
- [FIXED] Filter periode & pencarian basi direset tiap load Riwayat (data baru tak lagi "hilang")

### v3.2.0
- [NEW] Kalimat cetak berpatokan referensi resmi ARKAS 2026 (153 kode dari PDF root): `{uraian} untuk {uraian resmi} dengan Kode Rekening ... pada Tahun Anggaran ...`
- [NEW] Kolom Kode Kegiatan (auto dari import + input form dengan saran datalist)
- [IMPROVED] Deteksi pajak ikut patokan: rumpun 07.12.x = honor, 06.05.06 = makan minum

### v3.1.0
- [NEW] PPh 23 4% makan minum (auto-detect konsumsi/catering/jamuan, eksklusif vs PPh 21, kolom `kena_pph23`)
- [NEW] Filter periode per bulan di Riwayat (dropdown BKU {Bulan} {Tahun})
- [NEW] Sortir kolom tabel Riwayat via klik header (nomor/tanggal/diterima/jumlah/uraian, asc/desc)
- [NEW] Live preview "Kalimat cetak" di form Buat Kwitansi
- [IMPROVED] Kalimat gabungan natural ("... dengan Kode Rekening X pada Tahun Anggaran Y")
- [REMOVED] Menu Import Data duplikat + import CSV (digabung ke Import BKU Per Bulan)
- [REMOVED] Field cetak redundan (kode/tahun/tanggal terpisah di values-only)

### v3.0.0
- [NEW] Satu aplikasi utuh — varian lite/full dihapus
- [NEW] Cetak POS langsung ESC/POS via serialport (COM, baud rate)
- [NEW] Halaman Printer Thermal: port, baud, lebar kertas, header/footer kustom, test print, preview struk live
- [NEW] Modal preview nota POS (pilih Thermal / Printer, status inline)
- [NEW] No nota POS auto-generate random (YYYYMMDD-NNNN)
- [NEW] Format struk kasir (header toko untuk BPU, ITEM, TOTAL, footer)
- [NEW] PPh 21 6% honorarium: auto-detect BNU/07.12.04/honor/instruktur, bruto→netto, terbilang netto
- [NEW] Deskripsi BNU auto-expand (tidak pendek/monoton)
- [NEW] Riwayat accordion group "BKU {Bulan} {Tahun}" + badge BNU/PPh21
- [NEW] Merge transaksi manual saat import BKU (pilih baris → gabung → 1 kwitansi, bisa urai)
- [NEW] Gabung otomatis per kode rekening (shortcut)
- [IMPROVED] Layout cetak kwitansi disederhanakan (8 field, label BPU/BNU saja, tanpa merk/materai)
- [IMPROVED] UI Import BKU Per Bulan (card, gradient header row, input styled)
- [IMPROVED] Diferensiasi visual tombol PRINTER vs POS THERMAL
- [REMOVED] Feature flag `full`, tauri.lite.json, tauri.full.json, dist-lite/dist-full

### v2.0.0
- [NEW] Cetak Nota POS 58/80mm via browser print
- [NEW] Dokumen BPU >1jt: BAST, Surat Pesanan, Invoice, BAP
- [NEW] Import BKU Per Bulan (multi-PDF)
- [NEW] Auto-refresh preview pengaturan cetak
- [NEW] Badge BPU di riwayat, filter bulan, data toko

### v1.1.0
- Import PDF BKU dari ARKAS
- Import CSV
- Cetak kwitansi mode values_only + full
- Batch print
- Pengaturan cetak dengan drag-drop editor
