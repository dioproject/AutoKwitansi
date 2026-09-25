use crate::models::{BpuDokumen, Kwitansi, PosSettings, PrintSettings, Sekolah};
use rusqlite::{params, Connection, Result};
use std::path::PathBuf;

fn get_db_path() -> PathBuf {
    let mut path = dirs_next().unwrap_or_else(|| PathBuf::from("."));
    path.push("auto_kwitansi.db");
    path
}

fn dirs_next() -> Option<PathBuf> {
    if let Some(data_dir) = std::env::var_os("APPDATA") {
        let mut p = PathBuf::from(data_dir);
        p.push("AutoKwitansi");
        std::fs::create_dir_all(&p).ok();
        Some(p)
    } else {
        let mut p = PathBuf::from(".");
        p.push("data");
        std::fs::create_dir_all(&p).ok();
        Some(p)
    }
}

pub fn get_connection() -> Result<Connection> {
    let path = get_db_path();
    let conn = Connection::open(path)?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
    Ok(conn)
}

fn column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info(?1) WHERE name = ?2",
        params![table, column],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

fn add_column_if_missing(
    conn: &Connection,
    table: &str,
    column: &str,
    typedef: &str,
) -> Result<bool> {
    if column_exists(conn, table, column)? {
        return Ok(false);
    }
    conn.execute_batch(&format!(
        "ALTER TABLE {} ADD COLUMN {} {}",
        table, column, typedef
    ))?;
    Ok(true)
}

