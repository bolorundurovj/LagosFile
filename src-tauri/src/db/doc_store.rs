use crate::{
    commands::auth::persist_db_in_dir,
    db::AppDb,
    services::security,
    AppState,
};
use rand::rngs::OsRng;
use rand::RngCore;
use rusqlite::params;
use std::io::Write;
use std::path::{Component, Path, PathBuf};

pub const DOC_MAGIC: &[u8; 4] = b"LGFD";
pub const DOC_VERSION: u8 = 1;
pub const DOC_HEADER_LEN: usize = 5;

pub const ARCHIVE_MAGIC: &[u8; 4] = b"LGFA";
pub const ARCHIVE_VERSION: u8 = 1;

const META_DOCUMENT_KEY: &str = "document_key";

/// Returns `true` if `raw` starts with the LagosFile encrypted document header (`LGFD\x01`).
pub fn is_encrypted_doc(raw: &[u8]) -> bool {
    raw.len() >= DOC_HEADER_LEN + 12 && &raw[..4] == DOC_MAGIC && raw[4] == DOC_VERSION
}

/// Returns the 32-byte document encryption key stored inside the encrypted database,
/// or `None` if one has not yet been generated.
pub fn get_doc_key(db: &AppDb) -> Result<Option<[u8; 32]>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let hex_str: Option<String> = conn
        .query_row(
            "SELECT value FROM app_meta WHERE key = ?1",
            params![META_DOCUMENT_KEY],
            |r| r.get(0),
        )
        .ok();
    match hex_str {
        Some(h) => {
            let bytes = hex::decode(&h).map_err(|_| "Corrupt document key in database".to_string())?;
            if bytes.len() != 32 {
                return Err("Corrupt document key length in database".to_string());
            }
            let mut key = [0u8; 32];
            key.copy_from_slice(&bytes);
            Ok(Some(key))
        }
        None => Ok(None),
    }
}

/// Returns `(doc_key, created_now)`. Generates and stores a random 32-byte key in `app_meta`
/// if one does not yet exist.
pub fn get_or_create_doc_key(db: &AppDb) -> Result<([u8; 32], bool), String> {
    if let Some(existing) = get_doc_key(db)? {
        return Ok((existing, false));
    }
    let mut key = [0u8; 32];
    OsRng.fill_bytes(&mut key);
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO app_meta (key, value) VALUES (?1, ?2)",
        params![META_DOCUMENT_KEY, hex::encode(key)],
    )
    .map_err(|e| e.to_string())?;
    Ok((key, true))
}

/// Encrypts document bytes with `doc_key` using `LGFD | 1 | nonce | ciphertext`.
pub fn encrypt_doc(plaintext: &[u8], key: &[u8; 32]) -> Result<Vec<u8>, String> {
    let payload = security::encrypt(plaintext, key).map_err(|e| e.to_string())?;
    let mut out = Vec::with_capacity(DOC_HEADER_LEN + payload.len());
    out.extend_from_slice(DOC_MAGIC);
    out.push(DOC_VERSION);
    out.extend_from_slice(&payload);
    Ok(out)
}

/// Decrypts document bytes encrypted with `encrypt_doc`.
/// If `raw` does not have the `LGFD` magic (legacy plaintext document prior to migration),
/// returns `raw` as-is. If it starts with `LGFD`, valid version and AEAD decryption are required.
pub fn decrypt_doc(raw: &[u8], key: &[u8; 32]) -> Result<Vec<u8>, String> {
    if raw.len() >= 4 && &raw[..4] == DOC_MAGIC {
        if raw.len() < DOC_HEADER_LEN {
            return Err("Corrupt encrypted document".to_string());
        }
        if raw[4] != DOC_VERSION {
            return Err(format!("Unsupported encrypted document version {}", raw[4]));
        }
        security::decrypt(&raw[DOC_HEADER_LEN..], key)
            .map_err(|_| "Could not decrypt attached document.".to_string())
    } else {
        Ok(raw.to_vec())
    }
}

