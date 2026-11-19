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
pub async fn check_app_status() -> Result<AppStatus, String> {
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

#[tauri::command]
pub async fn enable_biometric(
    window: tauri::Window,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let key = {
        let key_guard = state.key.lock().unwrap();
        *key_guard.as_ref().ok_or("Database not unlocked")?
    };

    verify_biometric_internal(window).await?;

    let entry = Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| e.to_string())?;
    entry
        .set_password(&hex::encode(key))
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn disable_biometric() -> Result<(), String> {
    let entry = Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| e.to_string())?;
    let _ = entry.delete_password();
    Ok(())
}

pub fn unlock_with_biometric_key_in_dir(
    dir: &Path,
    db_key: [u8; 32],
    state: &AppState,
) -> Result<Option<Taxpayer>, String> {
    let raw = std::fs::read(vault::vault_path(dir)).map_err(|e| e.to_string())?;
    let legacy_salt_file = vault::legacy_salt_path(dir);
    let decoded = vault::decode_with_key(&raw, &db_key, Some(&legacy_salt_file))
        .map_err(|_| "Biometric unlock failed: could not decrypt database.".to_string())?;

    let db = AppDb::open_in_memory().map_err(|e| e.to_string())?;
    db.load_from_bytes(&decoded.plaintext)
        .map_err(|e| e.to_string())?;

    let taxpayer = load_taxpayer(&db);
    *state.db.lock().unwrap() = Some(db);
    *state.key.lock().unwrap() = Some(db_key);
    *state.salt.lock().unwrap() = Some(decoded.salt);
    *state.recovery_verified.lock().unwrap() = false;
    doc_store::migrate_plaintext_documents(dir, state)?;
    Ok(taxpayer)
}

#[tauri::command]
pub async fn unlock_with_biometric(
    app: tauri::AppHandle,
    window: tauri::Window,
    state: State<'_, AppState>,
) -> Result<Option<Taxpayer>, String> {
    let entry = Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| e.to_string())?;
    let password = entry
        .get_password()
        .map_err(|_| "Biometric login not enabled".to_string())?;
    let key_bytes = hex::decode(&password).map_err(|_| "Corrupt biometric data".to_string())?;

    if key_bytes.len() != 32 {
        return Err("Corrupt biometric data".to_string());
    }
    let mut db_key = [0u8; 32];
    db_key.copy_from_slice(&key_bytes);

    verify_biometric_internal(window).await?;
    let dir = db::app_dir();
    let raw = std::fs::read(vault::vault_path(&dir)).map_err(|e| e.to_string())?;
    let legacy_salt_file = vault::legacy_salt_path(&dir);
    let decoded = vault::decode_with_key(&raw, &db_key, Some(&legacy_salt_file))
        .map_err(|_| "Biometric unlock failed: could not decrypt database.".to_string())?;

    let db = AppDb::open_in_memory().map_err(|e| e.to_string())?;
    db.load_from_bytes(&decoded.plaintext)
        .map_err(|e| e.to_string())?;

    let taxpayer = load_taxpayer(&db);
    *state.db.lock().unwrap() = Some(db);
    *state.key.lock().unwrap() = Some(db_key);
    *state.salt.lock().unwrap() = Some(decoded.salt);
    *state.recovery_verified.lock().unwrap() = false;
    run_doc_migration_with_events(&dir, &state, &app)?;
    Ok(taxpayer)
}

fn run_doc_migration_with_events(
    dir: &Path,
    state: &AppState,
    app: &tauri::AppHandle,
) -> Result<(), String> {
    doc_store::migrate_plaintext_documents_with_hook(
        dir,
        state,
        |completed, total, file_name| {
            let _ = app.emit(
                "doc-migration-progress",
                serde_json::json!({
                    "completed": completed,
                    "total": total,
                    "fileName": file_name,
                }),
            );
        },
        |_, _| Ok(()),
    )?;
    Ok(())
}

pub fn setup_pin_in_dir(dir: &Path, pin: &str, state: &AppState) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(dir.join("documents")).map_err(|e| e.to_string())?;

    if vault::vault_path(dir).exists() {
        return Err("A vault already exists. Please unlock with your PIN instead.".to_string());
    }

    let salt = security::generate_salt();
    let new_db = AppDb::open_in_memory().map_err(|e| e.to_string())?;
    let bytes = new_db.serialize().map_err(|e| e.to_string())?;
    let key = security::derive_key(pin, &salt);

    vault::write_new_exclusive(dir, &bytes, &key, &salt)?;

    *state.db.lock().unwrap() = Some(new_db);
    *state.key.lock().unwrap() = Some(key);
    *state.salt.lock().unwrap() = Some(salt);
    *state.recovery_verified.lock().unwrap() = false;
    Ok(())
}

