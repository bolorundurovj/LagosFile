use crate::services::security;
use sha2::{Digest, Sha256};
use std::io::Write;
use std::path::{Path, PathBuf};

/// Computes the SHA-256 digest of raw vault bytes for cross-process optimistic concurrency control.
pub fn compute_bytes_digest(bytes: &[u8]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let result = hasher.finalize();
    let mut out = [0u8; 32];
    out.copy_from_slice(&result);
    out
}

/// Reads the current on-disk `lagosfile.db.enc` and returns its SHA-256 digest, if present.
pub fn read_vault_digest(dir: &Path) -> Option<[u8; 32]> {
    let bytes = std::fs::read(vault_path(dir)).ok()?;
    Some(compute_bytes_digest(&bytes))
}

struct CrossProcessLockGuard(PathBuf);

impl Drop for CrossProcessLockGuard {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

fn acquire_cross_process_write_lock(dir: &Path) -> Result<CrossProcessLockGuard, String> {
    let lock_path = dir.join(".vault.write.lock");
    for attempt in 0..20 {
        match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&lock_path)
        {
            Ok(_) => return Ok(CrossProcessLockGuard(lock_path)),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists && attempt < 19 => {
                if let Ok(meta) = std::fs::metadata(&lock_path) {
                    if let Ok(modified) = meta.modified() {
                        if modified
                            .elapsed()
                            .map(|d| d > std::time::Duration::from_secs(30))
                            .unwrap_or(false)
                        {
                            let _ = std::fs::remove_file(&lock_path);
                            continue;
                        }
                    }
                }
                std::thread::sleep(std::time::Duration::from_millis(25 * (attempt as u64 + 1)));
            }
            Err(e) => return Err(format!("Could not acquire vault write lock: {}", e)),
        }
    }
    Err("Timed out waiting for concurrent LagosFile process write lock.".to_string())
}

pub const VAULT_MAGIC: &[u8; 4] = b"LGFV";
pub const VAULT_VERSION: u8 = 1;
pub const SALT_LEN: usize = 16;
pub const HEADER_LEN: usize = 4 + 1 + SALT_LEN;

pub fn vault_path(dir: &Path) -> std::path::PathBuf {
    dir.join("lagosfile.db.enc")
}

pub fn legacy_salt_path(dir: &Path) -> std::path::PathBuf {
    dir.join(".salt")
}

/// Returns true if `raw` begins with the self-describing LagosFile vault v1 header.
pub fn has_vault_header(raw: &[u8]) -> bool {
    raw.len() >= HEADER_LEN && &raw[..4] == VAULT_MAGIC && raw[4] == VAULT_VERSION
}

/// Encodes plaintext SQLite bytes into the self-describing vault format:
/// `magic (4) | version (1) | salt (16) | nonce (12) | ciphertext`
pub fn encode(plaintext: &[u8], key: &[u8; 32], salt: &[u8; 16]) -> Result<Vec<u8>, String> {
    let payload = security::encrypt(plaintext, key).map_err(|e| e.to_string())?;
    let mut out = Vec::with_capacity(HEADER_LEN + payload.len());
    out.extend_from_slice(VAULT_MAGIC);
    out.push(VAULT_VERSION);
    out.extend_from_slice(salt);
    out.extend_from_slice(&payload);
    Ok(out)
}

fn read_salt_file(path: &Path) -> Result<[u8; SALT_LEN], String> {
    let bytes = std::fs::read(path).map_err(|_| "Salt file not found".to_string())?;
    if bytes.len() != SALT_LEN {
        return Err("Corrupt salt file".to_string());
    }
    let mut salt = [0u8; SALT_LEN];
    salt.copy_from_slice(&bytes);
    Ok(salt)
}

pub struct DecodedVault {
    pub plaintext: Vec<u8>,
    pub key: [u8; 32],
    pub salt: [u8; SALT_LEN],
    pub was_legacy: bool,
}

