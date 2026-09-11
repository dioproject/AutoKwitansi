# AutoKwitansi

Aplikasi desktop pembuatan kwitansi SPJ (Surat Pertanggungjawaban) untuk lembaga sekolah, dibangun dengan Tauri v2. Mendukung cetak di atas kertas pre-print **Silver Horse** maupun kertas kosong.

## Fitur

- **Buat Kwitansi** — form input dengan auto-terbilang (bahasa Indonesia) dan auto-fill dari data sekolah.
- **Import PDF BKU** — ekstrak data dari BKU ARKAS langsung ke kwitansi (grouping per No. Bukti).
- **Import CSV** — bulk import dari spreadsheet.
- **Riwayat** — pencarian, hapus, cetak individual atau **batch print** (multi-select).
- **Pengaturan Cetak** — mode "Isi Nilai Saja" (Silver Horse 176 x 190 mm) atau "Kwitansi Lengkap" (kertas kosong), ukuran kertas custom, margin, font size, **Jarak TTD fleksibel** (mm).
- **Visual Drag & Drop Editor** — geser posisi field secara langsung pada preview kertas.
- **Data Sekolah** — nama, alamat, kepala sekolah + NIP, bendahara + NIP.

## Prasyarat

- [Bun](https://bun.sh) (package manager & script runner)
- [Rust](https://rustup.rs) (edition 2021)
- WebView2 (Windows, biasanya sudah terinstall)

## Instalasi & Menjalankan

```bash
# Clone repository
git clone https://github.com/dioproject/AutoKwitansi.git
cd AutoKwitansi

# Install dependencies
bun install

# Development (hot reload)
bun run tauri dev

# Build release
bun run tauri build
```

Build release menghasilkan:
- `src-tauri/target/release/bundle/nsis/AutoKwitansi_1.0.0_x64-setup.exe` (NSIS installer)
- `src-tauri/target/release/bundle/msi/AutoKwitansi_1.0.0_x64_en-US.msi` (MSI installer)

## Struktur Project

```
AutoKwitansi/
├── index.html                 # Single-page app (7 halaman)
├── src/
│   ├── main.js                # Frontend logic
│   └── styles.css             # Styling + print media queries
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs             # Module registration
│   │   ├── commands.rs        # 14 Tauri commands
│   │   ├── db.rs              # SQLite CRUD + migrations
│   │   ├── models.rs          # Data models (6 structs)
│   │   ├── terbilang.rs       # Angka → terbilang Indonesia
│   │   ├── csv_import.rs      # CSV parser
│   │   └── pdf_import.rs      # PDF BKU parser (pdf-extract)
│   ├── Cargo.toml             # Rust dependencies
│   └── tauri.conf.json        # Tauri config
├── DESIGN.md                  # Dokumen desain UI & keputusan
├── ARCHITECTURE.md            # Dokumen arsitektur teknis
└── README.md                  # File ini
```

## Testing

```bash
# Rust unit tests
cargo test

# Rust formatting check
cargo fmt --check

# Rust linting
cargo clippy -- -D warnings

# Frontend build
bun run build
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Tauri v2 |
| Frontend | Vanilla JS (ES modules) + Vite 6 |
| Backend | Rust (edition 2021) |
| Database | SQLite (rusqlite bundled) |
| PDF Parser | pdf-extract 0.12 |
| Package Manager | Bun |

## Lisensi

Private — dio project