/// Resolves a `document.file_path` value (either relative `documents/...` or legacy absolute path)
/// against `app_dir`. If an absolute path no longer exists (e.g. restored on another machine),
/// falls back to the `documents/...` suffix inside `app_dir`.
pub fn resolve_doc_path(app_dir: &Path, stored_path: &str) -> PathBuf {
    let p = Path::new(stored_path);
    if !p.is_absolute() {
        return app_dir.join(p);
    }
    if p.exists() {
        return p.to_path_buf();
    }
    if let Some(rel) = extract_documents_rel(stored_path) {
        return app_dir.join(rel);
    }
    p.to_path_buf()
}

/// Extracts a portable forward-slash `documents/...` relative path from either an absolute
/// or relative stored path.
pub fn extract_documents_rel(stored_path: &str) -> Option<String> {
    let normalized = stored_path.replace('\\', "/");
    if normalized.starts_with("documents/") {
        return Some(normalized);
    }
    if let Some(idx) = normalized.find("/documents/") {
        return Some(normalized[idx + 1..].to_string());
    }
    None
}

/// Validates that a relative document path from an archive stays strictly under `documents/`
/// with no traversal (`..`), root prefix, or drive prefix.
pub fn validate_safe_rel_doc_path(rel: &str) -> Result<PathBuf, String> {
    if rel.contains('\\') || !rel.starts_with("documents/") {
        return Err(format!("Invalid archive document path: {}", rel));
    }
    let path = Path::new(rel);
    let mut clean = PathBuf::new();
    for comp in path.components() {
        match comp {
            Component::Normal(seg) => clean.push(seg),
            _ => return Err(format!("Unsafe archive document path: {}", rel)),
        }
    }
    if clean.components().count() < 2 {
        return Err(format!("Incomplete archive document path: {}", rel));
    }
    Ok(clean)
}

/// Atomically writes encrypted document bytes to `dest` via a sibling temp file + rename.
pub fn write_encrypted_doc_atomic(
    dest: &Path,
    plaintext: &[u8],
    key: &[u8; 32],
) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let encrypted = encrypt_doc(plaintext, key)?;
    let tmp = dest.with_extension(format!("migrating.{}.tmp", uuid::Uuid::new_v4()));

    let res = (|| -> std::io::Result<()> {
        let mut f = std::fs::File::create(&tmp)?;
        f.write_all(&encrypted)?;
        f.sync_all()?;
        drop(f);
        std::fs::rename(&tmp, dest)?;
        Ok(())
    })();

    if let Err(e) = res {
        let _ = std::fs::remove_file(&tmp);
        return Err(e.to_string());
    }
    Ok(())
}

/// Reads and decrypts a stored document file using `doc_key`.
pub fn read_decrypted_doc(
    app_dir: &Path,
    stored_path: &str,
    key: &[u8; 32],
) -> Result<Vec<u8>, String> {
    let full = resolve_doc_path(app_dir, stored_path);
    let raw = std::fs::read(&full)
        .map_err(|e| format!("Cannot read document '{}': {}", stored_path, e))?;
    decrypt_doc(&raw, key)
}

#[derive(Debug, Default)]
pub struct MigrationReport {
    pub total_found: usize,
    pub encrypted_count: usize,
    pub skipped_already_encrypted: usize,
}