/// Decodes vault bytes using a user PIN.
/// Supports both the v1 self-describing format and legacy v1.2.0 vaults (using `legacy_salt` or `legacy_salt_path`).
pub fn decode_with_pin(
    raw: &[u8],
    pin: &str,
    legacy_salt: Option<&[u8; SALT_LEN]>,
    legacy_salt_file: Option<&Path>,
) -> Result<DecodedVault, String> {
    if raw.len() >= 4 && &raw[..4] == VAULT_MAGIC {
        if raw.len() < HEADER_LEN {
            return Err("Corrupt vault file".to_string());
        }
        let version = raw[4];
        if version != VAULT_VERSION {
            return Err(format!("Unsupported vault format version {}", version));
        }
        let mut salt = [0u8; SALT_LEN];
        salt.copy_from_slice(&raw[5..HEADER_LEN]);
        let key = security::derive_key(pin, &salt);
        let plaintext = security::decrypt(&raw[HEADER_LEN..], &key)
            .map_err(|_| "Incorrect PIN. Please try again.".to_string())?;
        Ok(DecodedVault {
            plaintext,
            key,
            salt,
            was_legacy: false,
        })
    } else {
        let salt = if let Some(s) = legacy_salt {
            *s
        } else if let Some(path) = legacy_salt_file {
            read_salt_file(path)?
        } else {
            return Err(
                "This backup is from an older format without an embedded salt and cannot be restored here."
                    .to_string(),
            );
        };
        let key = security::derive_key(pin, &salt);
        let plaintext = security::decrypt(raw, &key)
            .map_err(|_| "Incorrect PIN. Please try again.".to_string())?;
        Ok(DecodedVault {
            plaintext,
            key,
            salt,
            was_legacy: true,
        })
    }
}

/// Decodes vault bytes using an already-derived 32-byte DB key (e.g. biometric keyring or recovery blob).
pub fn decode_with_key(
    raw: &[u8],
    key: &[u8; 32],
    legacy_salt_file: Option<&Path>,
) -> Result<DecodedVault, String> {
    if raw.len() >= 4 && &raw[..4] == VAULT_MAGIC {
        if raw.len() < HEADER_LEN {
            return Err("Corrupt vault file".to_string());
        }
        let version = raw[4];
        if version != VAULT_VERSION {
            return Err(format!("Unsupported vault format version {}", version));
        }
        let mut salt = [0u8; SALT_LEN];
        salt.copy_from_slice(&raw[5..HEADER_LEN]);
        let plaintext = security::decrypt(&raw[HEADER_LEN..], key)
            .map_err(|_| "Could not decrypt database.".to_string())?;
        Ok(DecodedVault {
            plaintext,
            key: *key,
            salt,
            was_legacy: false,
        })
    } else {
        let plaintext =
            security::decrypt(raw, key).map_err(|_| "Could not decrypt database.".to_string())?;
        let salt = legacy_salt_file
            .ok_or_else(|| {
                "Legacy vault is missing its .salt file and cannot safely preserve PIN unlock."
                    .to_string()
            })
            .and_then(|p| {
                read_salt_file(p).map_err(|_| {
                    "Legacy vault .salt file is missing or unreadable; refusing to unlock with an unknown salt."
                        .to_string()
                })
            })?;
        Ok(DecodedVault {
            plaintext,
            key: *key,
            salt,
            was_legacy: true,
        })
    }
}

/// Returns true when an I/O error on rename is a transient Windows lock error
/// (`ERROR_ACCESS_DENIED` = 5, `ERROR_SHARING_VIOLATION` = 32, `ERROR_LOCK_VIOLATION` = 33).
fn is_transient_rename_err(e: &std::io::Error) -> bool {
    e.kind() == std::io::ErrorKind::PermissionDenied
        || matches!(e.raw_os_error(), Some(5 | 32 | 33))
}

