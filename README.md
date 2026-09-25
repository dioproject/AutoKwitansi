# AutoKwitansi v3.0

Aplikasi desktop pembuatan kwitansi SPJ (Surat Pertanggungjawaban) untuk lembaga sekolah, dibangun dengan Tauri v2. **Satu aplikasi utuh** — semua fitur aktif tanpa varian.

## Fitur

- **Import BKU Per Bulan** — alur utama: multi-PDF sekaligus, group per bulan, merge manual, auto-detect pajak, anti-duplikat.
- **PPh 21 6% Honorarium** — checkbox otomatis untuk BNU / kode 07.12.04 / uraian honor & instruktur; cetak bruto → PPh → netto; terbilang mengikuti netto.
- **PPh 21 5% Narasumber** — checkbox manual di form & modal edit (eksklusif).
- **PPh 23 4% Makan Minum** — checkbox otomatis untuk uraian makan/minum/konsumsi/catering/jamuan; eksklusif terhadap PPh 21.
- **Referensi ARKAS 2026** — 153 kode kegiatan resmi (dari PDF) jadi patokan kalimat cetak + saran input + deteksi pajak.
- **Cetak Nota POS Thermal (ESC/POS)** — cetak langsung ke printer thermal USB via COM port **tanpa dialog print**. Format struk kasir dengan header/footer kustom. Preview modal sebelum cetak, fallback ke printer biasa.
- **Halaman Printer Thermal** — setup port, baud rate, lebar kertas (58/80mm), header & footer struk kustom, test print, preview kertas live.
- **No Nota Auto-Generate** — setiap cetak POS mendapat nomor acak unik (`YYYYMMDD-NNNN`), bukan nomor kwitansi.
- **Import BKU Per Bulan** — multi-PDF sekaligus, dikelompokkan per bulan/tahun, merge manual per bulan.
- **Riwayat Group per Bulan** — accordion "BKU {Bulan} {Tahun}", terbaru terbuka; badge BPU/BNU/PPh21/PPh21 5%/PPh23/PPh23 2%/PPN; pencarian flat.
- **Rekap SPJ** — tabel + kartu total per periode (bruto/PPh/PPN/total), cetak rekapitulasi (kop + TTD), export CSV, panel Kesiapan LPJ + Perbaiki via modal Edit.
- **Dashboard** — kartu total, BPU vs BNU, pajak terkumpul per jenis, diagram per periode (agregat backend).
- **Backup pilihan folder** — folder backup bisa dipilih user + daftar + pulihkan (otomatis tiap start).
- **Produk (POS Kasir)** — master mandiri: nama, harga, kategori, satuan bebas isi; CRUD + cari + filter kategori.
- **POS Kasir** — katalog, keranjang (qty/diskon/tunai/kembalian), tanggal bebas, simpan, cetak struk thermal, riwayat + cetak ulang. Terpisah dari kwitansi/BKU.
- **Dokumen BPU >Rp1jt** — BAST, Surat Pesanan, Invoice, BAP otomatis.
- **Pengaturan Cetak** — mode "Isi Nilai Saja" (kertas pre-print) atau "Kwitansi Lengkap", ukuran kertas custom, margin, font, jarak TTD, **visual drag & drop editor**.
- **Data Sekolah** — nama, alamat, kepala sekolah + NIP, bendahara + NIP.

## Prasyarat

- [Bun](https://bun.sh) (package manager & script runner)
- [Rust](https://rustup.rs) (edition 2021)
- WebView2 (Windows, biasanya sudah terinstall)
- Printer thermal USB (opsional) — muncul sebagai COM port di Device Manager

## Instalasi & Menjalankan

```bash
git clone https://github.com/dioproject/AutoKwitansi.git
cd AutoKwitansi

bun install

# Development (hot reload)
bun run tauri dev

# Build release
bun run tauri build
```

Build release menghasilkan installer NSIS (.exe) dan MSI di `src-tauri/target/release/bundle/`.

> **Migrasi dari v2.0**: DB lama di `%APPDATA%/AutoKwitansi/auto_kwitansi.db` otomatis dimigrasikan (ALTER TABLE aman) saat pertama kali jalan — kolom `kena_pph21`, `kena_pph23`, `port`, `baud_rate`, `header_text`, `footer_text`, `last_pos_number` ditambahkan sendiri.

## Setup Printer Thermal

1. Colok printer thermal USB → cek **Device Manager → Ports (COM & LPT)** → catat nomor COM (mis. `COM3`).
2. Buka aplikasi → sidebar **Printer Thermal**.
3. Isi **Port** (mis. `COM3`), pilih **Baud Rate** (umumnya 9600), pilih lebar kertas (58/80mm).
4. Isi **Header/Footer** struk sesuai keinginan (nama toko, ucapan terima kasih, dll).
5. Klik **Test Print** → jika keluar struk test, klik **Simpan**.
6. Cetak nota: tombol **POS** di riwayat/preview → modal preview muncul → pilih **Thermal** (langsung) atau **Printer** (dialog biasa).

## Struktur Project

```
AutoKwitansi/
├── index.html                 # Single-page app (9 section.page + 2 modal)
├── src/
│   ├── main.js                # Inti frontend: state, form, riwayat accordion, merge, PPh 21
│   ├── pos.js                 # Nota POS: modal preview, template struk, ESC/POS invoke
│   ├── bpu-docs.js            # Dokumen BPU >1jt (BAST, SP, Invoice, BAP)
│   ├── bku-period.js          # Import BKU per bulan (multi-PDF) + merge manual
│   └── styles.css             # Styling + accordion + print media queries
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs             # Module registration (9 mod) + 34 command
│   │   ├── commands.rs        # 23 Tauri commands + deteksi PPh 21 + expand BNU
│   │   ├── db.rs              # SQLite CRUD + migrations + generate_pos_number()
│   │   ├── models.rs          # Data models (8 structs)
│   │   ├── pos_print.rs       # ESC/POS builder + serialport printing
│   │   ├── terbilang.rs       # Angka → terbilang Indonesia
│   │   ├── pdf_import.rs      # PDF BKU parser (pdf-extract)
│   │   ├── bku_period.rs      # Multi-PDF parse + import per bulan
│   │   └── bpu_docs.rs        # BPU dokumen + toko CRUD
│   ├── Cargo.toml             # Rust dependencies (serialport, rand)
│   └── tauri.conf.json        # Tauri config v3.0.0
├── README.md                  # File ini
├── ARCHITECTURE.md            # Arsitektur teknis
├── DESIGN.md                  # Desain UI & alur
├── prd.md                     # Product requirements
├── rules.md                   # Coding & business rules
└── schema.md                  # Skema database
```

## Testing

```bash
cd src-tauri
cargo test          # 8 unit tests (pos_print, terbilang, pdf_import)
cargo fmt --check
cargo clippy -- -D warnings

bun run build       # Frontend build
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Tauri v2 |
| Frontend | Vanilla JS (ES modules) + Vite 6 |
| Backend | Rust (edition 2021) |
| Database | SQLite (rusqlite bundled) |
| Thermal Print | serialport 4 (ESC/POS raw bytes) |
| Random | rand 0.8 (no nota POS) |
| PDF Parser | pdf-extract 0.12 |
| Package Manager | Bun |

## Lisensi

Private — dio project