/// Crash-safe one-time migration that encrypts all existing plaintext documents referenced
/// in the `document` table.
///
/// Protocol:
/// 1. Discover any document files on disk that are not yet `LGFD\x01`-encrypted.
/// 2. Ensure `document_key` exists in `app_meta` and persist the vault to disk BEFORE
///    modifying any document file on disk (so an interruption mid-migration never loses the key).
/// 3. Encrypt each plaintext file in place via temp-file + atomic rename, and normalize
///    `document.file_path` to a portable relative path where applicable.
/// 4. Persist the vault if any `file_path` metadata changed.
pub fn migrate_plaintext_documents_with_hook<P, B>(
    dir: &Path,
    state: &AppState,
    mut on_progress: P,
    mut before_file: B,
) -> Result<MigrationReport, String>
where
    P: FnMut(usize, usize, &str),
    B: FnMut(usize, &str) -> Result<(), String>,
{
    let rows: Vec<(String, String, String)> = {
        let guard = state.db.lock().map_err(|e| e.to_string())?;
        let db = guard.as_ref().ok_or("Database not unlocked")?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT id, file_path, file_name FROM document ORDER BY uploaded_at ASC, id ASC")
            .map_err(|e| e.to_string())?;
        let mapped = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        mapped
    };

    let mut report = MigrationReport::default();
    let mut to_migrate: Vec<(String, String, String, PathBuf)> = Vec::new();

    for (id, stored_path, file_name) in rows {
        let full = resolve_doc_path(dir, &stored_path);
        if !full.is_file() {
            continue;
        }
        let raw = std::fs::read(&full).map_err(|e| e.to_string())?;
        if is_encrypted_doc(&raw) {
            report.skipped_already_encrypted += 1;
        } else {
            to_migrate.push((id, stored_path, file_name, full));
        }
    }

    report.total_found = to_migrate.len();
    if to_migrate.is_empty() {
        if let Ok(guard) = state.db.lock() {
            if let Some(db) = guard.as_ref() {
                if let Ok(conn) = db.conn.lock() {
                    let _ = sweep_orphan_doc_files(dir, &conn);
                }
            }
        }
        return Ok(report);
    }

    // Phase 1: Ensure document_key exists in app_meta and is durably persisted to the vault
    // BEFORE touching any plaintext file on disk.
    let (doc_key, created_key) = {
        let guard = state.db.lock().map_err(|e| e.to_string())?;
        let db = guard.as_ref().ok_or("Database not unlocked")?;
        get_or_create_doc_key(db)?
    };
    if created_key {
        persist_db_in_dir(dir, state)?;
    }

    // Phase 2: Encrypt each plaintext file atomically in place.
    let mut db_paths_updated = false;
    let total = to_migrate.len();
    for (idx, (id, stored_path, file_name, full)) in to_migrate.into_iter().enumerate() {
        before_file(idx, &file_name)?;
        let plaintext = std::fs::read(&full).map_err(|e| e.to_string())?;
        if !is_encrypted_doc(&plaintext) {
            write_encrypted_doc_atomic(&full, &plaintext, &doc_key)?;
            report.encrypted_count += 1;
        }

        // Normalize absolute paths into portable relative paths when under `dir/documents/`.
        if Path::new(&stored_path).is_absolute() {
            if let Some(rel) = extract_documents_rel(&stored_path) {
                let guard = state.db.lock().map_err(|e| e.to_string())?;
                if let Some(db) = guard.as_ref() {
                    let conn = db.conn.lock().map_err(|e| e.to_string())?;
                    let _ = conn.execute(
                        "UPDATE document SET file_path = ?1 WHERE id = ?2",
                        params![rel, id],
                    );
                    db_paths_updated = true;
                }
            }
        }
        on_progress(idx + 1, total, &file_name);
    }

    if db_paths_updated {
        persist_db_in_dir(dir, state)?;
    }

    // Startup sweep: remove any orphaned files in documents/ not referenced by any document row.
    if let Ok(guard) = state.db.lock() {
        if let Some(db) = guard.as_ref() {
            if let Ok(conn) = db.conn.lock() {
                let _ = sweep_orphan_doc_files(dir, &conn);
            }
        }
    }

    Ok(report)
}