pub fn init_db() -> Result<()> {
    let conn = get_connection()?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS sekolah (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nama_sekolah TEXT NOT NULL DEFAULT '',
            alamat TEXT NOT NULL DEFAULT '',
            kota TEXT NOT NULL DEFAULT '',
            kepala_sekolah TEXT NOT NULL DEFAULT '',
            nip_kepala TEXT NOT NULL DEFAULT '',
            bendahara TEXT NOT NULL DEFAULT '',
            nip_bendahara TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS kwitansi (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nomor_kwitansi TEXT NOT NULL,
            tanggal TEXT NOT NULL,
            sudah_terima_dari TEXT NOT NULL,
            jumlah REAL NOT NULL DEFAULT 0,
            terbilang TEXT NOT NULL DEFAULT '',
            untuk_pembayaran TEXT NOT NULL DEFAULT '',
            kode_rekening TEXT NOT NULL DEFAULT '',
            tahun_anggaran TEXT NOT NULL DEFAULT '',
            bulan TEXT NOT NULL DEFAULT '',
            mengetahui TEXT NOT NULL DEFAULT '',
            nip_mengetahui TEXT NOT NULL DEFAULT '',
            bendahara TEXT NOT NULL DEFAULT '',
            nip_bendahara TEXT NOT NULL DEFAULT '',
            penerima TEXT NOT NULL DEFAULT '',
            nama_toko TEXT NOT NULL DEFAULT '',
            alamat_toko TEXT NOT NULL DEFAULT '',
            pimpinan_toko TEXT NOT NULL DEFAULT '',
            created_at TEXT DEFAULT (datetime('now','localtime')),
            kena_pph21 INTEGER NOT NULL DEFAULT 0,
            kena_pph21_5 INTEGER NOT NULL DEFAULT 0,
            kena_pph23 INTEGER NOT NULL DEFAULT 0,
            kena_pph23_2 INTEGER NOT NULL DEFAULT 0,
            ppn_nominal REAL NOT NULL DEFAULT 0,
            kode_kegiatan TEXT NOT NULL DEFAULT ''
        );

        CREATE INDEX IF NOT EXISTS idx_kwitansi_nomor ON kwitansi(nomor_kwitansi);
        CREATE INDEX IF NOT EXISTS idx_kwitansi_tanggal ON kwitansi(tanggal);

        CREATE TABLE IF NOT EXISTS print_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mode TEXT NOT NULL DEFAULT 'values_only',
            paper_width REAL NOT NULL DEFAULT 176.0,
            paper_height REAL NOT NULL DEFAULT 190.0,
            margin_top REAL NOT NULL DEFAULT 10.0,
            margin_bottom REAL NOT NULL DEFAULT 10.0,
            margin_left REAL NOT NULL DEFAULT 10.0,
            margin_right REAL NOT NULL DEFAULT 10.0,
            font_size REAL NOT NULL DEFAULT 9.0,
            sig_gap REAL NOT NULL DEFAULT 15.0,
            field_positions TEXT NOT NULL DEFAULT '{}'
        );

        CREATE TABLE IF NOT EXISTS bpu_dokumen (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kwitansi_id INTEGER NOT NULL,
            dok_bast INTEGER NOT NULL DEFAULT 0,
            dok_surat_pesanan INTEGER NOT NULL DEFAULT 0,
            dok_invoice INTEGER NOT NULL DEFAULT 0,
            dok_bap INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (kwitansi_id) REFERENCES kwitansi(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_bpu_dokumen_kwitansi ON bpu_dokumen(kwitansi_id);

        CREATE TABLE IF NOT EXISTS pos_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            paper_width INTEGER NOT NULL DEFAULT 58,
            port TEXT NOT NULL DEFAULT '',
            baud_rate INTEGER NOT NULL DEFAULT 9600,
            header_text TEXT NOT NULL DEFAULT '',
            footer_text TEXT NOT NULL DEFAULT '',
            last_pos_number INTEGER NOT NULL DEFAULT 0
        );
        ",
    )?;

    // Migration: add new columns if missing (for existing DBs)
    let column_migrations: [(&str, &str, &str); 16] = [
        ("print_settings", "sig_gap", "REAL NOT NULL DEFAULT 15.0"),
        ("kwitansi", "bulan", "TEXT NOT NULL DEFAULT ''"),
        ("kwitansi", "nama_toko", "TEXT NOT NULL DEFAULT ''"),
        ("kwitansi", "alamat_toko", "TEXT NOT NULL DEFAULT ''"),
        ("kwitansi", "pimpinan_toko", "TEXT NOT NULL DEFAULT ''"),
        ("kwitansi", "kena_pph21", "INTEGER NOT NULL DEFAULT 0"),
        ("kwitansi", "kena_pph21_5", "INTEGER NOT NULL DEFAULT 0"),
        ("kwitansi", "kena_pph23", "INTEGER NOT NULL DEFAULT 0"),
        ("kwitansi", "kena_pph23_2", "INTEGER NOT NULL DEFAULT 0"),
        ("kwitansi", "ppn_nominal", "REAL NOT NULL DEFAULT 0"),
        ("kwitansi", "kode_kegiatan", "TEXT NOT NULL DEFAULT ''"),
        ("pos_settings", "port", "TEXT NOT NULL DEFAULT ''"),
        ("pos_settings", "baud_rate", "INTEGER NOT NULL DEFAULT 9600"),
        ("pos_settings", "header_text", "TEXT NOT NULL DEFAULT ''"),
        ("pos_settings", "footer_text", "TEXT NOT NULL DEFAULT ''"),
        (
            "pos_settings",
            "last_pos_number",
            "INTEGER NOT NULL DEFAULT 0",
        ),
    ];
    for (table, column, typedef) in &column_migrations {
        match add_column_if_missing(&conn, table, column, typedef) {
            Ok(true) => eprintln!("Migrasi: kolom {}.{} berhasil ditambahkan", table, column),
            Ok(false) => {}
            Err(e) => eprintln!("Migrasi gagal {}.{} : {}", table, column, e),
        }
    }

    // Index yang bergantung kolom hasil migrasi — WAJIB setelah migrasi.
    // (Dulu index ini di dalam batch CREATE di atas sehingga DB lama yang belum
    // punya kolom `bulan` membuat seluruh init_db abort sebelum migrasi jalan
    // → import gagal "has no column named bulan".)
    conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_kwitansi_bulan_tahun ON kwitansi(bulan, tahun_anggaran);",
    )?;

    // Setting aplikasi (key-value): folder backup pilihan user, dll.
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL DEFAULT ''
        );",
    )?;

    // Master produk untuk POS kasir (mandiri, tidak terkait kwitansi/BKU).
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS produk (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nama TEXT NOT NULL DEFAULT '',
            harga REAL NOT NULL DEFAULT 0,
            kategori TEXT NOT NULL DEFAULT '',
            satuan TEXT NOT NULL DEFAULT 'pcs',
            created_at TEXT DEFAULT (datetime('now','localtime'))
        );",
    )?;
    conn.execute_batch("CREATE INDEX IF NOT EXISTS idx_produk_nama ON produk(nama);")?;

    // Riwayat penjualan POS kasir (nota toko, terpisah dari kwitansi/BKU).
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS penjualan (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            no_nota TEXT NOT NULL DEFAULT '',
            tanggal TEXT NOT NULL DEFAULT '',
            total REAL NOT NULL DEFAULT 0,
            diskon REAL NOT NULL DEFAULT 0,
            tunai REAL NOT NULL DEFAULT 0,
            kembalian REAL NOT NULL DEFAULT 0,
            penerima TEXT NOT NULL DEFAULT '',
            nama_toko TEXT NOT NULL DEFAULT '',
            alamat_toko TEXT NOT NULL DEFAULT '',
            pimpinan_toko TEXT NOT NULL DEFAULT '',
            created_at TEXT DEFAULT (datetime('now','localtime'))
        );",
    )?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS penjualan_item (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            penjualan_id INTEGER NOT NULL,
            produk_id INTEGER NOT NULL,
            nama TEXT NOT NULL DEFAULT '',
            harga REAL NOT NULL DEFAULT 0,
            qty INTEGER NOT NULL DEFAULT 1,
            subtotal REAL NOT NULL DEFAULT 0,
            FOREIGN KEY (penjualan_id) REFERENCES penjualan(id) ON DELETE CASCADE
        );",
    )?;
    conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_penjualan_item_pid ON penjualan_item(penjualan_id);",
    )?;

    // Insert default sekolah if empty
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM sekolah", [], |row| row.get(0))?;
    if count == 0 {
        conn.execute(
            "INSERT INTO sekolah (nama_sekolah, alamat, kota, kepala_sekolah, nip_kepala, bendahara, nip_bendahara)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                "Nama Sekolah",
                "Alamat Sekolah",
                "Kota",
                "Nama Kepala Sekolah",
                "NIP Kepala Sekolah",
                "Nama Bendahara",
                "NIP Bendahara"
            ],
        )?;
    }

    Ok(())
}

