# Database Schema — AutoKwitansi v3.0

Database: `%APPDATA%/AutoKwitansi/auto_kwitansi.db` (SQLite, WAL mode, foreign_keys ON)

> **Migrasi v2.0 → v3.0**: semua kolom baru ditambahkan otomatis via `add_column_if_missing()` (ALTER TABLE aman, tidak menghapus data).

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
| tanggal | TEXT | — | YYYY-MM-DD (dari input date) |
| sudah_terima_dari | TEXT | — | Pengirim dana |
| jumlah | REAL | 0 | Jumlah bruto rupiah |
| terbilang | TEXT | "" | Auto dari Rust `terbilang()` — **mengikuti netto jika kena PPh 21/23** |
| untuk_pembayaran | TEXT | "" | Keterangan barang/jasa — **auto-expand untuk BNU** |
| kode_rekening | TEXT | "" | Kode rekening ARKAS |
| tahun_anggaran | TEXT | "" | 2026 |
| bulan | TEXT | "" | Bulan BKU (APRIL, MEI, dst) — kosong jika input manual |
| mengetahui | TEXT | "" | Kepala Sekolah |
| nip_mengetahui | TEXT | "" | NIP |
| bendahara | TEXT | "" | Bendahara |
| nip_bendahara | TEXT | "" | NIP |
| penerima | TEXT | "" | Penerima uang |
| nama_toko | TEXT | "" | Nama toko (BPU >1jt) — juga dipakai header nota POS |
| alamat_toko | TEXT | "" | Alamat toko (BPU >1jt) |
| pimpinan_toko | TEXT | "" | Pimpinan toko (BPU >1jt) |
| created_at | TEXT | datetime('now','localtime') | Auto timestamp |
| kena_pph21 | INTEGER | 0 | **[v3.0]** 1 = honorarium kena PPh 21 6% |
| kena_pph23 | INTEGER | 0 | **[v3.1]** 1 = makan minum kena PPh 23 4% (saling eksklusif dengan PPh 21) |
| kode_kegiatan | TEXT | "" | **[v3.2]** Kode referensi kegiatan ARKAS (06.05.06, 07.12.04) — patokan uraian resmi |

**Index:**
- `idx_kwitansi_nomor` ON `nomor_kwitansi`
- `idx_kwitansi_tanggal` ON `tanggal`
- `idx_kwitansi_bulan_tahun` ON `(bulan, tahun_anggaran)`

**Relasi:**
- 1 kwitansi → 0..1 bpu_dokumen (via `kwitansi_id`)

**Catatan pajak (kena_pph21=1 atau kena_pph23=1):**
- `jumlah` tetap menyimpan **bruto**.
- PPh 21 = 6% × bruto; PPh 23 = 4% × bruto; netto = bruto − PPh (dihitung saat render/print, tidak disimpan).
- `terbilang` digenerate dari **netto**.

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
| paper_width | INTEGER | 58 | Lebar kertas thermal: 58 atau 80 (mm) |
| port | TEXT | "" | **[v3.0]** COM port printer (COM3, /dev/ttyUSB0) |
| baud_rate | INTEGER | 9600 | **[v3.0]** 9600–115200 |
| header_text | TEXT | "" | **[v3.0]** Header struk kustom (multi-baris, rata tengah). Kosong = auto dari nama_toko (BPU) atau "NOTA PEMBAYARAN" |
| footer_text | TEXT | "" | **[v3.0]** Footer struk kustom. Kosong = "Terima kasih" |
| last_pos_number | INTEGER | 0 | **[v3.0]** (dicadangkan) — no nota saat ini digenerate random per cetak |

> Seed: 1 row default saat pertama kali init DB.
> Kolom `connection` (v2.0) tidak dipakai lagi — koneksi selalu via serial/COM port.

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
                   │ kena_pph21 ★ │
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

┌────────────────┐   ┌────────────────────┐
│ print_settings │   │   pos_settings     │
├────────────────┤   ├────────────────────┤
│ id (PK)        │   │ id (PK)            │
│ mode           │   │ paper_width        │
│ paper_width    │   │ port ★             │
│ paper_height   │   │ baud_rate ★        │
│ margins...     │   │ header_text ★      │
│ field_positions│   │ footer_text ★      │
└────────────────┘   │ last_pos_number ★  │
                     └────────────────────┘
★ = kolom baru v3.0
```