/// Renames `from` to `to`, retrying briefly on transient Windows permission/sharing/lock
/// errors caused by antivirus/indexer scans momentarily holding a handle on newly written files.
pub fn rename_with_retry(from: &Path, to: &Path) -> std::io::Result<()> {
    let mut last_err = None;
    for attempt in 0..16 {
        match std::fs::rename(from, to) {
            Ok(()) => return Ok(()),
            Err(e) if is_transient_rename_err(&e) && attempt < 15 => {
                last_err = Some(e);
                let delay_ms = (25 * (attempt as u64 + 1)).min(200);
                std::thread::sleep(std::time::Duration::from_millis(delay_ms));
            }
            Err(e) => return Err(e),
        }
    }
    Err(last_err.unwrap_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::PermissionDenied, "rename failed")
    }))
}

/// Atomically writes a v1 self-describing vault to `dir/lagosfile.db.enc`,
/// verifying that the on-disk vault still matches `expected_digest` (when `Some`) under a
/// cross-process lockfile so two LagosFile instances cannot silently overwrite each other's changes.
/// Invokes `before_rename` after the encrypted temp file has been written and flushed.
/// Deletes any legacy `dir/.salt` file ONLY after the rename succeeds.
pub fn write_atomic_cas_with_hook<F>(
    dir: &Path,
    plaintext: &[u8],
    key: &[u8; 32],
    salt: &[u8; SALT_LEN],
    expected_digest: Option<[u8; 32]>,
    before_rename: F,
) -> Result<[u8; 32], String>
where
    F: FnOnce(&Path) -> Result<(), String>,
{
    let encoded = encode(plaintext, key, salt)?;
    let new_digest = compute_bytes_digest(&encoded);
    let target = vault_path(dir);
    let tmp = dir.join(format!("lagosfile.db.{}.tmp", uuid::Uuid::new_v4()));

    let write_res = (|| -> std::io::Result<()> {
        let mut f = std::fs::File::create(&tmp)?;
        f.write_all(&encoded)?;
        f.sync_all()?;
        Ok(())
    })();

    if let Err(e) = write_res {
        let _ = std::fs::remove_file(&tmp);
        return Err(e.to_string());
    }

    if let Err(e) = before_rename(&tmp) {
        let _ = std::fs::remove_file(&tmp);
        return Err(e);
    }

    let _proc_lock = match acquire_cross_process_write_lock(dir) {
        Ok(g) => g,
        Err(e) => {
            let _ = std::fs::remove_file(&tmp);
            return Err(e);
        }
    };

    if let Some(exp) = expected_digest {
        match read_vault_digest(dir) {
            Some(actual) if actual == exp => {}
            Some(_) => {
                let _ = std::fs::remove_file(&tmp);
                return Err(
                    "Vault was modified on disk by another LagosFile instance. Refusing to overwrite newer data."
                        .to_string(),
                );
            }
            None => {
                let _ = std::fs::remove_file(&tmp);
                return Err(
                    "Vault file is missing on disk. Refusing to write stale session.".to_string(),
                );
            }
        }
    }

    if let Err(e) = rename_with_retry(&tmp, &target) {
        let _ = std::fs::remove_file(&tmp);
        return Err(e.to_string());
    }

    // Remove legacy .salt only after the self-describing vault is safely on disk.
    let _ = std::fs::remove_file(legacy_salt_path(dir));
    Ok(new_digest)
}

/// Atomically writes a v1 self-describing vault to `dir/lagosfile.db.enc`,
/// invoking `before_rename` after the encrypted temp file has been written and flushed.
/// Deletes any legacy `dir/.salt` file ONLY after the rename succeeds.
pub fn write_atomic_with_hook<F>(
    dir: &Path,
    plaintext: &[u8],
    key: &[u8; 32],
    salt: &[u8; SALT_LEN],
    before_rename: F,
) -> Result<(), String>
where
    F: FnOnce(&Path) -> Result<(), String>,
{
    write_atomic_cas_with_hook(dir, plaintext, key, salt, None, before_rename).map(|_| ())
}

/// Atomically writes a v1 self-describing vault to `dir/lagosfile.db.enc`.
/// Deletes any legacy `dir/.salt` file ONLY after the rename succeeds.
pub fn write_atomic(
    dir: &Path,
    plaintext: &[u8],
    key: &[u8; 32],
    salt: &[u8; SALT_LEN],
) -> Result<(), String> {
    write_atomic_with_hook(dir, plaintext, key, salt, |_| Ok(()))
}