// ============ SEKOLAH ============

pub fn get_sekolah() -> Result<Sekolah> {
    let conn = get_connection()?;
    conn.query_row(
        "SELECT id, nama_sekolah, alamat, kota, kepala_sekolah, nip_kepala, bendahara, nip_bendahara FROM sekolah LIMIT 1",
        [],
        |row| {
            Ok(Sekolah {
                id: row.get(0)?,
                nama_sekolah: row.get(1)?,
                alamat: row.get(2)?,
                kota: row.get(3)?,
                kepala_sekolah: row.get(4)?,
                nip_kepala: row.get(5)?,
                bendahara: row.get(6)?,
                nip_bendahara: row.get(7)?,
            })
        },
    )
}

pub fn update_sekolah(sekolah: &Sekolah) -> Result<()> {
    let conn = get_connection()?;
    conn.execute(
        "UPDATE sekolah SET nama_sekolah=?1, alamat=?2, kota=?3, kepala_sekolah=?4, nip_kepala=?5, bendahara=?6, nip_bendahara=?7 WHERE id=?8",
        params![
            sekolah.nama_sekolah,
            sekolah.alamat,
            sekolah.kota,
            sekolah.kepala_sekolah,
            sekolah.nip_kepala,
            sekolah.bendahara,
            sekolah.nip_bendahara,
            sekolah.id,
        ],
    )?;
    Ok(())
}

// ============ KWITANSI ============

const KWITANSI_COLUMNS: &str = "id, nomor_kwitansi, tanggal, sudah_terima_dari, jumlah, terbilang, untuk_pembayaran, kode_rekening, tahun_anggaran, bulan, mengetahui, nip_mengetahui, bendahara, nip_bendahara, penerima, nama_toko, alamat_toko, pimpinan_toko, created_at, kena_pph21, kena_pph21_5, kena_pph23, kena_pph23_2, ppn_nominal, kode_kegiatan";

fn row_to_kwitansi(row: &rusqlite::Row) -> rusqlite::Result<Kwitansi> {
    Ok(Kwitansi {
        id: row.get(0)?,
        nomor_kwitansi: row.get(1)?,
        tanggal: row.get(2)?,
        sudah_terima_dari: row.get(3)?,
        jumlah: row.get(4)?,
        terbilang: row.get(5)?,
        untuk_pembayaran: row.get(6)?,
        kode_rekening: row.get(7)?,
        tahun_anggaran: row.get(8)?,
        bulan: row.get(9)?,
        mengetahui: row.get(10)?,
        nip_mengetahui: row.get(11)?,
        bendahara: row.get(12)?,
        nip_bendahara: row.get(13)?,
        penerima: row.get(14)?,
        nama_toko: row.get(15)?,
        alamat_toko: row.get(16)?,
        pimpinan_toko: row.get(17)?,
        created_at: row.get(18)?,
        kena_pph21: row.get::<_, i32>(19)? != 0,
        kena_pph21_5: row.get::<_, i32>(20)? != 0,
        kena_pph23: row.get::<_, i32>(21)? != 0,
        kena_pph23_2: row.get::<_, i32>(22)? != 0,
        ppn_nominal: row.get(23)?,
        kode_kegiatan: row.get(24)?,
    })
}

pub fn insert_kwitansi(k: &Kwitansi) -> Result<i64> {
    let conn = get_connection()?;
    conn.execute(
        "INSERT INTO kwitansi (nomor_kwitansi, tanggal, sudah_terima_dari, jumlah, terbilang, untuk_pembayaran, kode_rekening, tahun_anggaran, bulan, mengetahui, nip_mengetahui, bendahara, nip_bendahara, penerima, nama_toko, alamat_toko, pimpinan_toko, kena_pph21, kena_pph21_5, kena_pph23, kena_pph23_2, ppn_nominal, kode_kegiatan)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23)",
        params![
            k.nomor_kwitansi,
            k.tanggal,
            k.sudah_terima_dari,
            k.jumlah,
            k.terbilang,
            k.untuk_pembayaran,
            k.kode_rekening,
            k.tahun_anggaran,
            k.bulan,
            k.mengetahui,
            k.nip_mengetahui,
            k.bendahara,
            k.nip_bendahara,
            k.penerima,
            k.nama_toko,
            k.alamat_toko,
            k.pimpinan_toko,
            k.kena_pph21 as i32,
            k.kena_pph21_5 as i32,
            k.kena_pph23 as i32,
            k.kena_pph23_2 as i32,
            k.ppn_nominal,
            k.kode_kegiatan,
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn get_all_kwitansi() -> Result<Vec<Kwitansi>> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM kwitansi ORDER BY id DESC",
        KWITANSI_COLUMNS
    ))?;
    let rows = stmt.query_map([], row_to_kwitansi)?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row?);
    }
    Ok(result)
}

