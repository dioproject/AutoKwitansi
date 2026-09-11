# Architecture Document — AutoKwitansi

## Tech Stack

| Layer | Technology | Versi |
|-------|-----------|-------|
| Desktop runtime | Tauri | v2 |
| Frontend bundler | Vite | 6 |
| Frontend | Vanilla JavaScript (ES modules) | ES2022 |
| Backend | Rust | edition 2021 |
| Database | SQLite (rusqlite bundled) | 0.31 |
| PDF parsing | pdf-extract | 0.12 |
| CSV parsing | csv (Rust crate) | 1.3 |
| Dialog | @tauri-apps/plugin-dialog | 2.7.3 |
| Package manager | Bun | — |
| Installer | NSIS + WiX (MSI) | — |

## Struktur Repo

```
AutoKwitansi/
├── index.html                    # Single-page app (7 section.page)
├── package.json                  # Bun/npm deps
├── vite.config.js                # Dev server :1420
├── src/
│   ├── main.js                   # Semua frontend logic (~847 baris)
│   └── styles.css                # CSS + print media queries
├── src-tauri/
│   ├── Cargo.toml                # Rust dependencies
│   ├── tauri.conf.json           # Window, bundle, build config
│   ├── capabilities/default.json # Permissions (core, dialog)
│   ├── src/
│   │   ├── main.rs               # Entry point → lib::run()
│   │   ├── lib.rs                # Module registration + 14 command handlers
│   │   ├── commands.rs           # 14 #[tauri::command] functions
│   │   ├── db.rs                 # SQLite init, migrations, CRUD
│   │   ├── models.rs             # 6 structs (serde)
│   │   ├── terbilang.rs          # Number → Indonesian words
│   │   ├── csv_import.rs         # CSV parser → Vec<CsvRow>
│   │   └── pdf_import.rs         # PDF BKU parser → BkuData
│   └── icons/                    # App icons (50+ sizes)
├── DESIGN.md
├── ARCHITECTURE.md
└── README.md
```

## Data Flow

```
┌─────────────────────────────────────────────────────┐
│                   Frontend (JS)                     │
│  index.html + main.js + styles.css                  │
│                                                     │
│  showPage() → form → invoke("cmd_*") → render      │
│  PDF dialog → invoke("cmd_parse_bku_pdf")          │
│  Print → renderKwitansiTemplate() → window.print()  │
└──────────────────┬──────────────────────────────────┘
                   │ invoke() (Tauri IPC)
                   ▼
┌─────────────────────────────────────────────────────┐
│                Backend (Rust / Tauri)                │
│                                                     │
│  commands.rs   → 14 #[command] functions            │
│  ├── cmd_terbilang                                  │
│  ├── cmd_get_sekolah / cmd_update_sekolah           │
│  ├── cmd_simpan_kwitansi / cmd_get_all / cmd_get/   │
│  │   cmd_delete / cmd_search                        │
│  ├── cmd_parse_csv / cmd_import_csv                 │
│  ├── cmd_parse_bku_pdf / cmd_import_bku             │
│  └── cmd_get_print_settings / cmd_save_print_settings│
│                                                     │
│  db.rs         → SQLite CRUD + migrations           │
│  terbilang.rs  → angka → huruf Indonesia            │
│  csv_import.rs → CSV text → Vec<CsvRow>             │
│  pdf_import.rs → pdf-extract text → grouping →      │
│                  BkuData (header + transactions)     │
└──────────────────┬──────────────────────────────────┘
                   │ rusqlite
                   ▼
┌─────────────────────────────────────────────────────┐
│              SQLite Database                         │
│  %APPDATA%/AutoKwitansi/auto_kwitansi.db            │
│                                                     │
│  sekolah       → 1 row (nama, alamat, kepsek, etc.) │
│  kwitansi      → N rows (no_kwitansi, jumlah, etc.)  │
│  print_settings → 1 row (mode, paper, margins,      │
│                   font_size, sig_gap, field_positions)│
└─────────────────────────────────────────────────────┘
```

