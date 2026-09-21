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
            kena_pph21 INTEGER NOT NULL DEFAULT 0
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
        CREATE INDEX IF NOT EXISTS idx_kwitansi_bulan_tahun ON kwitansi(bulan, tahun_anggaran);
        ",
    )?;

    // Migration: add new columns if missing (for existing DBs)
    let column_migrations: [(&str, &str, &str); 11] = [
        ("print_settings", "sig_gap", "REAL NOT NULL DEFAULT 15.0"),
        ("kwitansi", "bulan", "TEXT NOT NULL DEFAULT ''"),
        ("kwitansi", "nama_toko", "TEXT NOT NULL DEFAULT ''"),
        ("kwitansi", "alamat_toko", "TEXT NOT NULL DEFAULT ''"),
        ("kwitansi", "pimpinan_toko", "TEXT NOT NULL DEFAULT ''"),
        ("kwitansi", "kena_pph21", "INTEGER NOT NULL DEFAULT 0"),
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

const KWITANSI_COLUMNS: &str = "id, nomor_kwitansi, tanggal, sudah_terima_dari, jumlah, terbilang, untuk_pembayaran, kode_rekening, tahun_anggaran, bulan, mengetahui, nip_mengetahui, bendahara, nip_bendahara, penerima, nama_toko, alamat_toko, pimpinan_toko, created_at, kena_pph21";

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
    })
}

pub fn insert_kwitansi(k: &Kwitansi) -> Result<i64> {
    let conn = get_connection()?;
    conn.execute(
        "INSERT INTO kwitansi (nomor_kwitansi, tanggal, sudah_terima_dari, jumlah, terbilang, untuk_pembayaran, kode_rekening, tahun_anggaran, bulan, mengetahui, nip_mengetahui, bendahara, nip_bendahara, penerima, nama_toko, alamat_toko, pimpinan_toko, kena_pph21)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)",
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
