# Design Document — AutoKwitansi v3.0

## Overview

Aplikasi desktop pembuatan kwitansi SPJ sekolah — **satu aplikasi utuh** (tanpa varian lite/full):

1. **Kwitansi SPJ** — buat, cetak kwitansi (pre-print / kosong), layout sederhana 8 field.
2. **PPh 21 6% Honorarium** — BNU / tenaga ahli (07.12.04) / instruktur pelatih: bruto → PPh → netto, terbilang mengikuti netto.
3. **Import Data** — PDF BKU ARKAS, multi-PDF per bulan, CSV. **Merge transaksi manual** (pilih baris → gabung jadi 1 kwitansi).
4. **Cetak Nota POS Thermal** — ESC/POS langsung ke printer USB via COM port; format struk kasir; header/footer kustom; no nota auto-generate; modal preview sebelum cetak.
5. **Riwayat Group per Bulan** — accordion "BKU {Bulan} {Tahun}".
6. **Dokumen BPU >1jt** — auto-generate BAST, Surat Pesanan, Invoice, BAP.

## User Flow

```
┌─────────────────────────────────────────────────────────────┐
│                        MAIN FLOW                            │
│                                                             │
│  1. Data Sekolah → isi nama, alamat, kepsek, bendahara      │
│  2. Printer Thermal → set COM port, baud, lebar kertas,     │
│     header/footer struk → Test Print → Simpan               │
│  3. Buat Kwitansi → isi form                                │
│     ├─ Nomor BNU / kode 07.12.04 / uraian honor             │
│     │    → checkbox PPh 21 auto-tercentang                  │
│     │    → terbilang & preview = netto (bruto − 6%)         │
│     ├─ Nomor BPU >1jt → section dokumen toko muncul         │
│     └─ Simpan & Preview → cetak kwitansi (printer biasa)    │
│  4. Import PDF BKU → parse → preview                        │
│     ├─ (opsional) centang 2+ baris → Gabungkan → 1 kwitansi │
│     ├─ (opsional) Gabung Otomatis per Kode Rekening         │
│     └─ Import yang Dipilih                                  │
│  5. Import BKU Per Bulan → multi-PDF → group per bulan      │
│     └─ merge manual per bulan (sama seperti #4)             │
│  6. Riwayat → accordion per "BKU {Bulan} {Tahun}"           │
│     ├─ Cetak → preview kwitansi → 🖨️ PRINTER               │
│     └─ POS (BPU saja) → modal preview struk                 │
│        ├─ 🖨️ Thermal → ESC/POS langsung (status inline)     │
│        └─ 🖨️ Printer → dialog print biasa (fallback)        │
│  7. Pengaturan Cetak → mode, kertas, margin, drag-drop      │
└─────────────────────────────────────────────────────────────┘
```

## Modul Frontend

| Module | Fungsi | Export |
|--------|--------|--------|
| `main.js` | State, navigasi, form + PPh 21, riwayat accordion, merge PDF, print kwitansi, POS setup page | `window.*` handlers |
| `pos.js` | Modal preview nota, template struk, cetak thermal/browser, settings POS | `isBpu()`, `cetakNotaPos()`, `cetakPosThermal()`, `cetakPosBrowser()`, `renderPosNotaTemplate()`, `loadPosSettings()`, `getPosSettings()` |
| `bpu-docs.js` | Dokumen BPU: 4 template A4, checklist status, data toko | `needsDocuments()`, `loadDocStatus()`, `allDocsComplete()`, `window.cetakDokumen()` |
| `bku-period.js` | Import multi-PDF per bulan + merge manual per group | `window.openBkuPeriodDialog()`, `window.handleImportBkuPeriod()`, merge handlers |

Semua modul di-import **statis** di `main.js` (tidak ada lagi dynamic import per varian).

## Modul Backend (Rust)

| Module | Fungsi | Commands |
|--------|--------|----------|
| `commands.rs` | 23 command + `is_honor_pph21()` + `expand_bnu_description()` | semua `cmd_*` |
| `db.rs` | SQLite CRUD + migrations + `generate_pos_number()` (rand) | — |
| `pdf_import.rs` | Parse 1 PDF BKU → BkuData | `cmd_parse_bku_pdf` |
| `bku_period.rs` | Parse N PDF + import per bulan (PPh21 & expand BNU per tx) | `cmd_parse_bku_pdfs`, `cmd_import_bku_period` |
| `pos_print.rs` | ESC/POS builder + serialport write + test print | `cmd_print_pos_nota`, `cmd_pos_test_print`, `cmd_get/save_pos_settings` |
| `bpu_docs.rs` | BPU dokumen + toko CRUD | `cmd_get_doc_status`, `cmd_set_doc_lengkap`, `cmd_update_toko` |