pub fn get_kwitansi_by_id(id: i64) -> Result<Kwitansi> {
    let conn = get_connection()?;
    conn.query_row(
        &format!("SELECT {} FROM kwitansi WHERE id=?1", KWITANSI_COLUMNS),
        params![id],
        row_to_kwitansi,
    )
}

pub fn delete_kwitansi(id: i64) -> Result<()> {
    let conn = get_connection()?;
    conn.execute("DELETE FROM kwitansi WHERE id=?1", params![id])?;
    Ok(())
}

// ============ PRODUK (master POS kasir, mandiri) ============

fn row_to_produk(row: &rusqlite::Row) -> Result<crate::models::Produk> {
    Ok(crate::models::Produk {
        id: row.get(0)?,
        nama: row.get(1)?,
        harga: row.get(2)?,
        kategori: row.get(3)?,
        satuan: row.get(4)?,
        created_at: row.get(5)?,
    })
}

pub fn get_all_produk() -> Result<Vec<crate::models::Produk>> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, nama, harga, kategori, satuan, created_at FROM produk ORDER BY nama ASC",
    )?;
    let rows = stmt.query_map([], row_to_produk)?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

pub fn insert_produk(p: &crate::models::Produk) -> Result<i64> {
    let conn = get_connection()?;
    conn.execute(
        "INSERT INTO produk (nama, harga, kategori, satuan) VALUES (?1, ?2, ?3, ?4)",
        params![p.nama, p.harga, p.kategori, p.satuan],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn update_produk(id: i64, p: &crate::models::Produk) -> Result<()> {
    let conn = get_connection()?;
    conn.execute(
        "UPDATE produk SET nama=?1, harga=?2, kategori=?3, satuan=?4 WHERE id=?5",
        params![p.nama, p.harga, p.kategori, p.satuan, id],
    )?;
    Ok(())
}

pub fn delete_produk(id: i64) -> Result<()> {
    let conn = get_connection()?;
    conn.execute("DELETE FROM produk WHERE id=?1", params![id])?;
    Ok(())
}

// ============ PENJUALAN POS KASIR ============

fn row_to_penjualan(row: &rusqlite::Row) -> Result<crate::models::Penjualan> {
    Ok(crate::models::Penjualan {
        id: row.get(0)?,
        no_nota: row.get(1)?,
        tanggal: row.get(2)?,
        total: row.get(3)?,
        diskon: row.get(4)?,
        tunai: row.get(5)?,
        kembalian: row.get(6)?,
        penerima: row.get(7)?,
        nama_toko: row.get(8)?,
        alamat_toko: row.get(9)?,
        pimpinan_toko: row.get(10)?,
        created_at: row.get(11)?,
        items: Vec::new(),
    })
}

pub fn insert_penjualan(p: &crate::models::Penjualan) -> Result<i64> {
    let conn = get_connection()?;
    conn.execute(
        "INSERT INTO penjualan (no_nota, tanggal, total, diskon, tunai, kembalian, penerima, nama_toko, alamat_toko, pimpinan_toko)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
        params![
            p.no_nota, p.tanggal, p.total, p.diskon, p.tunai, p.kembalian,
            p.penerima, p.nama_toko, p.alamat_toko, p.pimpinan_toko,
        ],
    )?;
    let pid = conn.last_insert_rowid();
    for it in &p.items {
        let subtotal = (it.harga * it.qty as f64).round();
        conn.execute(
            "INSERT INTO penjualan_item (penjualan_id, produk_id, nama, harga, qty, subtotal)
             VALUES (?1,?2,?3,?4,?5,?6)",
            params![pid, it.produk_id, it.nama, it.harga, it.qty, subtotal],
        )?;
    }
    Ok(pid)
}

pub fn get_all_penjualan() -> Result<Vec<crate::models::Penjualan>> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, no_nota, tanggal, total, diskon, tunai, kembalian, penerima, nama_toko, alamat_toko, pimpinan_toko, created_at
         FROM penjualan ORDER BY id DESC LIMIT 200",
    )?;
    let mut out = Vec::new();
    let rows = stmt.query_map([], row_to_penjualan)?;
    for row in rows {
        let mut p = row?;
        if let Some(pid) = p.id {
            let mut istmt = conn.prepare(
                "SELECT id, penjualan_id, produk_id, nama, harga, qty, subtotal
                 FROM penjualan_item WHERE penjualan_id=?1 ORDER BY id ASC",
            )?;
            let irows = istmt.query_map(params![pid], |r| {
                Ok(crate::models::PenjualanItem {
                    id: r.get(0)?,
                    penjualan_id: r.get(1)?,
                    produk_id: r.get(2)?,
                    nama: r.get(3)?,
                    harga: r.get(4)?,
                    qty: r.get(5)?,
                    subtotal: r.get(6)?,
                })
            })?;
            for ir in irows {
                p.items.push(ir?);
            }
        }
        out.push(p);
    }
    Ok(out)
}

