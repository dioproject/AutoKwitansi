# Architecture Document — AutoKwitansi v3.0

## Tech Stack

| Layer | Technology | Versi |
|-------|-----------|-------|
| Desktop runtime | Tauri | v2 |
| Frontend bundler | Vite | 6 |
| Frontend | Vanilla JavaScript (ES modules) | ES2022 |
| Backend | Rust | edition 2021 |
| Database | SQLite (rusqlite bundled) | 0.31 |
| Thermal printing | serialport (ESC/POS raw bytes) | 4 |
| Random generator | rand (no nota POS) | 0.8 |
| PDF parsing | pdf-extract | 0.12 |
| Dialog | @tauri-apps/plugin-dialog | 2.7.3 |
| Package manager | Bun | — |
| Installer | NSIS + WiX (MSI) | — |

> **v3.0: satu aplikasi utuh** — tidak ada lagi varian lite/full, tidak ada feature flag. Semua fitur selalu aktif.

## Struktur Repo

```
AutoKwitansi/
├── index.html                    # Single-page app (9 section.page + 2 modal)
├── package.json                  # Bun/npm deps, v3.0.0
├── vite.config.js                # Dev server :1420, outDir dist/
├── src/
│   ├── main.js                   # Inti frontend: state, form, riwayat accordion, merge, pajak (PPh 21/23)
│   ├── pos.js                    # Nota POS: modal preview, template struk, ESC/POS invoke
│   ├── bpu-docs.js               # Dokumen BPU >1jt (BAST, SP, Invoice, BAP)
│   ├── bku-period.js             # Import BKU per bulan (multi-PDF) + merge manual
│   └── styles.css                # CSS + accordion + print media + POS styles
├── src-tauri/
│   ├── Cargo.toml                # Rust dependencies (tanpa [features])
│   ├── tauri.conf.json           # Window, bundle, build config v3.0.0 (frontendDist ../dist)
│   ├── capabilities/default.json # Permissions (core, dialog)
│   └── src/
│       ├── main.rs               # Entry point → lib::run()
│       ├── lib.rs                # Module registration (9 mod) + 36 command
│       ├── commands.rs           # 34 #[tauri::command]: kwitansi, produk, penjualan, backup, dashboard, POS, docs
│       ├── db.rs                 # SQLite init, migrations, CRUD (9 tabel) + generate_pos_number
│       ├── models.rs             # 8 structs (serde)
│       ├── terbilang.rs          # Number → Indonesian words
│       ├── pdf_import.rs         # PDF BKU parser → BkuData
│       ├── bku_period.rs         # Multi-PDF BKU parse + import per bulan (+ pajak & expand BNU)
│       ├── pos_print.rs          # ESC/POS builder + serialport print + test print
│       └── bpu_docs.rs           # BPU dokumen + toko CRUD
├── README.md
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
│  main.js + pos.js + bpu-docs.js + bku-period.js + styles.css     │
│                                                                  │
│  showPage() → form → invoke("cmd_*") → render                    │
│  PDF dialog → invoke("cmd_parse_bku_pdf")                        │
│  Multi-PDF → invoke("cmd_parse_bku_pdfs")                        │
│  Merge manual → pdfRows/periodRowsByGroup (state lokal, rid)     │
│  Kwitansi print → renderKwitansiTemplate() → window.print()      │
│  POS → cetakNotaPos() → MODAL PREVIEW                            │
│        ├─ Thermal → invoke("cmd_print_pos_nota")                 │
│        └─ Printer → renderPosNotaTemplate() → window.print()     │
│  Docs → renderBAST/SuratPesanan/Invoice/BAP() → @page A4         │
└──────────────────┬───────────────────────────────────────────────┘
                   │ invoke() (Tauri IPC)
                   ▼
┌──────────────────────────────────────────────────────────────────┐
│                  Backend (Rust / Tauri)                          │
│                                                                  │
│  commands.rs   → 36 #[command] functions                         │
│  ├── cmd_terbilang                                               │
│  ├── cmd_get_sekolah / cmd_update_sekolah                        │
│  ├── cmd_update_kwitansi (terbilang total ulang, tanpa expand)   │
│  ├── cmd_get_all / cmd_get / cmd_delete / cmd_search             │
│  ├── cmd_parse_bku_pdfs / cmd_import_bku_period (pajak + expand BNU)       │
│  ├── cmd_get_print_settings / cmd_save_print_settings            │
│  ├── cmd_get_pos_settings / cmd_save_pos_settings                │
│  ├── cmd_print_pos_nota / cmd_pos_test_print          [ESC/POS]  │
│  ├── cmd_get_doc_status / cmd_set_doc_lengkap         [DOCS]     │
│  ├── cmd_update_toko                                  [DOCS]     │
│  └── cmd_parse_bku_pdfs / cmd_import_bku_period       [PERIOD]   │
│                                                                  │
│  db.rs         → SQLite CRUD + migrations (9 tabel)              │
│                  + generate_pos_number() (rand, XXXX-XXXX tanpa tanggal)   │
│  terbilang.rs  → angka → huruf Indonesia                         │
│  pdf_import.rs → pdf-extract text → grouping → BkuData           │
│  bku_period.rs → multi-PDF parse + import per bulan              │
│  pos_print.rs  → build_escpos_nota() (struk kasir)               │
│                  → serialport COM write → GS V cut               │
│  bpu_docs.rs   → BPU dokumen + toko CRUD                         │
└──────────────────┬───────────────────────────────────────────────┘
                   │ rusqlite                          │ serialport
                   ▼                                   ▼
┌────────────────────────────────┐   ┌─────────────────────────────┐
│      SQLite Database           │   │  Printer Thermal USB (COM)  │
│  %APPDATA%/AutoKwitansi/       │   │  ESC/POS 58mm (32 char)     │
│    auto_kwitansi.db            │   │  ESC/POS 80mm (48 char)     │
│                                │   └─────────────────────────────┘
│  sekolah        → 1 row        │
│  kwitansi       → N rows       │
│    (+kena_pph21/kena_pph23 v3.0) │
│  print_settings → 1 row        │
│  pos_settings   → 1 row        │
│    (+port, baud_rate,          │
│     header_text, footer_text,  │
│     last_pos_number v3.0)      │
│  bpu_dokumen    → N rows       │
└────────────────────────────────┘
```

