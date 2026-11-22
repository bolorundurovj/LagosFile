use crate::{
    db::{self, doc_store, vault, AppDb},
    models::{AppStatus, Taxpayer},
    services::security,
    AppState,
};
use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::{Emitter, State};

#[cfg(windows)]
use windows::Foundation::IAsyncOperation;
#[cfg(windows)]
use windows::Security::Credentials::UI::{
    UserConsentVerificationResult, UserConsentVerifier, UserConsentVerifierAvailability,
};
#[cfg(windows)]
use windows::Win32::Foundation::HWND;
#[cfg(windows)]
use windows::Win32::System::WinRT::IUserConsentVerifierInterop;

const KEYRING_SERVICE: &str = "LagosFile";
const KEYRING_USER: &str = "db_key";

pub trait BiometricKeyStore {
    fn get_key_hex(&self) -> Option<String>;
    fn set_key_hex(&self, hex_key: &str) -> Result<(), String>;
    fn delete_key(&self);
}

pub struct OsKeyringStore;

impl BiometricKeyStore for OsKeyringStore {
    fn get_key_hex(&self) -> Option<String> {
        Entry::new(KEYRING_SERVICE, KEYRING_USER)
            .ok()
            .and_then(|e| e.get_password().ok())
    }

    fn set_key_hex(&self, hex_key: &str) -> Result<(), String> {
        let entry = Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| e.to_string())?;
        entry.set_password(hex_key).map_err(|e| e.to_string())
    }

    fn delete_key(&self) {
        if let Ok(entry) = Entry::new(KEYRING_SERVICE, KEYRING_USER) {
            let _ = entry.delete_password();
        }
    }
}

/// If biometric unlock is currently enabled in `store`, updates the stored key to `new_key`.
/// If updating fails, deletes the stale keyring entry so biometric unlock is cleanly disabled.
/// Returns whether biometric unlock remains enabled.
fn sync_biometric_keyring(store: &dyn BiometricKeyStore, new_key: &[u8; 32]) -> bool {
    if store.get_key_hex().is_none() {
        return false;
    }
    if store.set_key_hex(&hex::encode(new_key)).is_ok() {
        true
    } else {
        store.delete_key();
        false
    }
}

async fn check_biometric_available_internal() -> bool {
    #[cfg(windows)]
    {
        match tokio::task::spawn_blocking(|| {
            UserConsentVerifier::CheckAvailabilityAsync().and_then(|op| op.get())
        })
        .await
        {
            Ok(Ok(availability)) => availability == UserConsentVerifierAvailability::Available,
            _ => false,
        }
    }
    #[cfg(not(windows))]
    {
        false
    }
}

async fn verify_biometric_internal(window: tauri::Window) -> Result<(), String> {
    #[cfg(windows)]
    {
        let hwnd_raw = window.hwnd().map_err(|e| e.to_string())?.0 as isize;

        match tokio::task::spawn_blocking(move || {
            let interop: IUserConsentVerifierInterop =
                windows::core::factory::<UserConsentVerifier, IUserConsentVerifierInterop>()?;
            let op: IAsyncOperation<UserConsentVerificationResult> = unsafe {
                interop.RequestVerificationForWindowAsync(
                    HWND(hwnd_raw as _),
                    windows::core::h!("Please verify your identity to unlock LagosFile"),
                )?
            };
            op.get()
        })
        .await
        {
            Ok(Ok(result)) => {
                if result == UserConsentVerificationResult::Verified {
                    Ok(())
                } else if result == UserConsentVerificationResult::Canceled {
                    Err("Biometric verification canceled".to_string())
                } else {
                    Err(format!("Biometric verification failed: {:?}", result))
                }
            }
            Ok(Err(e)) => Err(e.to_string()),
            Err(e) => Err(e.to_string()),
        }
    }
    #[cfg(not(windows))]
    {
        let _ = window;
        Err("Biometric authentication is not supported on this platform".to_string())
    }
}

#[derive(Serialize, Deserialize)]
struct RecoveryData {
    question_1: String,
    question_2: String,
    question_3: String,
    answer_salt: String,
    recovery_blob: String,
}

fn recovery_path_in_dir(dir: &Path) -> std::path::PathBuf {
    dir.join(".recovery")
}

fn recovery_path() -> std::path::PathBuf {
    recovery_path_in_dir(&db::app_dir())
}

fn normalize_answer(s: &str) -> String {
    s.trim().to_lowercase()
}

fn answer_key(answers: &[String], salt: &[u8]) -> [u8; 32] {
    let combined = answers
        .iter()
        .map(|a| normalize_answer(a))
        .collect::<Vec<_>>()
        .join("|");
    security::derive_key(&combined, salt)
}

fn load_taxpayer(db: &AppDb) -> Option<Taxpayer> {
    let conn = db.conn.lock().unwrap();
    conn.query_row(
        "SELECT id, full_name, tin, address, phone, email, filing_agent, created_at
         FROM taxpayer LIMIT 1",
        [],
        |row| {
            let created_str: String = row.get(7)?;
            let created_at = chrono::DateTime::parse_from_rfc3339(&created_str)
                .map(|dt| dt.with_timezone(&chrono::Utc))
                .unwrap_or_else(|_| chrono::Utc::now());
            Ok(Taxpayer {
                id: uuid::Uuid::parse_str(&row.get::<_, String>(0)?)
                    .unwrap_or_else(|_| uuid::Uuid::new_v4()),
                full_name: row.get(1)?,
                tin: row.get(2)?,
                address: row.get(3)?,
                phone: row.get(4)?,
                email: row.get(5)?,
                filing_agent: row.get(6)?,
                created_at,
            })
        },
    )
    .ok()
}

#[tauri::command]
pub async fn check_app_status(state: State<'_, AppState>) -> Result<AppStatus, String> {
    let _io = state.vault_io_lock.lock().await;
    let _ = recover_interrupted_restore(&db::app_dir());
    db::ensure_dirs().map_err(|e| e.to_string())?;
    let has_db = db::db_path().exists();
    let has_recovery = recovery_path().exists();

    let biometric_available = check_biometric_available_internal().await;
    let biometric_enabled = Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map(|e| e.get_password().is_ok())
        .unwrap_or(false);

    Ok(AppStatus {
        has_db,
        has_profile: false,
        has_recovery,
        biometric_available,
        biometric_enabled,
    })
}

#[tauri::command]
pub async fn is_biometric_available() -> Result<bool, String> {
    Ok(check_biometric_available_internal().await)
}

struct StageDirGuard {
    path: std::path::PathBuf,
    disarmed: bool,
}

impl StageDirGuard {
    fn new(path: std::path::PathBuf) -> Self {
        Self {
            path,
            disarmed: false,
        }
    }

    fn disarm(&mut self) {
        self.disarmed = true;
    }
}