pub fn get_penjualan_by_id(id: i64) -> Result<crate::models::Penjualan> {
    let all = get_all_penjualan()?;
    all.into_iter()
        .find(|p| p.id == Some(id))
        .ok_or(rusqlite::Error::QueryReturnedNoRows)
}

pub fn delete_penjualan(id: i64) -> Result<()> {
    let conn = get_connection()?;
    conn.execute(
        "DELETE FROM penjualan_item WHERE penjualan_id=?1",
        params![id],
    )?;
    conn.execute("DELETE FROM penjualan WHERE id=?1", params![id])?;
    Ok(())
}

/// Cek apakah kwitansi sudah ada (anti-duplikat import ulang).
/// Kunci: nomor + bulan + tahun anggaran.
pub fn kwitansi_exists(nomor: &str, bulan: &str, tahun: &str) -> Result<bool> {
    let conn = get_connection()?;
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM kwitansi WHERE nomor_kwitansi=?1 AND bulan=?2 AND tahun_anggaran=?3",
        params![nomor, bulan, tahun],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

pub fn update_kwitansi(id: i64, k: &Kwitansi) -> Result<()> {
    let conn = get_connection()?;
    conn.execute(
        "UPDATE kwitansi SET nomor_kwitansi=?1, tanggal=?2, sudah_terima_dari=?3, jumlah=?4, terbilang=?5, untuk_pembayaran=?6, kode_rekening=?7, tahun_anggaran=?8, bulan=?9, mengetahui=?10, nip_mengetahui=?11, bendahara=?12, nip_bendahara=?13, penerima=?14, nama_toko=?15, alamat_toko=?16, pimpinan_toko=?17, kena_pph21=?18, kena_pph21_5=?19, kena_pph23=?20, kena_pph23_2=?21, ppn_nominal=?22, kode_kegiatan=?23 WHERE id=?24",
        params![
            k.nomor_kwitansi,
            k.tanggal,
            k.sudah_terima_dari,
            k.jumlah,
            k.terbilang,
            k.untuk_pembayaran,
            k.kode_rekening,
            k.tahun_anggaran,
            k.bulan,
            k.mengetahui,
            k.nip_mengetahui,
            k.bendahara,
            k.nip_bendahara,
            k.penerima,
            k.nama_toko,
            k.alamat_toko,
            k.pimpinan_toko,
            k.kena_pph21 as i32,
            k.kena_pph21_5 as i32,
            k.kena_pph23 as i32,
            k.kena_pph23_2 as i32,
            k.ppn_nominal,
            k.kode_kegiatan,
            id,
        ],
    )?;
    Ok(())
}

/// Backup DB ke %APPDATA%/AutoKwitansi/backup/ tiap start (pertahankan 5 terbaru).
/// Pengaman bila riwayat "hilang" — file backup bisa dicopy manual kembali.
pub fn backup_db() {
    if backup_db_to(&default_backup_dir()).is_none() {
        return;
    }
    // Prune: sisakan 5 file terbaru.
    prune_backups(&default_backup_dir(), 5);
}

/// Folder backup: pilihan user (app_settings.backup_dir) atau fallback bawaan.
pub fn default_backup_dir() -> PathBuf {
    if let Ok(Some(custom)) = get_app_setting("backup_dir") {
        let p = PathBuf::from(custom.trim());
        if !p.as_os_str().is_empty() {
            return p;
        }
    }
    get_db_path()
        .parent()
        .map(|p| p.join("backup"))
        .unwrap_or_else(|| PathBuf::from("backup"))
}

pub fn get_app_setting(key: &str) -> Result<Option<String>> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare("SELECT value FROM app_settings WHERE key=?1")?;
    let mut rows = stmt.query_map(params![key], |row| row.get::<_, String>(0))?;
    if let Some(row) = rows.next() {
        return Ok(Some(row?));
    }
    Ok(None)
}

pub fn set_app_setting(key: &str, value: &str) -> Result<()> {
    let conn = get_connection()?;
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        params![key, value],
    )?;
    Ok(())
}

/// Salin DB (setelah WAL checkpoint) ke folder tujuan. Kembalikan path file.
pub fn backup_db_to(dir: &PathBuf) -> Option<PathBuf> {
    let path = get_db_path();
    if path.exists() == false {
        return None;
    }
    // Checkpoint WAL dulu agar semua transaksi masuk ke file utama.
    if let Ok(conn) = get_connection() {
        let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
    }
    if std::fs::create_dir_all(dir).is_err() {
        return None;
    }
    let ts = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let dest = dir.join(format!("auto_kwitansi-{}.db", ts));
    std::fs::copy(&path, &dest).ok()?;
    Some(dest)
}