/// Removes candidate document files on disk ONLY if no remaining `document` row
/// still references the same `file_path` (or resolves to the same path), and
/// prunes empty entry subdirectories under `<dir>/documents/`.
pub fn remove_unreferenced_doc_files(
    dir: &Path,
    conn: &rusqlite::Connection,
    candidate_paths: &[String],
) {
    let docs_root = dir.join("documents");
    let mut seen = std::collections::HashSet::new();

    for stored in candidate_paths {
        if stored.is_empty() || !seen.insert(stored.clone()) {
            continue;
        }
        let ref_count: i64 = conn
            .query_row(
                "SELECT COUNT(1) FROM document WHERE file_path = ?1",
                params![stored],
                |r| r.get(0),
            )
            .unwrap_or(1);
        if ref_count > 0 {
            continue;
        }
        let target = resolve_doc_path(dir, stored);
        if target.exists() {
            let _ = std::fs::remove_file(&target);
        }
        // Prune empty entry folder directly under <dir>/documents/
        if let Some(parent) = target.parent() {
            if parent != docs_root && parent.starts_with(&docs_root) {
                let _ = std::fs::remove_dir(parent);
            }
        }
    }
}

/// Walks `<dir>/documents` and removes any file not referenced by any row in
/// the `document` table, then prunes empty subdirectories. Returns the number
/// of orphan files removed.
pub fn sweep_orphan_doc_files(dir: &Path, conn: &rusqlite::Connection) -> usize {
    let docs_root = dir.join("documents");
    if !docs_root.exists() {
        return 0;
    }

    let mut referenced = std::collections::HashSet::<PathBuf>::new();
    if let Ok(mut stmt) = conn.prepare("SELECT file_path FROM document") {
        if let Ok(rows) = stmt.query_map([], |r| r.get::<_, String>(0)) {
            for path_str in rows.filter_map(|r| r.ok()) {
                let resolved = resolve_doc_path(dir, &path_str);
                if let Ok(canon) = std::fs::canonicalize(&resolved) {
                    referenced.insert(canon);
                }
                referenced.insert(resolved);
            }
        }
    }

    fn walk_and_clean(
        dir_path: &Path,
        docs_root: &Path,
        referenced: &std::collections::HashSet<PathBuf>,
        removed: &mut usize,
    ) {
        let Ok(entries) = std::fs::read_dir(dir_path) else {
            return;
        };
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.is_dir() {
                walk_and_clean(&path, docs_root, referenced, removed);
                if path != docs_root {
                    let _ = std::fs::remove_dir(&path);
                }
            } else if path.is_file() {
                let canon = std::fs::canonicalize(&path).ok();
                let is_referenced = referenced.contains(&path)
                    || canon.as_ref().is_some_and(|c| referenced.contains(c));
                if !is_referenced && std::fs::remove_file(&path).is_ok() {
                    *removed += 1;
                }
            }
        }
    }

    let mut removed = 0usize;
    walk_and_clean(&docs_root, &docs_root, &referenced, &mut removed);
    removed
}

pub fn migrate_plaintext_documents(dir: &Path, state: &AppState) -> Result<MigrationReport, String> {
    migrate_plaintext_documents_with_hook(dir, state, |_, _, _| {}, |_, _| Ok(()))
}

/// Collects all referenced document files for inclusion in a backup archive.
/// Ensures every bundled document is encrypted with `doc_key` (never writes plaintext into a backup).
pub fn collect_backup_documents(
    dir: &Path,
    db: &AppDb,
) -> Result<Vec<(String, Vec<u8>)>, String> {
    let rows: Vec<(String, String)> = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT parent_entry_id, file_path FROM document")
            .map_err(|e| e.to_string())?;
        let mapped = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        mapped
    };

    if rows.is_empty() {
        return Ok(vec![]);
    }

    let (doc_key, _created) = get_or_create_doc_key(db)?;
    let mut seen = std::collections::HashSet::new();
    let mut docs = Vec::new();

    for (parent_entry_id, stored_path) in rows {
        let full = resolve_doc_path(dir, &stored_path);
        if !full.is_file() {
            continue;
        }
        let rel = extract_documents_rel(&stored_path).unwrap_or_else(|| {
            let fname = full
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("attachment");
            format!("documents/{}/{}", parent_entry_id, fname)
        });
        // Validate path safety before packing
        validate_safe_rel_doc_path(&rel)?;
        if !seen.insert(rel.clone()) {
            continue;
        }
        let raw = std::fs::read(&full).map_err(|e| e.to_string())?;
        let bytes = if is_encrypted_doc(&raw) {
            raw
        } else {
            encrypt_doc(&raw, &doc_key)?
        };
        docs.push((rel, bytes));
    }

    Ok(docs)
}