/// Exclusively creates a brand-new v1 vault at `dir/lagosfile.db.enc`.
/// Writes and fsyncs a temp file first, then claims `target` atomically via `hard_link`
/// (failing with a friendly message if a vault already exists) so an interrupted write can
/// never leave a partial/0-byte file at `lagosfile.db.enc` blocking future setup retries.
pub fn write_new_exclusive_with_hook<F>(
    dir: &Path,
    plaintext: &[u8],
    key: &[u8; 32],
    salt: &[u8; SALT_LEN],
    before_claim: F,
) -> Result<(), String>
where
    F: FnOnce(&Path) -> Result<(), String>,
{
    let encoded = encode(plaintext, key, salt)?;
    let target = vault_path(dir);
    let tmp = dir.join(format!("lagosfile.db.new.{}.tmp", uuid::Uuid::new_v4()));

    let write_res = (|| -> std::io::Result<()> {
        let mut file = std::fs::File::create(&tmp)?;
        file.write_all(&encoded)?;
        file.sync_all()?;
        Ok(())
    })();

    if let Err(e) = write_res {
        let _ = std::fs::remove_file(&tmp);
        return Err(e.to_string());
    }

    if let Err(e) = before_claim(&tmp) {
        let _ = std::fs::remove_file(&tmp);
        return Err(e);
    }

    let claim_res = std::fs::hard_link(&tmp, &target);
    match claim_res {
        Ok(()) => {
            let _ = std::fs::remove_file(&tmp);
        }
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
            let _ = std::fs::remove_file(&tmp);
            return Err("A vault already exists. Please unlock with your PIN instead.".to_string());
        }
        Err(e)
            if e.kind() == std::io::ErrorKind::Unsupported
                || matches!(e.raw_os_error(), Some(1 | 50)) =>
        {
            // Fallback for filesystems without hard links (e.g. FAT32/exFAT):
            // open exclusively with create_new(true) and write the encoded bytes.
            let _ = std::fs::remove_file(&tmp);
            let mut file = match std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&target)
            {
                Ok(f) => f,
                Err(oe) if oe.kind() == std::io::ErrorKind::AlreadyExists => {
                    return Err(
                        "A vault already exists. Please unlock with your PIN instead.".to_string(),
                    );
                }
                Err(oe) => return Err(oe.to_string()),
            };
            if let Err(we) = file.write_all(&encoded).and_then(|_| file.sync_all()) {
                drop(file);
                let _ = std::fs::remove_file(&target);
                return Err(we.to_string());
            }
        }
        Err(e) => {
            let _ = std::fs::remove_file(&tmp);
            return Err(e.to_string());
        }
    }

    let _ = std::fs::remove_file(legacy_salt_path(dir));
    Ok(())
}

/// Exclusively creates a brand-new v1 vault at `dir/lagosfile.db.enc`.
pub fn write_new_exclusive(
    dir: &Path,
    plaintext: &[u8],
    key: &[u8; 32],
    salt: &[u8; SALT_LEN],
) -> Result<(), String> {
    write_new_exclusive_with_hook(dir, plaintext, key, salt, |_| Ok(()))
}

/// Writes a self-describing v1 vault backup atomically to an arbitrary destination path.
pub fn write_to_path(
    dest: &Path,
    plaintext: &[u8],
    key: &[u8; 32],
    salt: &[u8; SALT_LEN],
) -> Result<(), String> {
    let encoded = encode(plaintext, key, salt)?;
    let parent = dest.parent().unwrap_or_else(|| Path::new("."));
    let tmp = parent.join(format!(".lagosfile_backup.{}.tmp", uuid::Uuid::new_v4()));

    let res = (|| -> std::io::Result<()> {
        let mut f = std::fs::File::create(&tmp)?;
        f.write_all(&encoded)?;
        f.sync_all()?;
        drop(f);
        rename_with_retry(&tmp, dest)?;
        Ok(())
    })();

    if let Err(e) = res {
        let _ = std::fs::remove_file(&tmp);
        return Err(e.to_string());
    }
    Ok(())
}