fn prune_backups(dir: &PathBuf, keep: usize) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        let mut files: Vec<_> = entries
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.extension().map(|x| x == "db").unwrap_or(false))
            .collect();
        files.sort();
        while files.len() > keep {
            if let Some(old) = files.first() {
                let _ = std::fs::remove_file(old);
            }
            files.remove(0);
        }
    }
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct BackupInfo {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub modified: String,
}

pub fn list_backups() -> Result<Vec<BackupInfo>> {
    let dir = default_backup_dir();
    let mut out = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for e in entries.filter_map(|e| e.ok()) {
            let p = e.path();
            if p.extension().map(|x| x == "db").unwrap_or(false) {
                if let Ok(meta) = std::fs::metadata(&p) {
                    let modified = meta
                        .modified()
                        .map(|t| {
                            chrono::DateTime::<chrono::Local>::from(t)
                                .format("%d-%m-%Y %H:%M")
                                .to_string()
                        })
                        .unwrap_or_default();
                    out.push(BackupInfo {
                        name: p
                            .file_name()
                            .map(|s| s.to_string_lossy().to_string())
                            .unwrap_or_default(),
                        path: p.to_string_lossy().to_string(),
                        size: meta.len(),
                        modified,
                    });
                }
            }
        }
    }
    out.sort_by(|a, b| b.name.cmp(&a.name));
    Ok(out)
}

/// Pulihkan DB dari file backup: validasi dulu, amankan DB aktif, baru timpa.
pub fn restore_backup(src: &str) -> Result<String, String> {
    let src_path = PathBuf::from(src);
    let bytes = std::fs::read(&src_path).map_err(|e| format!("baca file: {}", e))?;
    if bytes.len() < 100 || &bytes[0..16] != b"SQLite format 3\x00" {
        return Err("File bukan database SQLite".into());
    }
    // Validasi isi: tabel kwitansi harus ada.
    {
        let conn = Connection::open(&src_path).map_err(|e| format!("buka db: {}", e))?;
        let n: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='kwitansi'",
                [],
                |row| row.get(0),
            )
            .map_err(|_| "Tabel kwitansi tidak ditemukan".to_string())?;
        if n == 0 {
            return Err("Tabel kwitansi tidak ditemukan".into());
        }
    }
    // Amankan DB aktif sebagai cadangan darurat.
    let _ = backup_db_to(&default_backup_dir()).map(|p| {
        let _ = std::fs::rename(
            &p,
            p.with_file_name(format!(
                "pra-pulihkan-{}.db",
                chrono::Local::now().format("%Y%m%d-%H%M%S")
            )),
        );
    });
    // Checkpoint + timpa.
    if let Ok(conn) = get_connection() {
        let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
    }
    let dest = get_db_path();
    std::fs::copy(&src_path, &dest).map_err(|e| format!("tulis db: {}", e))?;
    // Bersihkan -wal/-shm basi agar SQLite baca file baru yang utuh.
    let _ = std::fs::remove_file(dest.with_extension("db-wal"));
    let _ = std::fs::remove_file(dest.with_extension("db-shm"));
    init_db().map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().to_string())
}

pub fn search_kwitansi(query: &str) -> Result<Vec<Kwitansi>> {
    let conn = get_connection()?;
    let pattern = format!("%{}%", query.replace('%', "\\%").replace('_', "\\_"));
    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM kwitansi
         WHERE nomor_kwitansi LIKE ?1 OR sudah_terima_dari LIKE ?1 OR untuk_pembayaran LIKE ?1 OR penerima LIKE ?1 OR bulan LIKE ?1
         ORDER BY id DESC",
        KWITANSI_COLUMNS
    ))?;
    let rows = stmt.query_map(params![pattern], row_to_kwitansi)?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row?);
    }
    Ok(result)
}

// ============ PRINT SETTINGS ============

pub fn get_print_settings() -> Result<PrintSettings> {
    let conn = get_connection()?;
    let result = conn.query_row(
        "SELECT id, mode, paper_width, paper_height, margin_top, margin_bottom, margin_left, margin_right, font_size, sig_gap, field_positions
         FROM print_settings LIMIT 1",
        [],
        |row| {
            Ok(PrintSettings {
                id: row.get(0)?,
                mode: row.get(1)?,
                paper_width: row.get(2)?,
                paper_height: row.get(3)?,
                margin_top: row.get(4)?,
                margin_bottom: row.get(5)?,
                margin_left: row.get(6)?,
                margin_right: row.get(7)?,
                font_size: row.get(8)?,
                sig_gap: row.get(9)?,
                field_positions: row.get(10)?,
            })
        },
    );

    match result {
        Ok(s) => Ok(s),
        Err(_) => {
            let mut default = PrintSettings {
                id: None,
                mode: "values_only".to_string(),
                paper_width: 176.0,
                paper_height: 190.0,
                margin_top: 10.0,
                margin_bottom: 10.0,
                margin_left: 10.0,
                margin_right: 10.0,
                font_size: 9.0,
                sig_gap: 15.0,
                field_positions: "{}".to_string(),
            };
            let conn2 = get_connection()?;
            conn2.execute(
                "INSERT INTO print_settings (mode, paper_width, paper_height, margin_top, margin_bottom, margin_left, margin_right, font_size, sig_gap, field_positions)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
                params![
                    default.mode,
                    default.paper_width,
                    default.paper_height,
                    default.margin_top,
                    default.margin_bottom,
                    default.margin_left,
                    default.margin_right,
                    default.font_size,
                    default.sig_gap,
                    default.field_positions,
                ],
            )?;
            let id = conn2.last_insert_rowid();
            default.id = Some(id);
            Ok(default)
        }
    }
}

