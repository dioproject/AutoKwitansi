# Architecture Document — AutoKwitansi v2.0

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
├── index.html                    # Single-page app (8 section.page)
├── package.json                  # Bun/npm deps, v2.0.0
├── vite.config.js                # Dev server :1420
├── src/
│   ├── main.js                   # Inti frontend + import modules
│   ├── pos.js                    # POS print (nota BPU, 58/80mm)
│   ├── bpu-docs.js               # Dokumen BPU >1jt (BAST, SP, Invoice, BAP)
│   ├── bku-period.js             # Import BKU per bulan (multi-PDF)
│   └── styles.css                # CSS + print media + POS/doc styles
├── src-tauri/
│   ├── Cargo.toml                # Rust dependencies + features
│   ├── tauri.conf.json           # Window, bundle, build config v2.0.0
│   ├── capabilities/default.json # Permissions (core, dialog)
│   └── src/
│       ├── main.rs               # Entry point → lib::run()
│       ├── lib.rs                # Module registration (7 mod) + 21 command
│       ├── commands.rs           # 21 #[tauri::command] functions
│       ├── db.rs                 # SQLite init, migrations, CRUD (5 tabel)
│       ├── models.rs             # 9 structs (serde)
│       ├── terbilang.rs          # Number → Indonesian words
│       ├── csv_import.rs         # CSV parser → Vec<CsvRow>
│       ├── pdf_import.rs         # PDF BKU parser → BkuData
│       ├── bku_period.rs         # Multi-PDF BKU parse + import per bulan
│       ├── pos_print.rs          # POS print settings CRUD
│       └── bpu_docs.rs           # BPU dokumen + toko CRUD
├── ARCHITECTURE.md
├── DESIGN.md
├── rules.md
├── schema.md
└── prd.md
```

## Data Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                       Frontend (JS)                              │
│  main.js + pos.js + bpu-docs.js + bku-period.js + styles.css    │
│                                                                  │
│  showPage() → form → invoke("cmd_*") → render                   │
│  PDF dialog → invoke("cmd_parse_bku_pdf")                       │
│  Multi-PDF → invoke("cmd_parse_bku_pdfs")                       │
│  Print → renderKwitansiTemplate() → window.print()               │
│  POS → renderPosNotaTemplate() → @page 58/80mm                  │
│  Docs → renderBAST/SuratPesanan/Invoice/BAP() → @page A4        │
└──────────────────┬───────────────────────────────────────────────┘
                   │ invoke() (Tauri IPC)
                   ▼
┌──────────────────────────────────────────────────────────────────┐
│                  Backend (Rust / Tauri)                           │
│                                                                  │
│  commands.rs   → 21 #[command] functions                         │
│  ├── cmd_terbilang                                               │
│  ├── cmd_get_sekolah / cmd_update_sekolah                        │
│  ├── cmd_simpan_kwitansi / cmd_get_all / cmd_get/                │
│  │   cmd_delete / cmd_search                                     │
│  ├── cmd_parse_csv / cmd_import_csv                              │
│  ├── cmd_parse_bku_pdf / cmd_import_bku                          │
│  ├── cmd_get_print_settings / cmd_save_print_settings            │
│  ├── cmd_get_pos_settings / cmd_save_pos_settings    [POS]       │
│  ├── cmd_get_doc_status / cmd_set_doc_lengkap          [DOCS]    │
│  ├── cmd_update_toko                                   [DOCS]    │
│  └── cmd_parse_bku_pdfs / cmd_import_bku_period       [PERIOD]   │
│                                                                  │
│  db.rs         → SQLite CRUD + migrations (5 tabel)              │
│  terbilang.rs  → angka → huruf Indonesia                         │
│  csv_import.rs → CSV text → Vec<CsvRow>                          │
│  pdf_import.rs → pdf-extract text → grouping → BkuData           │
│  bku_period.rs → multi-PDF parse + import per bulan              │
│  pos_print.rs  → POS settings CRUD                               │
│  bpu_docs.rs   → BPU dokumen + toko CRUD                         │
└──────────────────┬───────────────────────────────────────────────┘
                   │ rusqlite
                   ▼
┌──────────────────────────────────────────────────────────────────┐
│                SQLite Database                                    │
│  %APPDATA%/AutoKwitansi/auto_kwitansi.db                        │
│                                                                  │
│  sekolah        → 1 row (nama, alamat, kepsek, etc.)            │
│  kwitansi       → N rows (no_kwitansi, jumlah, bulan, toko)     │
│  print_settings → 1 row (mode, paper, margins, field_positions)  │
│  pos_settings   → 1 row (paper_width: 58|80, connection)        │
│  bpu_dokumen    → N rows (kwitansi_id, 4 dokumen booleans)      │
└──────────────────────────────────────────────────────────────────┘
```

## Build Variants

| Variant | Feature Flag | Deskripsi |
|---------|-------------|-----------|
| Default | (no flag) | Kwitansi SPJ dasar + Import PDF/CSV |
| Full | `--features full` | Semua fitur: POS, Dokumen BPU, BKU Per Bulan |

Build command:
```bash
# Default (kwitansi saja)
bun run build && cd src-tauri && cargo build --release

# Full (semua fitur)
bun run build && cd src-tauri && cargo build --release --features full
```

## Unit Testing

### Rust
- `terbilang.rs::test_terbilang` — 10 kasus angka → terbilang.
- `pdf_import.rs::test_parse_bku_pdf` — parse file sample, assert transaksi.

### JavaScript
Testing manual melalui UI (`bun run tauri dev`).

## Print System

1. `renderKwitansiTemplate(k)` — pilih `renderValuesOnlyTemplate` atau `renderFullTemplate` berdasarkan `currentPrintSettings.mode`.
2. Auto-refresh: `handleLivePreview()` debounce 300ms → update `currentPrintSettings` → render ulang.
3. `refreshPrintPreview()` — render ulang dari `lastPreviewData` tanpa query DB.
4. `cetakKwitansi()` — inject `<style> @page { size: WxH mm }` → `window.print()`.
5. POS: `renderPosNotaTemplate(k)` — struk monospace 58/80mm → `@page size:58mm auto`.
6. Dokumen: `renderBAST/SuratPesanan/Invoice/BAP()` — A4 layout → `@page A4`.