/// Encodes a backup archive bundling the v1 encrypted vault and encrypted documents:
/// `LGFA | 1 | vault_len(u64 LE) | vault_bytes | doc_count(u32 LE) | [rel_len(u32 LE) | rel_utf8 | data_len(u64 LE) | data_bytes]*`
pub fn encode_backup_archive(vault_bytes: &[u8], docs: &[(String, Vec<u8>)]) -> Vec<u8> {
    let mut out = Vec::new();
    out.extend_from_slice(ARCHIVE_MAGIC);
    out.push(ARCHIVE_VERSION);
    out.extend_from_slice(&(vault_bytes.len() as u64).to_le_bytes());
    out.extend_from_slice(vault_bytes);
    out.extend_from_slice(&(docs.len() as u32).to_le_bytes());
    for (rel, data) in docs {
        let rel_bytes = rel.as_bytes();
        out.extend_from_slice(&(rel_bytes.len() as u32).to_le_bytes());
        out.extend_from_slice(rel_bytes);
        out.extend_from_slice(&(data.len() as u64).to_le_bytes());
        out.extend_from_slice(data);
    }
    out
}

pub struct DecodedBackupArchive<'a> {
    pub vault_bytes: &'a [u8],
    pub documents: Vec<(String, &'a [u8])>,
}

/// Parses either an `LGFA` backup archive (vault + documents) or a standalone vault file (`LGFV` or legacy).
pub fn decode_backup_archive(raw: &[u8]) -> Result<DecodedBackupArchive<'_>, String> {
    if raw.len() < 4 || &raw[..4] != ARCHIVE_MAGIC {
        return Ok(DecodedBackupArchive {
            vault_bytes: raw,
            documents: vec![],
        });
    }

    if raw.len() < 4 + 1 + 8 + 4 {
        return Err("Corrupt backup archive".to_string());
    }
    if raw[4] != ARCHIVE_VERSION {
        return Err(format!("Unsupported backup archive version {}", raw[4]));
    }

    let mut pos = 5usize;
    let vault_len = u64::from_le_bytes(raw[pos..pos + 8].try_into().unwrap()) as usize;
    pos += 8;
    if raw.len() < pos.saturating_add(vault_len) {
        return Err("Truncated backup archive (vault)".to_string());
    }
    let vault_bytes = &raw[pos..pos + vault_len];
    pos += vault_len;

    if raw.len() < pos + 4 {
        return Err("Truncated backup archive (doc count)".to_string());
    }
    let doc_count = u32::from_le_bytes(raw[pos..pos + 4].try_into().unwrap()) as usize;
    pos += 4;

    let mut documents = Vec::with_capacity(doc_count);
    for _ in 0..doc_count {
        if raw.len() < pos + 4 {
            return Err("Truncated backup archive (doc path len)".to_string());
        }
        let rel_len = u32::from_le_bytes(raw[pos..pos + 4].try_into().unwrap()) as usize;
        pos += 4;
        if raw.len() < pos.saturating_add(rel_len) {
            return Err("Truncated backup archive (doc path)".to_string());
        }
        let rel = std::str::from_utf8(&raw[pos..pos + rel_len])
            .map_err(|_| "Invalid UTF-8 path in backup archive".to_string())?
            .to_string();
        validate_safe_rel_doc_path(&rel)?;
        pos += rel_len;

        if raw.len() < pos + 8 {
            return Err("Truncated backup archive (doc data len)".to_string());
        }
        let data_len = u64::from_le_bytes(raw[pos..pos + 8].try_into().unwrap()) as usize;
        pos += 8;
        if raw.len() < pos.saturating_add(data_len) {
            return Err("Truncated backup archive (doc data)".to_string());
        }
        let data = &raw[pos..pos + data_len];
        pos += data_len;
        documents.push((rel, data));
    }

    Ok(DecodedBackupArchive {
        vault_bytes,
        documents,
    })
}

