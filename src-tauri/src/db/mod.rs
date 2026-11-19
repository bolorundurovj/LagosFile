pub mod doc_store;
pub mod vault;

use anyhow::Result;
use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;

/// Wraps a rusqlite Connection behind a Mutex.
/// rusqlite::Connection is !Send, but we access it exclusively through
/// a Mutex — so the overall AppDb is safe to move between threads.
pub struct AppDb {
    pub conn: Mutex<Connection>,
}

// SAFETY: Access to Connection is always serialised through the Mutex.
unsafe impl Send for AppDb {}
unsafe impl Sync for AppDb {}

impl AppDb {
    pub fn open_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        let db = AppDb {
            conn: Mutex::new(conn),
        };
        db.create_schema()?;
        Ok(db)
    }

    /// Restore a serialised SQLite database from raw bytes using the
    /// sqlite3_deserialize C API (only available when built with the
    /// "serialize" feature — enabled by the "bundled" feature in rusqlite).
    pub fn load_from_bytes(&self, bytes: &[u8]) -> Result<()> {
        // We must copy the bytes into a heap buffer that SQLite can own.
        let len = bytes.len();
        let copy = unsafe {
            let ptr = rusqlite::ffi::sqlite3_malloc64(len as u64) as *mut u8;
            if ptr.is_null() {
                return Err(anyhow::anyhow!("sqlite3_malloc64 returned null"));
            }
            std::ptr::copy_nonoverlapping(bytes.as_ptr(), ptr, len);
            ptr
        };

        let conn = self.conn.lock().unwrap();
        unsafe {
            let rc = rusqlite::ffi::sqlite3_deserialize(
                conn.handle(),
                c"main".as_ptr(),
                copy,
                len as i64,
                len as i64,
                rusqlite::ffi::SQLITE_DESERIALIZE_FREEONCLOSE
                    | rusqlite::ffi::SQLITE_DESERIALIZE_RESIZEABLE,
            );
            if rc != rusqlite::ffi::SQLITE_OK {
                return Err(anyhow::anyhow!("sqlite3_deserialize failed: error {}", rc));
            }
        }
        drop(conn);
        self.create_schema()?;
        Ok(())
    }

    pub fn serialize(&self) -> Result<Vec<u8>> {
        let conn = self.conn.lock().unwrap();
        let mut size: i64 = 0;
        unsafe {
            let ptr =
                rusqlite::ffi::sqlite3_serialize(conn.handle(), c"main".as_ptr(), &mut size, 0);
            if ptr.is_null() || size == 0 {
                return Err(anyhow::anyhow!("sqlite3_serialize returned null or empty"));
            }
            let slice = std::slice::from_raw_parts(ptr, size as usize);
            let vec = slice.to_vec();
            rusqlite::ffi::sqlite3_free(ptr as *mut std::ffi::c_void);
            Ok(vec)
        }
    }

    fn create_schema(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(include_str!("schema.sql"))?;
        migrate(&conn)?;
        Ok(())
    }
}

pub const SEED_V1_CONFIG_ID: &str = "a0000000-0000-0000-0000-000000000001";
pub const SEED_V1_CONFIG_LABEL: &str = "Tax Config v1.0 — NTA 2025, effective 1 Jan 2026";
const META_MIGRATION_NOTICES: &str = "migration_notices";

/// Columns added after the first release. `CREATE TABLE IF NOT EXISTS` leaves
/// existing databases untouched, so they are added here when missing.
const ADDED_COLUMNS: &[(&str, &str, &str)] = &[
    ("relief_entry", "description", "TEXT"),
    ("filing", "payment_date", "TEXT"),
    ("filing", "payment_reference", "TEXT"),
    ("filing", "amount_paid", "REAL"),
    ("filing", "tax_config_id", "TEXT"),
    ("filing", "submitted_at", "TEXT"),
];

pub fn get_migration_notices(conn: &Connection) -> Vec<String> {
    conn.query_row(
        "SELECT value FROM app_meta WHERE key = ?1",
        rusqlite::params![META_MIGRATION_NOTICES],
        |r| r.get::<_, String>(0),
    )
    .ok()
    .and_then(|s| serde_json::from_str::<Vec<String>>(&s).ok())
    .unwrap_or_default()
}

pub fn add_migration_notice(conn: &Connection, notice: &str) -> Result<()> {
    let mut notices = get_migration_notices(conn);
    if !notices.iter().any(|n| n == notice) {
        notices.push(notice.to_string());
        let json = serde_json::to_string(&notices)?;
        conn.execute(
            "INSERT OR REPLACE INTO app_meta (key, value) VALUES (?1, ?2)",
            rusqlite::params![META_MIGRATION_NOTICES, json],
        )?;
    }
    Ok(())
}