pub fn save_print_settings(s: &PrintSettings) -> Result<()> {
    let conn = get_connection()?;
    if let Some(id) = s.id {
        conn.execute(
            "UPDATE print_settings SET mode=?1, paper_width=?2, paper_height=?3, margin_top=?4, margin_bottom=?5, margin_left=?6, margin_right=?7, font_size=?8, sig_gap=?9, field_positions=?10 WHERE id=?11",
            params![
                s.mode,
                s.paper_width,
                s.paper_height,
                s.margin_top,
                s.margin_bottom,
                s.margin_left,
                s.margin_right,
                s.font_size,
                s.sig_gap,
                s.field_positions,
                id,
            ],
        )?;
    } else {
        conn.execute("DELETE FROM print_settings", [])?;
        conn.execute(
            "INSERT INTO print_settings (mode, paper_width, paper_height, margin_top, margin_bottom, margin_left, margin_right, font_size, sig_gap, field_positions)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
            params![
                s.mode,
                s.paper_width,
                s.paper_height,
                s.margin_top,
                s.margin_bottom,
                s.margin_left,
                s.margin_right,
                s.font_size,
                s.sig_gap,
                s.field_positions,
            ],
        )?;
    }
    Ok(())
}

// ============ POS SETTINGS ============

pub fn get_pos_settings() -> Result<PosSettings> {
    let conn = get_connection()?;
    let result = conn.query_row(
        "SELECT id, paper_width, port, baud_rate, header_text, footer_text, last_pos_number FROM pos_settings LIMIT 1",
        [],
        |row| {
            Ok(PosSettings {
                id: row.get(0)?,
                paper_width: row.get(1)?,
                port: row.get(2)?,
                baud_rate: row.get(3)?,
                header_text: row.get(4)?,
                footer_text: row.get(5)?,
                last_pos_number: row.get(6)?,
            })
        },
    );

    match result {
        Ok(s) => Ok(s),
        Err(_) => {
            let default = PosSettings {
                id: None,
                paper_width: 58,
                port: String::new(),
                baud_rate: 9600,
                header_text: String::new(),
                footer_text: String::new(),
                last_pos_number: 0,
            };
            let conn2 = get_connection()?;
            conn2.execute(
                "INSERT INTO pos_settings (paper_width, port, baud_rate, header_text, footer_text, last_pos_number) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![default.paper_width, default.port, default.baud_rate, default.header_text, default.footer_text, default.last_pos_number],
            )?;
            let id = conn2.last_insert_rowid();
            Ok(PosSettings {
                id: Some(id),
                ..default
            })
        }
    }
}

pub fn save_pos_settings(s: &PosSettings) -> Result<()> {
    let conn = get_connection()?;
    if let Some(id) = s.id {
        conn.execute(
            "UPDATE pos_settings SET paper_width=?1, port=?2, baud_rate=?3, header_text=?4, footer_text=?5, last_pos_number=?6 WHERE id=?7",
            params![s.paper_width, s.port, s.baud_rate, s.header_text, s.footer_text, s.last_pos_number, id],
        )?;
    } else {
        conn.execute("DELETE FROM pos_settings", [])?;
        conn.execute(
            "INSERT INTO pos_settings (paper_width, port, baud_rate, header_text, footer_text, last_pos_number) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![s.paper_width, s.port, s.baud_rate, s.header_text, s.footer_text, s.last_pos_number],
        )?;
    }
    Ok(())
}

/// Generate a random POS nota number (format: YYYYMMDD-RRRR)
pub fn generate_pos_number() -> Result<String> {
    let random_part: u32 = rand::random::<u32>() % 9000 + 1000;
    let today = chrono::Local::now().format("%Y%m%d").to_string();
    Ok(format!("{}-{:04}", today, random_part))
}

// ============ BPU DOKUMEN ============