/// Unpacks encrypted document entries from a backup archive into `dir/documents/...`.
pub fn unpack_backup_documents(dir: &Path, docs: &[(String, &[u8])]) -> Result<(), String> {
    for (rel, data) in docs {
        let safe_rel = validate_safe_rel_doc_path(rel)?;
        let dest = dir.join(safe_rel);
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let tmp = dest.with_extension(format!("restore.{}.tmp", uuid::Uuid::new_v4()));
        let res = (|| -> std::io::Result<()> {
            let mut f = std::fs::File::create(&tmp)?;
            f.write_all(data)?;
            f.sync_all()?;
            drop(f);
            std::fs::rename(&tmp, &dest)?;
            Ok(())
        })();
        if let Err(e) = res {
            let _ = std::fs::remove_file(&tmp);
            return Err(e.to_string());
        }
    }
    Ok(())
}

/// Writes an archive atomically to `dest`.
pub fn write_archive_to_path(dest: &Path, archive_bytes: &[u8]) -> Result<(), String> {
    let parent = dest.parent().unwrap_or_else(|| Path::new("."));
    let tmp = parent.join(format!(".lagosfile_backup.{}.tmp", uuid::Uuid::new_v4()));

    let res = (|| -> std::io::Result<()> {
        let mut f = std::fs::File::create(&tmp)?;
        f.write_all(archive_bytes)?;
        f.sync_all()?;
        drop(f);
        std::fs::rename(&tmp, dest)?;
        Ok(())
    })();

    if let Err(e) = res {
        let _ = std::fs::remove_file(&tmp);
        return Err(e.to_string());
    }
    Ok(())
}

/// RAII temp directory guard that removes the directory and its contents when dropped.
pub struct TempDirGuard {
    path: PathBuf,
}

impl TempDirGuard {
    pub fn new(prefix: &str) -> Result<Self, String> {
        let path = std::env::temp_dir().join(format!("{}-{}", prefix, uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
        Ok(Self { path })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for TempDirGuard {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.path);
    }
}

/// If `path` refers to an encrypted document (`LGFD\x01`), decrypts it to a temporary file
/// for external viewing/printing and registers the temp folder in `state.temp_preview_files`
/// so it is wiped when the vault locks. Plaintext files are returned unchanged.
pub fn prepare_file_for_external_app(
    app_dir: &Path,
    path: &str,
    state: &AppState,
) -> Result<PathBuf, String> {
    let resolved = resolve_doc_path(app_dir, path);
    let raw = std::fs::read(&resolved).map_err(|e| format!("File not found: {} ({})", path, e))?;
    if !is_encrypted_doc(&raw) {
        return Ok(resolved);
    }

    let doc_key = {
        let guard = state.db.lock().map_err(|e| e.to_string())?;
        let db = guard.as_ref().ok_or("Database not unlocked")?;
        get_doc_key(db)?.ok_or("Document key not found in database")?
    };
    let plaintext = decrypt_doc(&raw, &doc_key)?;

    let temp_dir = std::env::temp_dir().join(format!("lagosfile-view-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    let orig_name = resolved
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("attachment")
        .strip_suffix(".enc")
        .unwrap_or_else(|| {
            resolved
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("attachment")
        });
    let out_path = temp_dir.join(orig_name);
    std::fs::write(&out_path, plaintext).map_err(|e| e.to_string())?;

    state.temp_preview_files.lock().unwrap().push(temp_dir);
    Ok(out_path)
}

/// Deletes any temporary decrypted preview directories created during this session.
pub fn cleanup_temp_previews(state: &AppState) {
    let dirs: Vec<PathBuf> = state.temp_preview_files.lock().unwrap().drain(..).collect();
    for dir in dirs {
        let _ = std::fs::remove_dir_all(dir);
    }
}