## Build

Satu build untuk semua fitur (tidak ada varian):

```bash
bun install
bun run build                 # frontend → dist/
cd src-tauri && cargo build --release
# atau langsung:
bun run tauri build           # installer NSIS + MSI
```

## ESC/POS Printing (v3.0)

Alur cetak nota thermal:

1. Frontend: `cetakNotaPos(k)` → tampilkan **modal preview** (struk dirender HTML monospace).
2. User klik **Thermal** → `invoke("cmd_print_pos_nota", { kwitansiId })`.
3. Backend `pos_print.rs`:
   - `db::generate_pos_number()` → nomor acak `XXXX-XXXX` huruf+angka tanpa tanggal.
   - `build_escpos_nota(k, settings, nota_number)` → byte array ESC/POS:
     - Header: `header_text` kustom → fallback `nama_toko`/`alamat_toko` (BPU) → fallback "NOTA PEMBAYARAN" (center, bold).
     - Body: No (label BPU/BNU + nota number), Tgl, ITEM (uraian), TOTAL (bold, right), blok pajak (bruto/pph/netto) jika kena PPh, Penerima.
     - Footer: `footer_text` kustom → fallback "Terima kasih" (center).
     - Sanitasi ASCII, truncation per lebar kertas (32/48 char), feed 3 baris, `GS V` (cut).
   - `serialport::new(port, baud).open()` → `write_all(bytes)` → `flush()`.
4. Gagal (port kosong/tidak ada) → error ditampilkan di modal; user bisa pilih **Printer** (fallback `window.print()` dengan `@page 58/80mm`).

## Unit Testing

### Rust (8 tests)
- `terbilang.rs::test_terbilang` — 10 kasus angka → terbilang.
- `pdf_import.rs::test_parse_bku_pdf` — parse file sample, assert transaksi.
- `pos_print.rs` — `test_label_nomor_cetak_bpu/bnu/other`, `test_format_tanggal`, `test_format_currency`, `test_sanitize_ascii`.

### JavaScript
Testing manual melalui UI (`bun run tauri dev`).

## Print System

1. `renderKwitansiTemplate(k)` — pilih `renderValuesOnlyTemplate` atau `renderFullTemplate` berdasarkan `currentPrintSettings.mode`.
2. `renderFullTemplate` (v3.0, disederhanakan): header KWITANSI + No (label BPU/BNU saja), Sudah terima dari, Uang sejumlah (terbilang netto), Untuk pembayaran, box Rp, blok pajak (jika kena PPh), 3 kolom TTD (Mengetahui / Bendahara / Penerima+Tgl format "21 Juni 2026"). Tanpa merk, tanpa materai, tanpa tahun anggaran/kode rekening.
3. Auto-refresh: `handleLivePreview()` debounce 300ms → update `currentPrintSettings` → render ulang.
4. `refreshPrintPreview()` — render ulang dari `lastPreviewData` tanpa query DB.
5. `cetakKwitansi()` — inject `<style> @page { size: WxH mm }` → `window.print()`.
6. POS: modal preview → Thermal (ESC/POS backend) atau Printer (`renderPosNotaTemplate` → `window.print()` `@page 58/80mm auto`).
7. Dokumen: `renderBAST/SuratPesanan/Invoice/BAP()` — A4 layout → `@page A4`.