pub fn get_bpu_dokumen(kwitansi_id: i64) -> Result<BpuDokumen> {
    let conn = get_connection()?;
    let result = conn.query_row(
        "SELECT id, kwitansi_id, dok_bast, dok_surat_pesanan, dok_invoice, dok_bap, updated_at
         FROM bpu_dokumen WHERE kwitansi_id=?1",
        params![kwitansi_id],
        |row| {
            Ok(BpuDokumen {
                id: row.get(0)?,
                kwitansi_id: row.get(1)?,
                dok_bast: row.get::<_, i32>(2)? != 0,
                dok_surat_pesanan: row.get::<_, i32>(3)? != 0,
                dok_invoice: row.get::<_, i32>(4)? != 0,
                dok_bap: row.get::<_, i32>(5)? != 0,
                updated_at: row.get(6)?,
            })
        },
    );

    match result {
        Ok(d) => Ok(d),
        Err(_) => Ok(BpuDokumen {
            id: None,
            kwitansi_id,
            dok_bast: false,
            dok_surat_pesanan: false,
            dok_invoice: false,
            dok_bap: false,
            updated_at: None,
        }),
    }
}

pub fn upsert_bpu_dokumen(
    kwitansi_id: i64,
    dok_bast: bool,
    dok_surat_pesanan: bool,
    dok_invoice: bool,
    dok_bap: bool,
) -> Result<()> {
    let conn = get_connection()?;
    let existing: Option<i64> = conn
        .query_row(
            "SELECT id FROM bpu_dokumen WHERE kwitansi_id=?1",
            params![kwitansi_id],
            |row| row.get(0),
        )
        .ok();

    if let Some(id) = existing {
        conn.execute(
            "UPDATE bpu_dokumen SET dok_bast=?1, dok_surat_pesanan=?2, dok_invoice=?3, dok_bap=?4, updated_at=datetime('now','localtime') WHERE id=?5",
            params![
                dok_bast as i32,
                dok_surat_pesanan as i32,
                dok_invoice as i32,
                dok_bap as i32,
                id,
            ],
        )?;
    } else {
        conn.execute(
            "INSERT INTO bpu_dokumen (kwitansi_id, dok_bast, dok_surat_pesanan, dok_invoice, dok_bap)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                kwitansi_id,
                dok_bast as i32,
                dok_surat_pesanan as i32,
                dok_invoice as i32,
                dok_bap as i32,
            ],
        )?;
    }
    Ok(())
}

// ============ TOKO DATA ============

pub fn update_kwitansi_toko(
    kwitansi_id: i64,
    nama_toko: &str,
    alamat_toko: &str,
    pimpinan_toko: &str,
) -> Result<()> {
    let conn = get_connection()?;
    conn.execute(
        "UPDATE kwitansi SET nama_toko=?1, alamat_toko=?2, pimpinan_toko=?3 WHERE id=?4",
        params![nama_toko, alamat_toko, pimpinan_toko, kwitansi_id],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_init_db_migrates_old_db_without_bulan() {
        // Simulasi DB lama (pra-bulan): init_db tidak boleh abort,
        // migrasi harus menambahkan kolom, insert import harus sukses.
        // APPDATA diisolasi ke temp dir agar tidak menyentuh DB asli.
        let tmp = std::env::temp_dir().join(format!("autokwitansi-test-{}", std::process::id()));
        let appdata = tmp.join("appdata");
        std::fs::create_dir_all(&appdata).ok();
        let old_appdata = std::env::var_os("APPDATA");
        std::env::set_var("APPDATA", &appdata);

        let result = (|| -> Result<()> {
            // DB lama: tabel kwitansi TANPA bulan dan kolom-kolom baru
            {
                let dir = appdata.join("AutoKwitansi");
                std::fs::create_dir_all(&dir).ok();
                let conn = Connection::open(dir.join("auto_kwitansi.db"))?;
                conn.execute_batch(
                    "CREATE TABLE kwitansi (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        nomor_kwitansi TEXT NOT NULL,
                        tanggal TEXT NOT NULL,
                        sudah_terima_dari TEXT NOT NULL,
                        jumlah REAL NOT NULL DEFAULT 0,
                        terbilang TEXT NOT NULL DEFAULT '',
                        untuk_pembayaran TEXT NOT NULL DEFAULT '',
                        kode_rekening TEXT NOT NULL DEFAULT '',
                        tahun_anggaran TEXT NOT NULL DEFAULT ''
                    );",
                )?;
            }

            init_db()?;

            let conn = get_connection()?;
            assert!(column_exists(&conn, "kwitansi", "bulan")?);
            assert!(column_exists(&conn, "kwitansi", "kena_pph23")?);
            assert!(column_exists(&conn, "kwitansi", "kode_kegiatan")?);

            // Insert ala import (pakai kolom bulan) — dulu gagal
            // "table kwitansi has no column named bulan"
            conn.execute(
                "INSERT INTO kwitansi (nomor_kwitansi, tanggal, sudah_terima_dari, jumlah, terbilang, untuk_pembayaran, kode_rekening, tahun_anggaran, bulan) VALUES ('BPU99','2026-01-01','Bendahara',1000,'seribu','Uji','5.1','2026','JANUARI')",
                [],
            )?;
            Ok(())
        })();

        match old_appdata {
            Some(v) => std::env::set_var("APPDATA", v),
            None => std::env::remove_var("APPDATA"),
        }
        std::fs::remove_dir_all(&tmp).ok();

        result.expect("init_db harus sukses di DB lama + insert import harus bisa");
    }
}