impl Drop for StageDirGuard {
    fn drop(&mut self) {
        if !self.disarmed {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }
}

#[derive(Serialize, Deserialize)]
struct RestoreJournal {
    /// `"pre_commit"` -> vault not yet swapped; rollback restores `prev_docs_dir`.
    /// `"committing"` -> `documents/` is already the new backup; roll-forward moves staged vault into place.
    /// `"committed"` -> both `documents/` and vault are the new backup; cleanup leftovers only.
    phase: String,
    stage_dir: String,
    prev_docs_dir: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RecoveryOutcome {
    None,
    RolledBack,
    RolledForward,
}

fn restore_journal_path(dir: &Path) -> std::path::PathBuf {
    dir.join(".restore_journal.json")
}

fn write_restore_journal(dir: &Path, journal: &RestoreJournal) -> Result<(), String> {
    use std::io::Write;
    let path = restore_journal_path(dir);
    let tmp = dir.join(format!(".restore_journal.{}.tmp", uuid::Uuid::new_v4()));
    let json = serde_json::to_vec(journal).map_err(|e| e.to_string())?;
    let res = (|| -> std::io::Result<()> {
        let mut f = std::fs::File::create(&tmp)?;
        f.write_all(&json)?;
        f.sync_all()?;
        drop(f);
        vault::rename_with_retry(&tmp, &path)?;
        Ok(())
    })();
    if let Err(e) = res {
        let _ = std::fs::remove_file(&tmp);
        return Err(e.to_string());
    }
    Ok(())
}

/// Recovers deterministically from any process crash or post-commit error that interrupted a
/// staged restore between moving `documents/` and replacing `lagosfile.db.enc`, ensuring the
/// live database and `documents/` directory always belong to the exact same backup.
pub fn recover_interrupted_restore(dir: &Path) -> Result<RecoveryOutcome, String> {
    let journal_path = restore_journal_path(dir);
    if !journal_path.exists() {
        return Ok(RecoveryOutcome::None);
    }
    let raw = std::fs::read(&journal_path).map_err(|e| e.to_string())?;
    let mut journal: RestoreJournal = match serde_json::from_slice(&raw) {
        Ok(j) => j,
        Err(_) => {
            let _ = std::fs::remove_file(&journal_path);
            return Ok(RecoveryOutcome::None);
        }
    };

    let live_docs = dir.join("documents");
    let stage_dir = dir.join(&journal.stage_dir);
    let prev_docs = journal.prev_docs_dir.as_ref().map(|p| dir.join(p));

    let outcome = match journal.phase.as_str() {
        "pre_commit" => {
            // Live lagosfile.db.enc has NOT been replaced yet -> roll back documents/.
            if let Some(ref prev) = prev_docs {
                if prev.exists() {
                    if live_docs.exists() {
                        let _ = std::fs::remove_dir_all(&live_docs);
                    }
                    vault::rename_with_retry(prev, &live_docs).map_err(|e| e.to_string())?;
                }
            } else if live_docs.exists()
                && stage_dir.exists()
                && !stage_dir.join("documents").exists()
            {
                // Fresh/empty original docs was replaced by staged docs before commit -> remove it.
                let _ = std::fs::remove_dir_all(&live_docs);
            }
            if stage_dir.exists() {
                let _ = std::fs::remove_dir_all(&stage_dir);
            }
            RecoveryOutcome::RolledBack
        }
        "committing" => {
            // Live documents/ is ALREADY the new backup -> attempt to roll forward vault replacement.
            let staged_vault = stage_dir.join("lagosfile.db.enc");
            let roll_forward_ok = if staged_vault.exists() {
                vault::rename_with_retry(&staged_vault, &vault::vault_path(dir)).is_ok()
            } else {
                vault::vault_path(dir).exists()
            };
            if roll_forward_ok {
                if let Some(ref prev) = prev_docs {
                    if prev.exists() {
                        let _ = std::fs::remove_dir_all(prev);
                    }
                }
                if stage_dir.exists() {
                    let _ = std::fs::remove_dir_all(&stage_dir);
                }
                RecoveryOutcome::RolledForward
            } else {
                // Vault replacement could not complete -> rewind journal to pre_commit and roll back documents/.
                journal.phase = "pre_commit".to_string();
                let _ = write_restore_journal(dir, &journal);
                if let Some(ref prev) = prev_docs {
                    if prev.exists() {
                        if live_docs.exists() {
                            let _ = std::fs::remove_dir_all(&live_docs);
                        }
                        vault::rename_with_retry(prev, &live_docs).map_err(|e| e.to_string())?;
                    }
                } else if live_docs.exists() {
                    let _ = std::fs::remove_dir_all(&live_docs);
                }
                if stage_dir.exists() {
                    let _ = std::fs::remove_dir_all(&stage_dir);
                }
                RecoveryOutcome::RolledBack
            }
        }
        _ => {
            // "committed": both vault and documents are already in place -> clean up leftovers.
            if let Some(ref prev) = prev_docs {
                if prev.exists() {
                    let _ = std::fs::remove_dir_all(prev);
                }
            }
            if stage_dir.exists() {
                let _ = std::fs::remove_dir_all(&stage_dir);
            }
            RecoveryOutcome::RolledForward
        }
    };

    let _ = std::fs::remove_file(&journal_path);
    Ok(outcome)
}

/// Helper that publishes unlocked session state in canonical lock order
/// (`db -> key -> salt -> vault_digest -> recovery_verified`).
fn publish_unlocked_state(
    dir: &Path,
    state: &AppState,
    db: AppDb,
    key: [u8; 32],
    salt: [u8; 16],
    recovery_verified: bool,
) {
    let digest = vault::read_vault_digest(dir);
    let mut db_guard = state.db.lock().unwrap();
    let mut key_guard = state.key.lock().unwrap();
    let mut salt_guard = state.salt.lock().unwrap();
    let mut digest_guard = state.vault_digest.lock().unwrap();
    let mut rv_guard = state.recovery_verified.lock().unwrap();
    *db_guard = Some(db);
    *key_guard = Some(key);
    *salt_guard = Some(salt);
    *digest_guard = digest;
    *rv_guard = recovery_verified;
}

type VaultSnapshot = (Vec<u8>, [u8; 32], [u8; 16], Option<[u8; 32]>);
type UnlockedVaultTuple = (AppDb, [u8; 32], [u8; 16], Option<Taxpayer>);

/// Helper that snapshots `(serialized_db, key, salt, expected_vault_digest)` in canonical lock order.
fn snapshot_vault_state(state: &AppState) -> Result<Option<VaultSnapshot>, String> {
    let db_guard = state.db.lock().unwrap();
    let key_guard = state.key.lock().unwrap();
    let salt_guard = state.salt.lock().unwrap();
    let digest_guard = state.vault_digest.lock().unwrap();
    if let (Some(db), Some(key), Some(salt)) =
        (db_guard.as_ref(), key_guard.as_ref(), salt_guard.as_ref())
    {
        let bytes = db.serialize().map_err(|e| e.to_string())?;
        Ok(Some((bytes, *key, *salt, *digest_guard)))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub async fn enable_biometric(
    window: tauri::Window,
    state: State<'_, AppState>,
) -> Result<(), String> {
    {
        let key_guard = state.key.lock().unwrap();
        if key_guard.is_none() {
            return Err("Database not unlocked".to_string());
        }
    }

    verify_biometric_internal(window).await?;

    let _io = state.vault_io_lock.lock().await;
    let key = {
        let key_guard = state.key.lock().unwrap();
        *key_guard.as_ref().ok_or("Database not unlocked")?
    };

    tokio::task::spawn_blocking(move || {
        let entry = Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| e.to_string())?;
        entry
            .set_password(&hex::encode(key))
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(())
}

#[tauri::command]
pub async fn disable_biometric(state: State<'_, AppState>) -> Result<(), String> {
    let _io = state.vault_io_lock.lock().await;
    tokio::task::spawn_blocking(|| {
        let entry = Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| e.to_string())?;
        let _ = entry.delete_password();
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| e.to_string())?
}

fn decode_and_migrate_with_key<P, B>(
    dir: &Path,
    db_key: [u8; 32],
    error_msg: &str,
    on_progress: P,
    before_file: B,
) -> Result<(AppDb, [u8; 16], Option<Taxpayer>), String>
where
    P: FnMut(usize, usize, &str),
    B: FnMut(usize, &str) -> Result<(), String>,
{
    recover_interrupted_restore(dir)?;
    let raw = std::fs::read(vault::vault_path(dir)).map_err(|e| e.to_string())?;
    let legacy_salt_file = vault::legacy_salt_path(dir);
    let decoded = vault::decode_with_key(&raw, &db_key, Some(&legacy_salt_file)).map_err(|e| {
        if e.contains(".salt") {
            e
        } else {
            error_msg.to_string()
        }
    })?;

    let db = AppDb::open_in_memory().map_err(|e| e.to_string())?;
    db.load_from_bytes(&decoded.plaintext)
        .map_err(|e| e.to_string())?;

    // Migrate plaintext documents BEFORE publishing unlocked state into AppState.
    doc_store::migrate_plaintext_documents_for_db_with_hook(
        dir,
        &db,
        Some((&db_key, &decoded.salt)),
        on_progress,
        before_file,
    )?;

    let taxpayer = load_taxpayer(&db);
    Ok((db, decoded.salt, taxpayer))
}

pub fn unlock_with_biometric_key_in_dir(
    dir: &Path,
    db_key: [u8; 32],
    state: &AppState,
) -> Result<Option<Taxpayer>, String> {
    let (db, salt, taxpayer) = decode_and_migrate_with_key(
        dir,
        db_key,
        "Biometric unlock failed: could not decrypt database.",
        |_, _, _| {},
        |_, _| Ok(()),
    )?;
    publish_unlocked_state(dir, state, db, db_key, salt, false);
    Ok(taxpayer)
}

#[tauri::command]
pub async fn unlock_with_biometric(
    app: tauri::AppHandle,
    window: tauri::Window,
    state: State<'_, AppState>,
) -> Result<Option<Taxpayer>, String> {
    let password = tokio::task::spawn_blocking(|| {
        let entry = Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| e.to_string())?;
        entry
            .get_password()
            .map_err(|_| "Biometric login not enabled".to_string())
    })
    .await
    .map_err(|e| e.to_string())??;

    let key_bytes = hex::decode(&password).map_err(|_| "Corrupt biometric data".to_string())?;
    if key_bytes.len() != 32 {
        return Err("Corrupt biometric data".to_string());
    }
    let mut db_key = [0u8; 32];
    db_key.copy_from_slice(&key_bytes);

    verify_biometric_internal(window).await?;

    let _io = state.vault_io_lock.lock().await;
    let dir = db::app_dir();
    let dir_for_publish = dir.clone();
    let app_clone = app.clone();
    let (db, salt, taxpayer) = tokio::task::spawn_blocking(move || {
        decode_and_migrate_with_key(
            &dir,
            db_key,
            "Biometric unlock failed: could not decrypt database.",
            |completed, total, file_name| {
                let _ = app_clone.emit(
                    "doc-migration-progress",
                    serde_json::json!({
                        "completed": completed,
                        "total": total,
                        "fileName": file_name,
                    }),
                );
            },
            |_, _| Ok(()),
        )
    })
    .await
    .map_err(|e| e.to_string())??;

    publish_unlocked_state(&dir_for_publish, &state, db, db_key, salt, false);
    Ok(taxpayer)
}

fn setup_pin_sync(dir: &Path, pin: &str) -> Result<(AppDb, [u8; 32], [u8; 16]), String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    recover_interrupted_restore(dir)?;
    std::fs::create_dir_all(dir.join("documents")).map_err(|e| e.to_string())?;

    if vault::vault_path(dir).exists() {
        return Err("A vault already exists. Please unlock with your PIN instead.".to_string());
    }

    let salt = security::generate_salt();
    let new_db = AppDb::open_in_memory().map_err(|e| e.to_string())?;
    let bytes = new_db.serialize().map_err(|e| e.to_string())?;
    let key = security::derive_key(pin, &salt);

    vault::write_new_exclusive(dir, &bytes, &key, &salt)?;
    let _ = std::fs::remove_file(recovery_path_in_dir(dir));
    Ok((new_db, key, salt))
}

pub fn setup_pin_in_dir(dir: &Path, pin: &str, state: &AppState) -> Result<(), String> {
    let (new_db, key, salt) = setup_pin_sync(dir, pin)?;
    publish_unlocked_state(dir, state, new_db, key, salt, false);
    Ok(())
}

#[tauri::command]
pub async fn setup_pin(pin: String, state: State<'_, AppState>) -> Result<(), String> {
    let _io = state.vault_io_lock.lock().await;
    db::ensure_dirs().map_err(|e| e.to_string())?;
    let dir = db::app_dir();
    let dir_for_publish = dir.clone();

    let (new_db, key, salt) = tokio::task::spawn_blocking(move || {
        let res = setup_pin_sync(&dir, &pin)?;
        OsKeyringStore.delete_key();
        Ok::<_, String>(res)
    })
    .await
    .map_err(|e| e.to_string())??;

    publish_unlocked_state(&dir_for_publish, &state, new_db, key, salt, false);
    Ok(())
}

fn unlock_db_sync<P, B>(
    dir: &Path,
    pin: &str,
    on_progress: P,
    before_file: B,
) -> Result<UnlockedVaultTuple, String>
where
    P: FnMut(usize, usize, &str),
    B: FnMut(usize, &str) -> Result<(), String>,
{
    recover_interrupted_restore(dir)?;
    let raw = std::fs::read(vault::vault_path(dir)).map_err(|e| e.to_string())?;
    let legacy_salt_file = vault::legacy_salt_path(dir);
    let decoded = vault::decode_with_pin(&raw, pin, None, Some(&legacy_salt_file))?;

    let db = AppDb::open_in_memory().map_err(|e| e.to_string())?;
    db.load_from_bytes(&decoded.plaintext)
        .map_err(|e| e.to_string())?;

    // Migrate plaintext documents BEFORE publishing unlocked state into AppState.
    doc_store::migrate_plaintext_documents_for_db_with_hook(
        dir,
        &db,
        Some((&decoded.key, &decoded.salt)),
        on_progress,
        before_file,
    )?;

    let taxpayer = load_taxpayer(&db);
    Ok((db, decoded.key, decoded.salt, taxpayer))
}

pub fn unlock_db_in_dir_with_hook<B>(
    dir: &Path,
    pin: &str,
    state: &AppState,
    before_migration_file: B,
) -> Result<Option<Taxpayer>, String>
where
    B: FnMut(usize, &str) -> Result<(), String>,
{
    let (db, key, salt, taxpayer) = unlock_db_sync(dir, pin, |_, _, _| {}, before_migration_file)?;
    publish_unlocked_state(dir, state, db, key, salt, false);
    Ok(taxpayer)
}

pub fn unlock_db_in_dir(
    dir: &Path,
    pin: &str,
    state: &AppState,
) -> Result<Option<Taxpayer>, String> {
    unlock_db_in_dir_with_hook(dir, pin, state, |_, _| Ok(()))
}

#[tauri::command]
pub async fn unlock_db(
    app: tauri::AppHandle,
    pin: String,
    state: State<'_, AppState>,
) -> Result<Option<Taxpayer>, String> {
    let _io = state.vault_io_lock.lock().await;
    db::ensure_dirs().map_err(|e| e.to_string())?;
    let dir = db::app_dir();
    let dir_for_publish = dir.clone();
    let app_clone = app.clone();
    let (db, key, salt, taxpayer) = tokio::task::spawn_blocking(move || {
        unlock_db_sync(
            &dir,
            &pin,
            |completed, total, file_name| {
                let _ = app_clone.emit(
                    "doc-migration-progress",
                    serde_json::json!({
                        "completed": completed,
                        "total": total,
                        "fileName": file_name,
                    }),
                );
            },
            |_, _| Ok(()),
        )
    })
    .await
    .map_err(|e| e.to_string())??;

    publish_unlocked_state(&dir_for_publish, &state, db, key, salt, false);
    Ok(taxpayer)
}

pub fn persist_db_in_dir_with_hook<F>(
    dir: &Path,
    state: &AppState,
    before_rename: F,
) -> Result<(), String>
where
    F: FnOnce(&Path) -> Result<(), String>,
{
    let snapshot = snapshot_vault_state(state)?;
    let (bytes, key, salt, expected_digest) =
        snapshot.ok_or_else(|| "Database not unlocked".to_string())?;
    let new_digest = vault::write_atomic_cas_with_hook(
        dir,
        &bytes,
        &key,
        &salt,
        expected_digest,
        before_rename,
    )?;
    *state.vault_digest.lock().unwrap() = Some(new_digest);
    Ok(())
}

pub fn persist_db_in_dir(dir: &Path, state: &AppState) -> Result<(), String> {
    persist_db_in_dir_with_hook(dir, state, |_| Ok(()))
}

pub async fn persist_db_in_dir_async_with_hook<F>(
    dir: std::path::PathBuf,
    state: &AppState,
    before_rename: F,
) -> Result<(), String>
where
    F: FnOnce(&Path) -> Result<(), String> + Send + 'static,
{
    // Hold vault_io_lock from snapshot through rename so concurrent saves, PIN changes,
    // restores, and lock_db are strictly serialized and never overwrite newer state.
    let _io = state.vault_io_lock.lock().await;
    let snapshot = snapshot_vault_state(state)?;
    let (bytes, key, salt, expected_digest) =
        snapshot.ok_or_else(|| "Database not unlocked".to_string())?;

    let new_digest = tokio::task::spawn_blocking(move || {
        vault::write_atomic_cas_with_hook(&dir, &bytes, &key, &salt, expected_digest, before_rename)
    })
    .await
    .map_err(|e| e.to_string())??;
    *state.vault_digest.lock().unwrap() = Some(new_digest);
    Ok(())
}

pub async fn persist_db_in_dir_async(
    dir: std::path::PathBuf,
    state: &AppState,
) -> Result<(), String> {
    persist_db_in_dir_async_with_hook(dir, state, |_| Ok(())).await
}

pub async fn persist_db(state: &AppState) -> Result<(), String> {
    persist_db_in_dir_async(db::app_dir(), state).await
}

pub async fn lock_db_in_dir_with_hook<F>(
    dir: &Path,
    state: &AppState,
    before_rename: F,
) -> Result<(), String>
where
    F: FnOnce(&Path) -> Result<(), String> + Send + 'static,
{
    let _io = state.vault_io_lock.lock().await;

    // Atomically take unlocked state BEFORE dropping mutexes and awaiting disk I/O so no
    // concurrent mutation can commit into memory while the final lock snapshot is writing.
    let taken = {
        let mut db_guard = state.db.lock().unwrap();
        let mut key_guard = state.key.lock().unwrap();
        let mut salt_guard = state.salt.lock().unwrap();
        let mut digest_guard = state.vault_digest.lock().unwrap();
        let mut rv_guard = state.recovery_verified.lock().unwrap();
        let prev_rv = *rv_guard;
        let expected_digest = digest_guard.take();
        *rv_guard = false;
        match (db_guard.take(), key_guard.take(), salt_guard.take()) {
            (Some(db), Some(key), Some(salt)) => Some((db, key, salt, prev_rv, expected_digest)),
            (db_opt, _, _) => {
                drop(db_opt);
                None
            }
        }
    };

    if let Some((db, key, salt, prev_rv, expected_digest)) = taken {
        let bytes_res = db.serialize().map_err(|e| e.to_string());
        let write_res = match bytes_res {
            Ok(bytes) => {
                let dir_buf = dir.to_path_buf();
                tokio::task::spawn_blocking(move || {
                    vault::write_atomic_cas_with_hook(
                        &dir_buf,
                        &bytes,
                        &key,
                        &salt,
                        expected_digest,
                        before_rename,
                    )
                })
                .await
                .map_err(|e| e.to_string())
                .and_then(|r| r)
            }
            Err(e) => Err(e),
        };
        if let Err(e) = write_res {
            if e.contains("another LagosFile instance") {
                // Another instance modified the vault on disk; leave this stale session locked
                // in memory and clean up artifacts without overwriting the newer vault on disk.
                crate::cleanup_session_artifacts(dir, state);
                return Err(e);
            }
            // Restore in-memory session on ordinary write error so unsaved data isn't lost.
            publish_unlocked_state(dir, state, db, key, salt, prev_rv);
            return Err(e);
        }
    }

    crate::cleanup_session_artifacts(dir, state);
    Ok(())
}

pub async fn lock_db_in_dir(dir: &Path, state: &AppState) -> Result<(), String> {
    lock_db_in_dir_with_hook(dir, state, |_| Ok(())).await
}

#[tauri::command]
pub async fn lock_db(state: State<'_, AppState>) -> Result<(), String> {
    lock_db_in_dir(&db::app_dir(), &state).await
}

#[tauri::command]
pub async fn setup_recovery(
    question_1: String,
    question_2: String,
    question_3: String,
    answer_1: String,
    answer_2: String,
    answer_3: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let _io = state.vault_io_lock.lock().await;
    let db_key = {
        let key_guard = state.key.lock().unwrap();
        *key_guard.as_ref().ok_or("Database not unlocked")?
    };

    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let salt = security::generate_salt();
        let answers = vec![answer_1, answer_2, answer_3];
        let ak = answer_key(&answers, &salt);
        let blob = security::encrypt(&db_key, &ak).map_err(|e| e.to_string())?;
        let data = RecoveryData {
            question_1,
            question_2,
            question_3,
            answer_salt: hex::encode(salt),
            recovery_blob: hex::encode(&blob),
        };
        let json = serde_json::to_string(&data).map_err(|e| e.to_string())?;
        std::fs::write(recovery_path(), json).map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn check_recovery_setup() -> Result<bool, String> {
    Ok(tokio::fs::try_exists(recovery_path())
        .await
        .unwrap_or(false))
}

#[tauri::command]
pub async fn get_recovery_questions() -> Result<Vec<String>, String> {
    let json = tokio::fs::read_to_string(recovery_path())
        .await
        .map_err(|_| "No recovery data found. Have you set up security questions?".to_string())?;
    let data: RecoveryData = serde_json::from_str(&json).map_err(|e| e.to_string())?;
    Ok(vec![data.question_1, data.question_2, data.question_3])
}

fn recover_with_answers_sync<P, B>(
    dir: &Path,
    answers: &[String],
    on_progress: P,
    before_file: B,
) -> Result<UnlockedVaultTuple, String>
where
    P: FnMut(usize, usize, &str),
    B: FnMut(usize, &str) -> Result<(), String>,
{
    let json = std::fs::read_to_string(recovery_path_in_dir(dir))
        .map_err(|_| "No recovery data found.".to_string())?;
    let data: RecoveryData = serde_json::from_str(&json).map_err(|e| e.to_string())?;

    let ans_salt = hex::decode(&data.answer_salt).map_err(|e| e.to_string())?;
    let blob = hex::decode(&data.recovery_blob).map_err(|e| e.to_string())?;

    let ak = answer_key(answers, &ans_salt);

    let key_bytes = security::decrypt(&blob, &ak)
        .map_err(|_| "Incorrect answers. Please try again.".to_string())?;

    if key_bytes.len() != 32 {
        return Err("Recovery data is corrupt.".to_string());
    }
    let mut db_key = [0u8; 32];
    db_key.copy_from_slice(&key_bytes);

    let (db, salt, taxpayer) = decode_and_migrate_with_key(
        dir,
        db_key,
        "Recovery failed: could not decrypt database.",
        on_progress,
        before_file,
    )?;
    Ok((db, db_key, salt, taxpayer))
}

pub fn recover_with_answers_in_dir(
    dir: &Path,
    answers: &[String],
    state: &AppState,
) -> Result<Option<Taxpayer>, String> {
    let (db, db_key, salt, taxpayer) =
        recover_with_answers_sync(dir, answers, |_, _, _| {}, |_, _| Ok(()))?;
    publish_unlocked_state(dir, state, db, db_key, salt, true);
    Ok(taxpayer)
}

#[tauri::command]
pub async fn recover_with_answers(
    app: tauri::AppHandle,
    answer_1: String,
    answer_2: String,
    answer_3: String,
    state: State<'_, AppState>,
) -> Result<Option<Taxpayer>, String> {
    let _io = state.vault_io_lock.lock().await;
    let dir = db::app_dir();
    let dir_for_publish = dir.clone();
    let answers = vec![answer_1, answer_2, answer_3];
    let app_clone = app.clone();

    let (db, db_key, salt, taxpayer) = tokio::task::spawn_blocking(move || {
        recover_with_answers_sync(
            &dir,
            &answers,
            |completed, total, file_name| {
                let _ = app_clone.emit(
                    "doc-migration-progress",
                    serde_json::json!({
                        "completed": completed,
                        "total": total,
                        "fileName": file_name,
                    }),
                );
            },
            |_, _| Ok(()),
        )
    })
    .await
    .map_err(|e| e.to_string())??;

    publish_unlocked_state(&dir_for_publish, &state, db, db_key, salt, true);
    Ok(taxpayer)
}

pub fn reset_pin_with_deps<F>(
    dir: &Path,
    new_pin: &str,
    state: &AppState,
    keyring: &dyn BiometricKeyStore,
    before_rename: F,
) -> Result<bool, String>
where
    F: FnOnce(&Path) -> Result<(), String>,
{
    let (bytes, expected_digest) = {
        let db_guard = state.db.lock().unwrap();
        let digest_guard = state.vault_digest.lock().unwrap();
        let rv_guard = state.recovery_verified.lock().unwrap();
        if !*rv_guard {
            return Err(
                "PIN reset is only allowed immediately after account recovery.".to_string(),
            );
        }
        let db = db_guard.as_ref().ok_or("Database not unlocked")?;
        let bytes = db.serialize().map_err(|e| e.to_string())?;
        (bytes, *digest_guard)
    };

    let new_salt = security::generate_salt();
    let new_key = security::derive_key(new_pin, &new_salt);

    let new_digest = vault::write_atomic_cas_with_hook(
        dir,
        &bytes,
        &new_key,
        &new_salt,
        expected_digest,
        before_rename,
    )?;

    {
        let mut key_guard = state.key.lock().unwrap();
        let mut salt_guard = state.salt.lock().unwrap();
        let mut digest_guard = state.vault_digest.lock().unwrap();
        let mut rv_guard = state.recovery_verified.lock().unwrap();
        *key_guard = Some(new_key);
        *salt_guard = Some(new_salt);
        *digest_guard = Some(new_digest);
        *rv_guard = false;
    }

    let biometric_enabled = sync_biometric_keyring(keyring, &new_key);
    let _ = std::fs::remove_file(recovery_path_in_dir(dir));
    Ok(biometric_enabled)
}

pub fn reset_pin_in_dir(dir: &Path, new_pin: &str, state: &AppState) -> Result<bool, String> {
    reset_pin_with_deps(dir, new_pin, state, &OsKeyringStore, |_| Ok(()))
}

#[tauri::command]
pub async fn reset_pin(new_pin: String, state: State<'_, AppState>) -> Result<bool, String> {
    let _io = state.vault_io_lock.lock().await;
    let (bytes, expected_digest) = {
        let db_guard = state.db.lock().unwrap();
        let digest_guard = state.vault_digest.lock().unwrap();
        let rv_guard = state.recovery_verified.lock().unwrap();
        if !*rv_guard {
            return Err(
                "PIN reset is only allowed immediately after account recovery.".to_string(),
            );
        }
        let db = db_guard.as_ref().ok_or("Database not unlocked")?;
        let bytes = db.serialize().map_err(|e| e.to_string())?;
        (bytes, *digest_guard)
    };
    let dir = db::app_dir();
    let dir_clone = dir.clone();

    let (new_key, new_salt, new_digest, biometric_enabled) =
        tokio::task::spawn_blocking(move || -> Result<_, String> {
            let new_salt = security::generate_salt();
            let new_key = security::derive_key(&new_pin, &new_salt);
            let new_digest = vault::write_atomic_cas_with_hook(
                &dir_clone,
                &bytes,
                &new_key,
                &new_salt,
                expected_digest,
                |_| Ok(()),
            )?;
            let biometric_enabled = sync_biometric_keyring(&OsKeyringStore, &new_key);
            let _ = std::fs::remove_file(recovery_path_in_dir(&dir_clone));
            Ok((new_key, new_salt, new_digest, biometric_enabled))
        })
        .await
        .map_err(|e| e.to_string())??;

    {
        let mut key_guard = state.key.lock().unwrap();
        let mut salt_guard = state.salt.lock().unwrap();
        let mut digest_guard = state.vault_digest.lock().unwrap();
        let mut rv_guard = state.recovery_verified.lock().unwrap();
        *key_guard = Some(new_key);
        *salt_guard = Some(new_salt);
        *digest_guard = Some(new_digest);
        *rv_guard = false;
    }

    Ok(biometric_enabled)
}

pub fn change_pin_with_deps<F>(
    dir: &Path,
    current_pin: &str,
    new_pin: &str,
    state: &AppState,
    keyring: &dyn BiometricKeyStore,
    before_rename: F,
) -> Result<bool, String>
where
    F: FnOnce(&Path) -> Result<(), String>,
{
    // Canonical lock order: db -> key -> salt -> vault_digest
    let (bytes, active_key, current_salt, expected_digest) =
        snapshot_vault_state(state)?.ok_or_else(|| "Database not unlocked".to_string())?;

    let derived = security::derive_key(current_pin, &current_salt);
    if derived != active_key {
        return Err("Current PIN is incorrect.".to_string());
    }

    let new_salt = security::generate_salt();
    let new_key = security::derive_key(new_pin, &new_salt);

    let new_digest = vault::write_atomic_cas_with_hook(
        dir,
        &bytes,
        &new_key,
        &new_salt,
        expected_digest,
        before_rename,
    )?;

    {
        let mut key_guard = state.key.lock().unwrap();
        let mut salt_guard = state.salt.lock().unwrap();
        let mut digest_guard = state.vault_digest.lock().unwrap();
        let mut rv_guard = state.recovery_verified.lock().unwrap();
        *key_guard = Some(new_key);
        *salt_guard = Some(new_salt);
        *digest_guard = Some(new_digest);
        *rv_guard = false;
    }

    let biometric_enabled = sync_biometric_keyring(keyring, &new_key);
    let _ = std::fs::remove_file(recovery_path_in_dir(dir));
    Ok(biometric_enabled)
}

pub fn change_pin_in_dir(
    dir: &Path,
    current_pin: &str,
    new_pin: &str,
    state: &AppState,
) -> Result<bool, String> {
    change_pin_with_deps(
        dir,
        current_pin,
        new_pin,
        state,
        &OsKeyringStore,
        |_| Ok(()),
    )
}

pub async fn change_pin_in_dir_async(
    dir: std::path::PathBuf,
    current_pin: String,
    new_pin: String,
    state: &AppState,
    sync_os_keyring: bool,
) -> Result<bool, String> {
    let _io = state.vault_io_lock.lock().await;
    // Canonical lock order: db -> key -> salt -> vault_digest
    let (bytes, active_key, current_salt, expected_digest) =
        snapshot_vault_state(state)?.ok_or_else(|| "Database not unlocked".to_string())?;

    let (new_key, new_salt, new_digest, biometric_enabled) =
        tokio::task::spawn_blocking(move || -> Result<_, String> {
            let derived = security::derive_key(&current_pin, &current_salt);
            if derived != active_key {
                return Err("Current PIN is incorrect.".to_string());
            }
            let new_salt = security::generate_salt();
            let new_key = security::derive_key(&new_pin, &new_salt);
            let new_digest = vault::write_atomic_cas_with_hook(
                &dir,
                &bytes,
                &new_key,
                &new_salt,
                expected_digest,
                |_| Ok(()),
            )?;
            let biometric_enabled = if sync_os_keyring {
                sync_biometric_keyring(&OsKeyringStore, &new_key)
            } else {
                false
            };
            let _ = std::fs::remove_file(recovery_path_in_dir(&dir));
            Ok((new_key, new_salt, new_digest, biometric_enabled))
        })
        .await
        .map_err(|e| e.to_string())??;

    {
        let mut key_guard = state.key.lock().unwrap();
        let mut salt_guard = state.salt.lock().unwrap();
        let mut digest_guard = state.vault_digest.lock().unwrap();
        let mut rv_guard = state.recovery_verified.lock().unwrap();
        *key_guard = Some(new_key);
        *salt_guard = Some(new_salt);
        *digest_guard = Some(new_digest);
        *rv_guard = false;
    }

    Ok(biometric_enabled)
}

#[tauri::command]
pub async fn change_pin(
    current_pin: String,
    new_pin: String,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    change_pin_in_dir_async(db::app_dir(), current_pin, new_pin, &state, true).await
}

pub fn backup_db_to_path_in_dir(
    dir: &Path,
    dest_path: &Path,
    state: &AppState,
) -> Result<(), String> {
    let (bytes, key, salt, doc_key, doc_rows) = {
        let guard = state.db.lock().unwrap();
        let key_guard = state.key.lock().unwrap();
        let salt_guard = state.salt.lock().unwrap();
        let db = guard.as_ref().ok_or("Database not unlocked")?;
        let key = *key_guard.as_ref().ok_or("Database not unlocked")?;
        let salt = *salt_guard.as_ref().ok_or("Database not unlocked")?;
        // Collect doc refs first so any newly generated document_key is included in the serialized DB.
        let (doc_key, doc_rows) = doc_store::collect_backup_doc_refs(db)?;
        let bytes = db.serialize().map_err(|e| e.to_string())?;
        (bytes, key, salt, doc_key, doc_rows)
    };
    let docs = doc_store::read_backup_documents_from_refs(dir, doc_key, &doc_rows)?;
    let vault_bytes = vault::encode(&bytes, &key, &salt)?;
    let archive = doc_store::encode_backup_archive(&vault_bytes, &docs);
    doc_store::write_archive_to_path(dest_path, &archive)
}

pub fn backup_db_to_path(dest_path: &Path, state: &AppState) -> Result<(), String> {
    backup_db_to_path_in_dir(&db::app_dir(), dest_path, state)
}

#[tauri::command]
pub async fn backup_db(dest_path: String, state: State<'_, AppState>) -> Result<(), String> {
    let _io = state.vault_io_lock.lock().await;
    db::ensure_dirs().map_err(|e| e.to_string())?;
    let dir = db::app_dir();
    let (bytes, key, salt, doc_key, doc_rows) = {
        let guard = state.db.lock().unwrap();
        let key_guard = state.key.lock().unwrap();
        let salt_guard = state.salt.lock().unwrap();
        let db = guard.as_ref().ok_or("Database not unlocked")?;
        let key = *key_guard.as_ref().ok_or("Database not unlocked")?;
        let salt = *salt_guard.as_ref().ok_or("Database not unlocked")?;
        let (doc_key, doc_rows) = doc_store::collect_backup_doc_refs(db)?;
        let bytes = db.serialize().map_err(|e| e.to_string())?;
        (bytes, key, salt, doc_key, doc_rows)
    };
    tokio::task::spawn_blocking(move || {
        let docs = doc_store::read_backup_documents_from_refs(&dir, doc_key, &doc_rows)?;
        let vault_bytes = vault::encode(&bytes, &key, &salt)?;
        let archive = doc_store::encode_backup_archive(&vault_bytes, &docs);
        doc_store::write_archive_to_path(Path::new(&dest_path), &archive)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Core staged restore for Settings flow:
/// 1. Recovers any previously interrupted restore.
/// 2. Decodes & validates the backup, stages & verifies every referenced attachment inside
///    a staging directory (preserving matching local receipts for database-only backups without
///    mutating live files), and writes + fsyncs the staged vault.
/// 3. Executes a 2-phase journaled switch (`pre_commit` -> move docs -> `committing` -> move vault
///    -> `committed` -> cleanup) so a crash at any rename boundary recovers deterministically on
///    next startup with matching DB and documents.
fn restore_db_sync_with_hooks<F, P>(
    dir: &Path,
    src_path: &Path,
    backup_pin: &str,
    current_key: &[u8; 32],
    current_salt: &[u8; 16],
    before_doc: F,
    mut on_switch_phase: P,
) -> Result<(AppDb, Option<Taxpayer>), String>
where
    F: FnMut(usize, &str) -> Result<(), String>,
    P: FnMut(&str) -> Result<(), String>,
{
    recover_interrupted_restore(dir)?;

    let raw = std::fs::read(src_path).map_err(|e| e.to_string())?;
    let archive = doc_store::decode_backup_archive(&raw)?;
    let decoded = vault::decode_with_pin(archive.vault_bytes, backup_pin, Some(current_salt), None)
        .map_err(|_| {
            "Invalid backup — the PIN may be incorrect or the file is corrupt.".to_string()
        })?;

    let new_db = AppDb::open_in_memory().map_err(|e| e.to_string())?;
    new_db
        .load_from_bytes(&decoded.plaintext)
        .map_err(|e| format!("Backup database is corrupt: {}", e))?;

    // Stage and verify all documents (including decryption checks & DB-only local preservation)
    // before touching live vault or live documents/.
    let stage_name = format!(".restore_stage_{}", uuid::Uuid::new_v4());
    let stage_root = dir.join(&stage_name);
    let mut stage_guard = StageDirGuard::new(stage_root.clone());
    doc_store::prepare_staged_restore_documents(dir, &stage_root, &new_db, &archive, before_doc)?;

    let reserialized = new_db.serialize().map_err(|e| e.to_string())?;
    // Write and fsync the new encrypted vault inside stage_root before starting the switch.
    vault::write_atomic(&stage_root, &reserialized, current_key, current_salt)?;

    let live_docs = dir.join("documents");
    let staged_docs = stage_root.join("documents");
    let staged_vault = stage_root.join("lagosfile.db.enc");
    let had_live_docs = live_docs.exists();
    let prev_docs_name = if had_live_docs {
        Some(format!(".documents_prev_{}", uuid::Uuid::new_v4()))
    } else {
        None
    };

    let mut journal = RestoreJournal {
        phase: "pre_commit".to_string(),
        stage_dir: stage_name,
        prev_docs_dir: prev_docs_name.clone(),
    };
    write_restore_journal(dir, &journal)?;
    // Disarm automatic stage cleanup only AFTER the durable journal is on disk.
    stage_guard.disarm();

    let switch_res = (|| -> Result<(), String> {
        on_switch_phase("after_pre_commit_journal")?;

        if let Some(ref prev_name) = prev_docs_name {
            vault::rename_with_retry(&live_docs, &dir.join(prev_name))
                .map_err(|e| e.to_string())?;
        }
        on_switch_phase("after_move_old_docs")?;

        vault::rename_with_retry(&staged_docs, &live_docs).map_err(|e| e.to_string())?;
        on_switch_phase("after_move_new_docs")?;

        journal.phase = "committing".to_string();
        write_restore_journal(dir, &journal)?;
        on_switch_phase("after_committing_journal")?;

        vault::rename_with_retry(&staged_vault, &vault::vault_path(dir))
            .map_err(|e| e.to_string())?;
        on_switch_phase("after_replace_vault")?;

        // Once the vault rename has succeeded, a failure to write the final "committed" journal
        // is non-fatal (recover_interrupted_restore in "committing" will see staged_vault gone and clean up).
        journal.phase = "committed".to_string();
        let _ = write_restore_journal(dir, &journal);
        Ok(())
    })();

    if let Err(e) = switch_res {
        if e.starts_with("SIMULATED_CRASH:") {
            // Leave on-disk state exactly as it would be after an abrupt process exit so tests
            // can verify crash recovery on next startup.
            return Err(e);
        }
        // If recovery rolled forward (the restored vault and documents are now live on disk),
        // complete the restore in memory and return Ok so reported outcome, in-memory DB, and disk agree.
        let outcome = recover_interrupted_restore(dir).unwrap_or(RecoveryOutcome::RolledBack);
        if outcome != RecoveryOutcome::RolledForward {
            return Err(e);
        }
    } else {
        // Final cleanup via recover_interrupted_restore ("committed" phase).
        let _ = recover_interrupted_restore(dir);
    }

    let taxpayer = load_taxpayer(&new_db);
    Ok((new_db, taxpayer))
}

fn restore_db_sync<F>(
    dir: &Path,
    src_path: &Path,
    backup_pin: &str,
    current_key: &[u8; 32],
    current_salt: &[u8; 16],
    before_doc: F,
) -> Result<(AppDb, Option<Taxpayer>), String>
where
    F: FnMut(usize, &str) -> Result<(), String>,
{
    restore_db_sync_with_hooks(
        dir,
        src_path,
        backup_pin,
        current_key,
        current_salt,
        before_doc,
        |_| Ok(()),
    )
}

pub fn restore_db_in_dir_with_phase_hook<P>(
    dir: &Path,
    src_path: &Path,
    backup_pin: &str,
    state: &AppState,
    on_switch_phase: P,
) -> Result<Option<Taxpayer>, String>
where
    P: FnMut(&str) -> Result<(), String>,
{
    let (current_key, current_salt) = {
        let key_guard = state.key.lock().unwrap();
        let salt_guard = state.salt.lock().unwrap();
        let key = *key_guard.as_ref().ok_or("Database not unlocked")?;
        let salt = *salt_guard.as_ref().ok_or("Database not unlocked")?;
        (key, salt)
    };
    let (new_db, taxpayer) = restore_db_sync_with_hooks(
        dir,
        src_path,
        backup_pin,
        &current_key,
        &current_salt,
        |_, _| Ok(()),
        on_switch_phase,
    )?;

    let new_digest = vault::read_vault_digest(dir);
    {
        let mut db_guard = state.db.lock().unwrap();
        let mut digest_guard = state.vault_digest.lock().unwrap();
        let mut rv_guard = state.recovery_verified.lock().unwrap();
        *db_guard = Some(new_db);
        *digest_guard = new_digest;
        *rv_guard = false;
    }
    Ok(taxpayer)
}

pub fn restore_db_in_dir_with_hook<F>(
    dir: &Path,
    src_path: &Path,
    backup_pin: &str,
    state: &AppState,
    before_doc: F,
) -> Result<Option<Taxpayer>, String>
where
    F: FnMut(usize, &str) -> Result<(), String>,
{
    let (current_key, current_salt) = {
        let key_guard = state.key.lock().unwrap();
        let salt_guard = state.salt.lock().unwrap();
        let key = *key_guard.as_ref().ok_or("Database not unlocked")?;
        let salt = *salt_guard.as_ref().ok_or("Database not unlocked")?;
        (key, salt)
    };
    let (new_db, taxpayer) = restore_db_sync(
        dir,
        src_path,
        backup_pin,
        &current_key,
        &current_salt,
        before_doc,
    )?;

    let new_digest = vault::read_vault_digest(dir);
    {
        let mut db_guard = state.db.lock().unwrap();
        let mut digest_guard = state.vault_digest.lock().unwrap();
        let mut rv_guard = state.recovery_verified.lock().unwrap();
        *db_guard = Some(new_db);
        *digest_guard = new_digest;
        *rv_guard = false;
    }
    Ok(taxpayer)
}

/// Restores a backup (LGFA archive or standalone LGFV/legacy vault) into an already-unlocked vault (Settings flow).
pub fn restore_db_in_dir(
    dir: &Path,
    src_path: &Path,
    backup_pin: &str,
    state: &AppState,
) -> Result<Option<Taxpayer>, String> {
    restore_db_in_dir_with_hook(dir, src_path, backup_pin, state, |_, _| Ok(()))
}

#[tauri::command]
pub async fn restore_db(
    src_path: String,
    pin: String,
    state: State<'_, AppState>,
) -> Result<Option<Taxpayer>, String> {
    let _io = state.vault_io_lock.lock().await;
    let (current_key, current_salt) = {
        let key_guard = state.key.lock().unwrap();
        let salt_guard = state.salt.lock().unwrap();
        let key = *key_guard.as_ref().ok_or("Database not unlocked")?;
        let salt = *salt_guard.as_ref().ok_or("Database not unlocked")?;
        (key, salt)
    };
    let dir = db::app_dir();
    let dir_for_digest = dir.clone();

    let (new_db, taxpayer) = tokio::task::spawn_blocking(move || {
        restore_db_sync(
            &dir,
            Path::new(&src_path),
            &pin,
            &current_key,
            &current_salt,
            |_, _| Ok(()),
        )
    })
    .await
    .map_err(|e| e.to_string())??;

    let new_digest = vault::read_vault_digest(&dir_for_digest);
    {
        let mut db_guard = state.db.lock().unwrap();
        let mut digest_guard = state.vault_digest.lock().unwrap();
        let mut rv_guard = state.recovery_verified.lock().unwrap();
        *db_guard = Some(new_db);
        *digest_guard = new_digest;
        *rv_guard = false;
    }
    Ok(taxpayer)
}

fn restore_backup_fresh_sync<F>(
    dir: &Path,
    src_path: &Path,
    backup_pin: &str,
    before_doc: F,
) -> Result<UnlockedVaultTuple, String>
where
    F: FnMut(usize, &str) -> Result<(), String>,
{
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    recover_interrupted_restore(dir)?;

    if vault::vault_path(dir).exists() {
        return Err("A vault already exists. Please unlock with your PIN instead.".to_string());
    }

    let raw = std::fs::read(src_path).map_err(|e| e.to_string())?;
    let archive = doc_store::decode_backup_archive(&raw)?;
    let decoded =
        vault::decode_with_pin(archive.vault_bytes, backup_pin, None, None).map_err(|e| {
            if e.contains("older format") {
                e
            } else {
                "Invalid backup — the PIN may be incorrect or the file is corrupt.".to_string()
            }
        })?;

    let db = AppDb::open_in_memory().map_err(|e| e.to_string())?;
    db.load_from_bytes(&decoded.plaintext)
        .map_err(|e| format!("Backup database is corrupt: {}", e))?;

    // Stage and validate all documents BEFORE creating lagosfile.db.enc,
    // so a mid-unpack or attachment verification failure never leaves a vault file blocking retry.
    let stage_root = dir.join(format!(".restore_stage_{}", uuid::Uuid::new_v4()));
    let _stage_guard = StageDirGuard::new(stage_root.clone());
    doc_store::prepare_staged_restore_documents(dir, &stage_root, &db, &archive, before_doc)?;

    let reserialized = db.serialize().map_err(|e| e.to_string())?;

    // Move any pre-existing documents/ aside (instead of deleting it upfront) so local receipts
    // are restored if moving staged_docs or claiming lagosfile.db.enc fails.
    let staged_docs = stage_root.join("documents");
    let live_docs = dir.join("documents");
    let prev_docs = dir.join(format!(".documents_prev_{}", uuid::Uuid::new_v4()));
    let had_live_docs = live_docs.exists();
    if had_live_docs {
        vault::rename_with_retry(&live_docs, &prev_docs).map_err(|e| e.to_string())?;
    }
    if let Err(e) = vault::rename_with_retry(&staged_docs, &live_docs) {
        if had_live_docs && prev_docs.exists() {
            let _ = vault::rename_with_retry(&prev_docs, &live_docs);
        }
        return Err(e.to_string());
    }

    if let Err(e) = vault::write_new_exclusive(dir, &reserialized, &decoded.key, &decoded.salt) {
        let _ = std::fs::remove_dir_all(&live_docs);
        if had_live_docs && prev_docs.exists() {
            let _ = vault::rename_with_retry(&prev_docs, &live_docs);
        }
        return Err(e);
    }

    if had_live_docs && prev_docs.exists() {
        let _ = std::fs::remove_dir_all(&prev_docs);
    }

    let _ = std::fs::remove_file(recovery_path_in_dir(dir));
    let taxpayer = load_taxpayer(&db);
    Ok((db, decoded.key, decoded.salt, taxpayer))
}

pub fn restore_backup_fresh_in_dir_with_hook<F>(
    dir: &Path,
    src_path: &Path,
    backup_pin: &str,
    state: &AppState,
    before_doc: F,
) -> Result<Option<Taxpayer>, String>
where
    F: FnMut(usize, &str) -> Result<(), String>,
{
    let (db, key, salt, taxpayer) =
        restore_backup_fresh_sync(dir, src_path, backup_pin, before_doc)?;
    publish_unlocked_state(dir, state, db, key, salt, false);
    Ok(taxpayer)
}

/// Restores a self-describing backup (LGFA archive or standalone LGFV vault) on a fresh installation (`/setup-pin` flow).
pub fn restore_backup_fresh_in_dir(
    dir: &Path,
    src_path: &Path,
    backup_pin: &str,
    state: &AppState,
) -> Result<Option<Taxpayer>, String> {
    restore_backup_fresh_in_dir_with_hook(dir, src_path, backup_pin, state, |_, _| Ok(()))
}

#[tauri::command]
pub async fn restore_backup_fresh(
    src_path: String,
    pin: String,
    state: State<'_, AppState>,
) -> Result<Option<Taxpayer>, String> {
    let _io = state.vault_io_lock.lock().await;
    db::ensure_dirs().map_err(|e| e.to_string())?;
    let dir = db::app_dir();
    let dir_for_publish = dir.clone();

    let (db, key, salt, taxpayer) = tokio::task::spawn_blocking(move || {
        let res = restore_backup_fresh_sync(&dir, Path::new(&src_path), &pin, |_, _| Ok(()))?;
        OsKeyringStore.delete_key();
        Ok::<_, String>(res)
    })
    .await
    .map_err(|e| e.to_string())??;

    publish_unlocked_state(&dir_for_publish, &state, db, key, salt, false);
    Ok(taxpayer)
}