## UI Components

### Navigation (sidebar)
- **Buat Kwitansi** — form + checkbox PPh 21 + section dokumen BPU (kondisional)
- **Riwayat** — accordion per BKU bulan; badge BPU (biru) / BNU (pink) / PPh21 (kuning); tombol Cetak/POS/Hapus
- **Import Data** — tab PDF BKU / CSV; toolbar merge (Gabungkan yang Dicentang / Gabung Otomatis per Kode / Uraikan Semua)
- **Import BKU Per Bulan** — multi-PDF, grouped preview, toolbar merge per bulan
- **Data Sekolah** — form identitas
- **Pengaturan Cetak** — kwitansi: mode, kertas, margin, font, drag-drop editor
- **Printer Thermal** — POS: port COM, baud rate, lebar kertas, header/footer struk kustom, test print, preview struk live

### Halaman vs Printer (diferensiasi visual)
Di preview cetak, tombol dikelompokkan dengan label:
- 🖨️ **PRINTER** (box biru) → Cetak Kwitansi — printer biasa/pre-print
- 🧾 **POS THERMAL** (box hijau) → Cetak Nota POS — printer thermal

### Modal
1. **Modal POS Preview** — struk dirender monospace; tombol Thermal / Printer berdampingan; status inline (✅/❌); tutup via ✖ atau klik backdrop.
2. **Modal POS Settings** — quick access (paper width, port, baud) dari halaman lain.

### Print Templates
1. **Kwitansi Full** (v3.0 sederhana) — KWITANSI, No: BPU/BNU saja, Sudah terima dari, Uang sejumlah (terbilang netto), Untuk pembayaran, box Rp, blok bruto/PPh/netto (honorarium), TTD 3 kolom: Mengetahui / Bendahara / {Tgl "21 Juni 2026"} + Yang Menerima.
2. **Kwitansi Values Only** — pre-print, field absolute position (drag-drop).
3. **Nota POS (struk kasir)** — header kustom/toko, No label+random, Tgl, ITEM, TOTAL (bold), PPh block, Penerima, footer kustom. 32 char (58mm) / 48 char (80mm).
4. **BAST / Surat Pesanan / Invoice / BAP** — A4.

## Merge Transaksi (v3.0)

Model state: baris preview = `{ rid, tx, orig, count }`.

```
Centang 2+ baris → [Gabungkan yang Dicentang]
  ↓
mergeDisplayRows(): jumlah Σ, uraian unique-join "; ",
  penerima unique-join ", ", no_bukti join ", ",
  kode join " + " (jika beda), tanggal terlama
  ↓
baris gabungan (amber bg, badge "Nx", tombol ✖ urai)
  ↓
[✖] → splice orig kembali  |  [↺ Uraikan Semua] → init ulang dari raw
```

- Berlaku di Import PDF BKU (`pdfRows`) dan Import BKU Per Bulan (`periodRowsByGroup`, merge hanya dalam bulan sama).
- `Gabung Otomatis per Kode Rekening` = shortcut merge semua baris berkode sama.
- Import = baris yang tercentang (gabungan dihitung 1 kwitansi).

## PPh 21 6% (v3.0)

- **Auto-check**: nomor mengandung BNU, atau kode 07.12.04, atau uraian mengandung honor/honorarium/instruktur.
- Checkbox manual tetap bisa diubah user.
- Bruto disimpan di `jumlah`; PPh = 6% bruto; netto = bruto − PPh.
- `terbilang` (Rust) digenerate dari **netto** saat `kena_pph21`.
- Cetak kwitansi: blok 3 baris (Bruto / PPh 21 6% / Netto) hanya untuk honorarium.
- Cetak POS: blok sama di struk.

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

Preview struk POS di halaman Printer Thermal: `updatePosStrukPreview()` (live saat ketik header/footer) + `renderPosPaperPreview()` (lebar kertas 58→145px / 80→200px).