## Database Schema

### `sekolah` (1 row, seeded default)

| Kolom | Tipe | Default |
|-------|------|---------|
| id | INTEGER PK | AUTO |
| nama_sekolah | TEXT | "Nama Sekolah" |
| alamat | TEXT | "Alamat Sekolah" |
| kota | TEXT | "Kota" |
| kepala_sekolah | TEXT | "Nama Kepala Sekolah" |
| nip_kepala | TEXT | "NIP Kepala Sekolah" |
| bendahara | TEXT | "Nama Bendahara" |
| nip_bendahara | TEXT | "NIP Bendahara" |

### `kwitansi`

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| id | INTEGER PK | AUTO |
| nomor_kwitansi | TEXT | Nomor unik |
| tanggal | TEXT | YYYY-MM-DD |
| sudah_terima_dari | TEXT | Pengirim dana |
| jumlah | REAL | Jumlah rupiah |
| terbilang | TEXT | Auto dari Rust |
| untuk_pembayaran | TEXT | Keterangan |
| kode_rekening | TEXT | Kode Rekening |
| tahun_anggaran | TEXT | 2026 |
| mengetahui / nip_mengetahui | TEXT | Kepsek |
| bendahara / nip_bendahara | TEXT | Bendahara |
| penerima | TEXT | Penerima dana |
| created_at | TEXT | datetime('now','localtime') |

Index: `idx_kwitansi_nomor`, `idx_kwitansi_tanggal`.

### `print_settings` (1 row, seeded default)

| Kolom | Tipe | Default |
|-------|------|---------|
| id | INTEGER PK | AUTO |
| mode | TEXT | "values_only" |
| paper_width | REAL | 176.0 |
| paper_height | REAL | 190.0 |
| margin_top | REAL | 10.0 |
| margin_bottom | REAL | 10.0 |
| margin_left | REAL | 10.0 |
| margin_right | REAL | 10.0 |
| font_size | REAL | 9.0 |
| sig_gap | REAL | 15.0 |
| field_positions | TEXT | '{}' (JSON) |

Migrasi: `ALTER TABLE ADD COLUMN sig_gap` jika kolom belum ada (DB lama).

## PDF Parser (`pdf_import.rs`)

Menggunakan `pdf-extract` (bukan pdfplumber). Format output berbeda:

- Label dan nilai di baris terpisah (misal `Nama Sekolah` baris 4, `: SD Negeri...` baris 11).
- Transaksi: `DD-MM-YYYY URAIAN 0 AMOUNT SALDOKODE_KEG. KODE_REK_PREFIX`
- Baris berikutnya: `KODE_REK_SUFFIX NO_BUKTI` (misal `61 BPU11`).
- Grouping transaksi per `no_bukti` → 1 BPU = 1 kwitansi dengan uraian gabungan dan jumlah total.

## Unit Testing

### Rust (saat ini)

- `terbilang.rs::test_terbilang` — 10 kasus angka → terbilang.
- `pdf_import.rs::test_parse_bku_pdf` — parse file sample `4. bku-output.pdf`, assert 21 transaksi, BPU11 = Rp 60.000 (Listrik), BNU16 = Rp 1.980.000.

### JavaScript

Belum ada unit test. Testing manual melalui UI (`bun run tauri dev`).

## Print System

1. `renderKwitansiTemplate(k)` memilih `renderValuesOnlyTemplate` atau `renderFullTemplate` berdasarkan `currentPrintSettings.mode`.
2. `renderValuesOnlyTemplate` — field absolute `position: mm`, blok tanda tangan multi-line dengan `.sig-space` (jarak TTD configurable).
3. `renderFullTemplate` — flexbox layout, `margin-bottom: {sig_gap}mm` inline pada label.
4. `cetakKwitansi()` — inject `<style>` dynamic `@page { size: WxH mm; margin: 0; }` → `window.print()`.
5. CSS `@media print` — hide sidebar/content, show only `#print-container` / `#batch-print-container`.