#[tauri::command]
pub async fn setup_pin(pin: String, state: State<'_, AppState>) -> Result<(), String> {
    db::ensure_dirs().map_err(|e| e.to_string())?;
    setup_pin_in_dir(&db::app_dir(), &pin, &state)
}

pub fn unlock_db_in_dir(
    dir: &Path,
    pin: &str,
    state: &AppState,
) -> Result<Option<Taxpayer>, String> {
    let raw = std::fs::read(vault::vault_path(dir)).map_err(|e| e.to_string())?;
    let legacy_salt_file = vault::legacy_salt_path(dir);
    let decoded = vault::decode_with_pin(&raw, pin, None, Some(&legacy_salt_file))?;

    let db = AppDb::open_in_memory().map_err(|e| e.to_string())?;
    db.load_from_bytes(&decoded.plaintext)
        .map_err(|e| e.to_string())?;

    let taxpayer = load_taxpayer(&db);
    *state.db.lock().unwrap() = Some(db);
    *state.key.lock().unwrap() = Some(decoded.key);
    *state.salt.lock().unwrap() = Some(decoded.salt);
    *state.recovery_verified.lock().unwrap() = false;
    doc_store::migrate_plaintext_documents(dir, state)?;
    Ok(taxpayer)
}

#[tauri::command]
pub async fn unlock_db(
    app: tauri::AppHandle,
    pin: String,
    state: State<'_, AppState>,
) -> Result<Option<Taxpayer>, String> {
    db::ensure_dirs().map_err(|e| e.to_string())?;
    let dir = db::app_dir();
    let raw = std::fs::read(vault::vault_path(&dir)).map_err(|e| e.to_string())?;
    let legacy_salt_file = vault::legacy_salt_path(&dir);
    let decoded = vault::decode_with_pin(&raw, &pin, None, Some(&legacy_salt_file))?;

    let db = AppDb::open_in_memory().map_err(|e| e.to_string())?;
    db.load_from_bytes(&decoded.plaintext)
        .map_err(|e| e.to_string())?;

    let taxpayer = load_taxpayer(&db);
    *state.db.lock().unwrap() = Some(db);
    *state.key.lock().unwrap() = Some(decoded.key);
    *state.salt.lock().unwrap() = Some(decoded.salt);
    *state.recovery_verified.lock().unwrap() = false;
    run_doc_migration_with_events(&dir, &state, &app)?;
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
    let guard = state.db.lock().unwrap();
    let key_guard = state.key.lock().unwrap();
    let salt_guard = state.salt.lock().unwrap();
    if let (Some(db), Some(key), Some(salt)) =
        (guard.as_ref(), key_guard.as_ref(), salt_guard.as_ref())
    {
        let bytes = db.serialize().map_err(|e| e.to_string())?;
        vault::write_atomic_with_hook(dir, &bytes, key, salt, before_rename)?;
    }
    Ok(())
}

pub fn persist_db_in_dir(dir: &Path, state: &AppState) -> Result<(), String> {
    persist_db_in_dir_with_hook(dir, state, |_| Ok(()))
}

pub async fn persist_db(state: &AppState) -> Result<(), String> {
    persist_db_in_dir(&db::app_dir(), state)
}

pub async fn lock_db_in_dir(dir: &Path, state: &AppState) -> Result<(), String> {
    persist_db_in_dir(dir, state)?;
    crate::commands::lirs::stop_bridge(state);
    doc_store::cleanup_temp_previews(state);
    let _ = std::fs::remove_file(dir.join("pending_filing.json"));
    *state.db.lock().unwrap() = None;
    *state.key.lock().unwrap() = None;
    *state.salt.lock().unwrap() = None;
    *state.recovery_verified.lock().unwrap() = false;
    Ok(())
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
    let key_guard = state.key.lock().unwrap();
    let db_key = key_guard.as_ref().ok_or("Database not unlocked")?;

    let salt = security::generate_salt();
    let answers = vec![answer_1, answer_2, answer_3];
    let ak = answer_key(&answers, &salt);

    let blob = security::encrypt(db_key, &ak).map_err(|e| e.to_string())?;

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
}

#[tauri::command]
pub async fn check_recovery_setup() -> Result<bool, String> {
    Ok(recovery_path().exists())
}

#[tauri::command]
pub async fn get_recovery_questions() -> Result<Vec<String>, String> {
    let json = std::fs::read_to_string(recovery_path())
        .map_err(|_| "No recovery data found. Have you set up security questions?".to_string())?;
    let data: RecoveryData = serde_json::from_str(&json).map_err(|e| e.to_string())?;
    Ok(vec![data.question_1, data.question_2, data.question_3])
}