pub fn clear_migration_notices(conn: &Connection) -> Result<()> {
    conn.execute(
        "DELETE FROM app_meta WHERE key = ?1",
        rusqlite::params![META_MIGRATION_NOTICES],
    )?;
    Ok(())
}

fn backfill_filing_tax_config_ids(conn: &Connection) -> Result<()> {
    let mut stmt = conn.prepare(
        "SELECT id, year_of_assessment, filing_reference, tax_config_version
         FROM filing WHERE tax_config_id IS NULL",
    )?;
    let missing: Vec<(String, i32, Option<String>, String)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?
        .filter_map(|r| r.ok())
        .collect();
    drop(stmt);

    if missing.is_empty() {
        return Ok(());
    }

    let seed_exists: bool = conn
        .query_row(
            "SELECT COUNT(1) FROM tax_config WHERE id = ?1",
            rusqlite::params![SEED_V1_CONFIG_ID],
            |r| r.get::<_, i32>(0),
        )
        .unwrap_or(0)
        > 0;

    let active_id: Option<String> = conn
        .query_row(
            "SELECT id FROM tax_config WHERE is_active = 1 LIMIT 1",
            [],
            |r| r.get(0),
        )
        .ok();

    let mut ambiguous_years: Vec<String> = Vec::new();

    for (filing_id, yoa, filing_ref, version_label) in missing {
        if version_label == SEED_V1_CONFIG_LABEL && seed_exists {
            conn.execute(
                "UPDATE filing SET tax_config_id = ?1 WHERE id = ?2",
                rusqlite::params![SEED_V1_CONFIG_ID, filing_id],
            )?;
        } else if let Some(ref act_id) = active_id {
            conn.execute(
                "UPDATE filing SET tax_config_id = ?1 WHERE id = ?2",
                rusqlite::params![act_id, filing_id],
            )?;
            let label_matches: i32 = conn
                .query_row(
                    "SELECT COUNT(1) FROM tax_config WHERE version_label = ?1",
                    rusqlite::params![version_label],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            if label_matches != 1 {
                let desc = match filing_ref {
                    Some(ref r) => format!("{yoa} ({r})"),
                    None => format!("{yoa} (Draft)"),
                };
                ambiguous_years.push(desc);
            }
        }
    }

    if !ambiguous_years.is_empty() {
        let notice = format!(
            "Some older filings ({}) did not uniquely identify a saved tax configuration and were linked to your active configuration. Review them and amend if needed.",
            ambiguous_years.join(", ")
        );
        add_migration_notice(conn, &notice)?;
    }

    Ok(())
}

fn seed_filing_ref_counter(conn: &Connection) -> Result<()> {
    let mut stmt = conn.prepare(
        "SELECT year_of_assessment, filing_reference FROM filing
         WHERE filing_reference IS NOT NULL AND filing_reference != ''",
    )?;
    let mut max_by_year: std::collections::HashMap<i32, i64> = std::collections::HashMap::new();
    let rows = stmt.query_map([], |r| Ok((r.get::<_, i32>(0)?, r.get::<_, String>(1)?)))?;
    for row in rows.flatten() {
        let (yoa, reference) = row;
        let parsed_seq = reference
            .rsplit('/')
            .next()
            .and_then(|s| s.parse::<i64>().ok())
            .unwrap_or(0);
        let entry = max_by_year.entry(yoa).or_insert(0);
        if parsed_seq > *entry {
            *entry = parsed_seq;
        }
    }
    drop(stmt);

    for (yoa, seq) in max_by_year {
        conn.execute(
            "INSERT INTO filing_ref_counter (year_of_assessment, last_seq) VALUES (?1, ?2)
             ON CONFLICT(year_of_assessment) DO UPDATE SET last_seq = MAX(last_seq, excluded.last_seq)",
            rusqlite::params![yoa, seq],
        )?;
    }
    Ok(())
}

fn migrate(conn: &Connection) -> Result<()> {
    for (table, column, ty) in ADDED_COLUMNS {
        // pragma_table_info crashes on a freshly deserialized connection, so
        // read the column list from a prepared statement instead.
        let exists = conn
            .prepare(&format!("SELECT * FROM {table} LIMIT 0"))?
            .column_names()
            .contains(column);
        if !exists {
            conn.execute_batch(&format!("ALTER TABLE {table} ADD COLUMN {column} {ty}"))?;
        }
    }
    backfill_filing_tax_config_ids(conn)?;
    seed_filing_ref_counter(conn)?;
    Ok(())
}

pub fn app_dir() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join("LagosFile")
}

pub fn db_path() -> PathBuf {
    app_dir().join("lagosfile.db.enc")
}

pub fn salt_path() -> PathBuf {
    app_dir().join(".salt")
}

pub fn ensure_dirs() -> Result<()> {
    let dir = app_dir();
    std::fs::create_dir_all(&dir)?;
    std::fs::create_dir_all(dir.join("documents"))?;
    Ok(())
}
