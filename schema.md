# Database Schema — AutoKwitansi v2.0

Database: `%APPDATA%/AutoKwitansi/auto_kwitansi.db` (SQLite)

## Tabel: `sekolah`

| Kolom | Tipe | Default | Keterangan |
|-------|------|---------|------------|
| id | INTEGER PK | AUTO | — |
| nama_sekolah | TEXT | "Nama Sekolah" | Nama lengkap sekolah |
| alamat | TEXT | "Alamat Sekolah" | Alamat jalan |
| kota | TEXT | "Kota" | Kabupaten/Kota |
| kepala_sekolah | TEXT | "Nama Kepala Sekolah" | Untuk tanda tangan Mengetahui |
| nip_kepala | TEXT | "NIP Kepala Sekolah" | NIP |
| bendahara | TEXT | "Nama Bendahara" | Untuk tanda tangan Bendahara |
| nip_bendahara | TEXT | "NIP Bendahara" | NIP |

> Seed: 1 row default saat pertama kali init DB.

---

## Tabel: `kwitansi`

| Kolom | Tipe | Default | Keterangan |
|-------|------|---------|------------|
| id | INTEGER PK | AUTO | — |
| nomor_kwitansi | TEXT | — | No bukti (BPU11, BNU16, 001/KWT/2026) |
| tanggal | TEXT | — | DD-MM-YYYY atau YYYY-MM-DD |
| sudah_terima_dari | TEXT | — | Pengirim dana |
| jumlah | REAL | 0 | Jumlah rupiah |
| terbilang | TEXT | "" | Auto dari Rust `terbilang()` |
| untuk_pembayaran | TEXT | "" | Keterangan barang/jasa |
| kode_rekening | TEXT | "" | Kode rekening ARKAS |
| tahun_anggaran | TEXT | "" | 2026 |
| bulan | TEXT | "" | Bulan BKU (APRIL, MEI, dst) — kosong jika input manual |
| mengetahui | TEXT | "" | Kepala Sekolah |
| nip_mengetahui | TEXT | "" | NIP |
| bendahara | TEXT | "" | Bendahara |
| nip_bendahara | TEXT | "" | NIP |
| penerima | TEXT | "" | Penerima uang |
| nama_toko | TEXT | "" | Nama toko (BPU >1jt) |
| alamat_toko | TEXT | "" | Alamat toko (BPU >1jt) |
| pimpinan_toko | TEXT | "" | Pimpinan toko (BPU >1jt) |
| created_at | TEXT | datetime('now','localtime') | Auto timestamp |

**Index:**
- `idx_kwitansi_nomor` ON `nomor_kwitansi`
- `idx_kwitansi_tanggal` ON `tanggal`
- `idx_kwitansi_bulan_tahun` ON `(bulan, tahun_anggaran)`

**Relasi:**
- 1 kwitansi → 0..1 bpu_dokumen (via `kwitansi_id`)

---

## Tabel: `print_settings`

| Kolom | Tipe | Default | Keterangan |
|-------|------|---------|------------|
| id | INTEGER PK | AUTO | — |
| mode | TEXT | "values_only" | `values_only` (pre-print) atau `full` (kosongan) |
| paper_width | REAL | 176.0 | mm |
| paper_height | REAL | 190.0 | mm |
| margin_top | REAL | 10.0 | mm |
| margin_bottom | REAL | 10.0 | mm |
| margin_left | REAL | 10.0 | mm |
| margin_right | REAL | 10.0 | mm |
| font_size | REAL | 9.0 | pt |
| sig_gap | REAL | 15.0 | mm — jarak antara label TTD dengan nama |
| field_positions | TEXT | '{}' | JSON posisi field (mode values_only) |

> Seed: 1 row default saat pertama kali init DB.

---

## Tabel: `pos_settings`

| Kolom | Tipe | Default | Keterangan |
|-------|------|---------|------------|
| id | INTEGER PK | AUTO | — |
| paper_width | INTEGER | 58 | Lebar kertas POS: 58 atau 80 (mm) |
| connection | TEXT | "USB" | `USB` atau `Bluetooth` |

> Seed: 1 row default saat pertama kali init DB.

---

## Tabel: `bpu_dokumen`

| Kolom | Tipe | Default | Keterangan |
|-------|------|---------|------------|
| id | INTEGER PK | AUTO | — |
| kwitansi_id | INTEGER | — | FK → kwitansi.id (ON DELETE CASCADE) |
| dok_bast | INTEGER | 0 | 0=belum, 1=sudah lengkap |
| dok_surat_pesanan | INTEGER | 0 | 0=belum, 1=sudah lengkap |
| dok_invoice | INTEGER | 0 | 0=belum, 1=sudah lengkap |
| dok_bap | INTEGER | 0 | 0=belum, 1=sudah lengkap |
| updated_at | TEXT | datetime('now','localtime') | Auto timestamp |

**Index:**
- `idx_bpu_dokumen_kwitansi` ON `kwitansi_id`

**Relasi:**
- N:1 ke kwitansi (via `kwitansi_id`)
- Upsert: 1 kwitansi punya max 1 baris dokumen

---

## ER Diagram

```
┌──────────┐       ┌──────────────┐
│ sekolah  │       │   kwitansi   │
├──────────┤       ├──────────────┤
│ id (PK)  │       │ id (PK)      │
│ nama     │       │ nomor_kwit   │
│ alamat   │       │ tanggal      │
│ kepala   │       │ jumlah       │
│ bendahara│       │ bulan        │
└──────────┘       │ nama_toko    │
                   │ alamat_toko  │
                   │ pimpinan_toko│
                   └──────┬───────┘
                          │ 1
                          │
                   ┌──────┴───────┐
                   │ bpu_dokumen  │
                   ├──────────────┤
                   │ id (PK)      │
                   │ kwitansi_id  │ → FK kwitansi.id
                   │ dok_bast     │
                   │ dok_sp       │
                   │ dok_invoice  │
                   │ dok_bap      │
                   └──────────────┘

┌────────────────┐   ┌────────────────┐
│ print_settings │   │ pos_settings   │
├────────────────┤   ├────────────────┤
│ id (PK)        │   │ id (PK)        │
│ mode           │   │ paper_width    │
│ paper_width    │   │ connection     │
│ paper_height   │   └────────────────┘
│ margins...     │
│ field_positions│
└────────────────┘
```