pub fn recover_with_answers_in_dir(
    dir: &Path,
    answers: &[String],
    state: &AppState,
) -> Result<Option<Taxpayer>, String> {
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

    let raw = std::fs::read(vault::vault_path(dir)).map_err(|e| e.to_string())?;
    let legacy_salt_file = vault::legacy_salt_path(dir);
    let decoded = vault::decode_with_key(&raw, &db_key, Some(&legacy_salt_file))
        .map_err(|_| "Recovery failed: could not decrypt database.".to_string())?;

    let db = AppDb::open_in_memory().map_err(|e| e.to_string())?;
    db.load_from_bytes(&decoded.plaintext)
        .map_err(|e| e.to_string())?;

    let taxpayer = load_taxpayer(&db);
    *state.db.lock().unwrap() = Some(db);
    *state.key.lock().unwrap() = Some(db_key);
    *state.salt.lock().unwrap() = Some(decoded.salt);
    *state.recovery_verified.lock().unwrap() = true;
    doc_store::migrate_plaintext_documents(dir, state)?;
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
    let dir = db::app_dir();
    let tp = recover_with_answers_in_dir(&dir, &[answer_1, answer_2, answer_3], &state)?;
    run_doc_migration_with_events(&dir, &state, &app)?;
    Ok(tp)
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
    if !*state.recovery_verified.lock().unwrap() {
        return Err("PIN reset is only allowed immediately after account recovery.".to_string());
    }

    let bytes = {
        let guard = state.db.lock().unwrap();
        let db = guard.as_ref().ok_or("Database not unlocked")?;
        db.serialize().map_err(|e| e.to_string())?
    };

    let new_salt = security::generate_salt();
    let new_key = security::derive_key(new_pin, &new_salt);

    vault::write_atomic_with_hook(dir, &bytes, &new_key, &new_salt, before_rename)?;

    *state.key.lock().unwrap() = Some(new_key);
    *state.salt.lock().unwrap() = Some(new_salt);
    *state.recovery_verified.lock().unwrap() = false;

    let biometric_enabled = sync_biometric_keyring(keyring, &new_key);
    let _ = std::fs::remove_file(recovery_path_in_dir(dir));
    Ok(biometric_enabled)
}

pub fn reset_pin_in_dir(dir: &Path, new_pin: &str, state: &AppState) -> Result<bool, String> {
    reset_pin_with_deps(dir, new_pin, state, &OsKeyringStore, |_| Ok(()))
}

#[tauri::command]
pub async fn reset_pin(new_pin: String, state: State<'_, AppState>) -> Result<bool, String> {
    reset_pin_in_dir(&db::app_dir(), &new_pin, &state)
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
    let current_salt = {
        let salt_guard = state.salt.lock().unwrap();
        *salt_guard.as_ref().ok_or("Database not unlocked")?
    };
    let derived = security::derive_key(current_pin, &current_salt);
    {
        let key_guard = state.key.lock().unwrap();
        let active = key_guard.as_ref().ok_or("Database not unlocked")?;
        if derived != *active {
            return Err("Current PIN is incorrect.".to_string());
        }
    }

    let bytes = {
        let guard = state.db.lock().unwrap();
        let db = guard.as_ref().ok_or("Database not unlocked")?;
        db.serialize().map_err(|e| e.to_string())?
    };

    let new_salt = security::generate_salt();
    let new_key = security::derive_key(new_pin, &new_salt);

    vault::write_atomic_with_hook(dir, &bytes, &new_key, &new_salt, before_rename)?;

    *state.key.lock().unwrap() = Some(new_key);
    *state.salt.lock().unwrap() = Some(new_salt);

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
    change_pin_with_deps(dir, current_pin, new_pin, state, &OsKeyringStore, |_| Ok(()))
}

#[tauri::command]
pub async fn change_pin(
    current_pin: String,
    new_pin: String,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    change_pin_in_dir(&db::app_dir(), &current_pin, &new_pin, &state)
}

