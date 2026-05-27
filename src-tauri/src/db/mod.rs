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
        let db = AppDb { conn: Mutex::new(conn) };
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
            let ptr = rusqlite::ffi::sqlite3_serialize(
                conn.handle(),
                c"main".as_ptr(),
                &mut size,
                0,
            );
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
        Ok(())
    }
}

pub fn db_path() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join("LagosFile").join("lagosfile.db.enc")
}

pub fn salt_path() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join("LagosFile").join(".salt")
}

pub fn ensure_dirs() -> Result<()> {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    std::fs::create_dir_all(home.join("LagosFile"))?;
    std::fs::create_dir_all(home.join("LagosFile").join("documents"))?;
    Ok(())
}
