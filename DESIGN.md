# Design Document — AutoKwitansi v2.0

## Overview

Aplikasi desktop pembuatan kwitansi SPJ sekolah dengan fitur:
1. **Kwitansi SPJ** — Buat, edit, cetak kwitansi (A4/Pre-print).
2. **Import Data** — Import dari PDF BKU ARKAS atau CSV.
3. **Import BKU Per Bulan** — Multi-PDF BKU, dikelompokkan per bulan/tahun.
4. **Cetak Nota POS** — Nota POS thermal 58/80mm via USB/Bluetooth untuk BPU.
5. **Dokumen BPU >1jt** — Auto-generate BAST, Surat Pesanan, Invoice, BAP.

## User Flow

```
┌─────────────────────────────────────────────────────────────┐
│                        MAIN FLOW                            │
│                                                             │
│  1. Data Sekolah → Isi nama, alamat, kepsek, bendahara     │
│  2. Buat Kwitansi → Isi form → Simpan & Preview            │
│     ├─ Non-BPU → Cetak kwitansi A4                          │
│     └─ BPU → Cetak Nota POS (58/80mm)                      │
│        └─ BPU >1jt → Wajib lengkapi 4 dokumen dulu         │
│  3. Import PDF BKU → Parse 1 file → Import transaksi        │
│  4. Import BKU Per Bulan → Parse N file → Group per bulan   │
│  5. Riwayat → Cari, filter bulan, cetak, hapus              │
│  6. Pengaturan Cetak → Atur kertas, margin, mode            │
│     └─ Auto-refresh preview saat ubah pengaturan            │
└─────────────────────────────────────────────────────────────┘
```

## Modul Frontend

| Module | Fungsi | Export |
|--------|--------|--------|
| `main.js` | Inti: state, navigation, form, print, search, refresh | `window.*` handlers |
| `pos.js` | POS print: template 58/80mm, `isBpu()`, settings | `isBpu()`, `cetakNotaPos()`, `renderPosNotaTemplate()` |
| `bpu-docs.js` | Dokumen BPU: 4 template A4, checklist status | `needsDocuments()`, `loadDocStatus()`, `cetakDokumen()` |
| `bku-period.js` | Import multi-PDF BKU per bulan | `openBkuPeriodDialog()`, `handleImportBkuPeriod()` |

## Modul Backend (Rust)

| Module | Fungsi | Commands |
|--------|--------|----------|
| `commands.rs` | 21 command dispatcher | Semua `cmd_*` |
| `db.rs` | SQLite CRUD + migrations | — |
| `pdf_import.rs` | Parse 1 PDF BKU → BkuData | `cmd_parse_bku_pdf` |
| `bku_period.rs` | Parse N PDF BKU + import per bulan | `cmd_parse_bku_pdfs`, `cmd_import_bku_period` |
| `pos_print.rs` | POS settings CRUD | `cmd_get_pos_settings`, `cmd_save_pos_settings` |
| `bpu_docs.rs` | BPU dokumen + toko CRUD | `cmd_get_doc_status`, `cmd_set_doc_lengkap`, `cmd_update_toko` |

## Feature Flags

```toml
[features]
default = []        # Kwitansi SPJ dasar
full = []           # Semua fitur: POS + Docs + BKU Period
```

Semua modul baru (`pos_print.rs`, `bpu_docs.rs`, `bku_period.rs`) selalu dikompilasi.
Feature flag `full` dimaksudkan untuk build installer yang menyertakan semua fitur.
Default build menghasilkan kwitansi + import dasar saja.

## UI Components

### Navigation
- **Buat Kwitansi** — Form input + dokumen checklist ( kondisional untuk BPU >1jt )
- **Riwayat** — Tabel dengan badge BPU, filter bulan, tombol Cetak/POS/Hapus
- **Import Data** — Tab PDF BKU / CSV
- **Import BKU Per Bulan** — Multi-PDF upload, grouped preview
- **Data Sekolah** — Form nama, alamat, kepsek, bendahara
- **Pengaturan Cetak** — Mode, kertas, margin, font, drag-drop editor

### Print Templates
1. **Kwitansi Full** — Header KWITANSI + body + footer 3 kolom tanda tangan
2. **Kwitansi Values Only** — Pre-print kertas, field absolute position (drag-drop)
3. **Nota POS** — Struk monospace 58/80mm, kop + data + footer
4. **BAST** — Berita Acara Serah Terima A4
5. **Surat Pesanan** — Surat pesanan A4
6. **Invoice** — Tagihan A4
7. **BAP** — Berita Acara Pemeriksaan Barang A4

## Auto-Refresh System

```
User ubah input di Pengaturan Cetak
  ↓
handleLivePreview() [debounce 300ms]
  ↓
Update currentPrintSettings in-memory
  ↓
renderPaperPreview() — update visual editor
  ↓
refreshPrintPreview() — render ulang #print-container dari lastPreviewData
```

`lastPreviewData` di-cache saat `showPrintPreview()` / `showBatchPrintPreview()` agar refresh tidak perlu query DB ulang.