pub fn backup_db_to_path_in_dir(
    dir: &Path,
    dest_path: &Path,
    state: &AppState,
) -> Result<(), String> {
    let guard = state.db.lock().unwrap();
    let key_guard = state.key.lock().unwrap();
    let salt_guard = state.salt.lock().unwrap();
    let db = guard.as_ref().ok_or("Database not unlocked")?;
    let key = key_guard.as_ref().ok_or("Database not unlocked")?;
    let salt = salt_guard.as_ref().ok_or("Database not unlocked")?;

    // Collect documents first so any newly generated document_key is included in the serialized DB.
    let docs = doc_store::collect_backup_documents(dir, db)?;
    let bytes = db.serialize().map_err(|e| e.to_string())?;
    let vault_bytes = vault::encode(&bytes, key, salt)?;
    let archive = doc_store::encode_backup_archive(&vault_bytes, &docs);
    doc_store::write_archive_to_path(dest_path, &archive)
}

pub fn backup_db_to_path(dest_path: &Path, state: &AppState) -> Result<(), String> {
    backup_db_to_path_in_dir(&db::app_dir(), dest_path, state)
}

#[tauri::command]
pub async fn backup_db(dest_path: String, state: State<'_, AppState>) -> Result<(), String> {
    db::ensure_dirs().map_err(|e| e.to_string())?;
    backup_db_to_path_in_dir(&db::app_dir(), Path::new(&dest_path), &state)
}

/// Restores a backup (LGFA archive or standalone LGFV/legacy vault) into an already-unlocked vault (Settings flow).
/// Decrypts the backup using its own embedded salt (or the current vault's salt for legacy backups)
/// and `backup_pin`, then re-encrypts the restored database with the current vault's active key & salt
/// and unpacks any bundled encrypted documents.
pub fn restore_db_in_dir(
    dir: &Path,
    src_path: &Path,
    backup_pin: &str,
    state: &AppState,
) -> Result<Option<Taxpayer>, String> {
    let current_key = {
        let key_guard = state.key.lock().unwrap();
        *key_guard.as_ref().ok_or("Database not unlocked")?
    };
    let current_salt = {
        let salt_guard = state.salt.lock().unwrap();
        *salt_guard.as_ref().ok_or("Database not unlocked")?
    };

    let raw = std::fs::read(src_path).map_err(|e| e.to_string())?;
    let archive = doc_store::decode_backup_archive(&raw)?;
    let decoded = vault::decode_with_pin(archive.vault_bytes, backup_pin, Some(&current_salt), None)
        .map_err(|_| {
            "Invalid backup — the PIN may be incorrect or the file is corrupt.".to_string()
        })?;

    let new_db = AppDb::open_in_memory().map_err(|e| e.to_string())?;
    new_db
        .load_from_bytes(&decoded.plaintext)
        .map_err(|e| format!("Backup database is corrupt: {}", e))?;

    let reserialized = new_db.serialize().map_err(|e| e.to_string())?;
    vault::write_atomic(dir, &reserialized, &current_key, &current_salt)?;
    doc_store::unpack_backup_documents(dir, &archive.documents)?;

    let taxpayer = load_taxpayer(&new_db);
    *state.db.lock().unwrap() = Some(new_db);
    Ok(taxpayer)
}

#[tauri::command]
pub async fn restore_db(
    src_path: String,
    pin: String,
    state: State<'_, AppState>,
) -> Result<Option<Taxpayer>, String> {
    restore_db_in_dir(&db::app_dir(), Path::new(&src_path), &pin, &state)
}

/// Restores a self-describing backup (LGFA archive or standalone LGFV vault) on a fresh installation (`/setup-pin` flow).
/// Derives the key from the backup's own salt + `backup_pin`, installs it as the live vault
/// (refusing to overwrite an existing vault), unpacks bundled encrypted documents, and unlocks the session.
pub fn restore_backup_fresh_in_dir(
    dir: &Path,
    src_path: &Path,
    backup_pin: &str,
    state: &AppState,
) -> Result<Option<Taxpayer>, String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(dir.join("documents")).map_err(|e| e.to_string())?;

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

    let reserialized = db.serialize().map_err(|e| e.to_string())?;
    vault::write_new_exclusive(dir, &reserialized, &decoded.key, &decoded.salt)?;
    doc_store::unpack_backup_documents(dir, &archive.documents)?;

    let taxpayer = load_taxpayer(&db);
    *state.db.lock().unwrap() = Some(db);
    *state.key.lock().unwrap() = Some(decoded.key);
    *state.salt.lock().unwrap() = Some(decoded.salt);
    *state.recovery_verified.lock().unwrap() = false;
    Ok(taxpayer)
}

#[tauri::command]
pub async fn restore_backup_fresh(
    src_path: String,
    pin: String,
    state: State<'_, AppState>,
) -> Result<Option<Taxpayer>, String> {
    db::ensure_dirs().map_err(|e| e.to_string())?;
    restore_backup_fresh_in_dir(&db::app_dir(), Path::new(&src_path), &pin, &state)
}
