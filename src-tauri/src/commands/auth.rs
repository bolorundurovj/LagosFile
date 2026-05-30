use crate::{
    db::{self, AppDb},
    models::{AppStatus, Taxpayer},
    services::security,
    AppState,
};
use keyring::Entry;
use serde::{Deserialize, Serialize};
use tauri::State;

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

fn recovery_path() -> std::path::PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    home.join("LagosFile").join(".recovery")
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
            Ok(Taxpayer {
                id: uuid::Uuid::parse_str(&row.get::<_, String>(0)?)
                    .unwrap_or_else(|_| uuid::Uuid::new_v4()),
                full_name: row.get(1)?,
                tin: row.get(2)?,
                address: row.get(3)?,
                phone: row.get(4)?,
                email: row.get(5)?,
                filing_agent: row.get(6)?,
                created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(7)?)
                    .unwrap()
                    .with_timezone(&chrono::Utc),
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

#[tauri::command]
pub async fn unlock_with_biometric(
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

    let encrypted = std::fs::read(db::db_path()).map_err(|e| e.to_string())?;
    let plaintext = security::decrypt(&encrypted, &db_key)
        .map_err(|_| "Biometric unlock failed: could not decrypt database.".to_string())?;

    let db = AppDb::open_in_memory().map_err(|e| e.to_string())?;
    db.load_from_bytes(&plaintext).map_err(|e| e.to_string())?;

    let taxpayer = load_taxpayer(&db);
    *state.db.lock().unwrap() = Some(db);
    *state.key.lock().unwrap() = Some(db_key);
    Ok(taxpayer)
}

#[tauri::command]
pub async fn setup_pin(pin: String, state: State<'_, AppState>) -> Result<(), String> {
    db::ensure_dirs().map_err(|e| e.to_string())?;
    let salt = security::generate_salt();
    std::fs::write(db::salt_path(), salt).map_err(|e| e.to_string())?;

    let new_db = AppDb::open_in_memory().map_err(|e| e.to_string())?;
    let bytes = new_db.serialize().map_err(|e| e.to_string())?;
    let key = security::derive_key(&pin, &salt);
    let encrypted = security::encrypt(&bytes, &key).map_err(|e| e.to_string())?;
    std::fs::write(db::db_path(), &encrypted).map_err(|e| e.to_string())?;

    *state.db.lock().unwrap() = Some(new_db);
    *state.key.lock().unwrap() = Some(key);
    Ok(())
}

#[tauri::command]
pub async fn unlock_db(
    pin: String,
    state: State<'_, AppState>,
) -> Result<Option<Taxpayer>, String> {
    db::ensure_dirs().map_err(|e| e.to_string())?;
    let salt = std::fs::read(db::salt_path()).map_err(|_| "Salt file not found".to_string())?;
    let key = security::derive_key(&pin, &salt);

    let encrypted = std::fs::read(db::db_path()).map_err(|e| e.to_string())?;
    let plaintext = security::decrypt(&encrypted, &key)
        .map_err(|_| "Incorrect PIN. Please try again.".to_string())?;

    let db = AppDb::open_in_memory().map_err(|e| e.to_string())?;
    db.load_from_bytes(&plaintext).map_err(|e| e.to_string())?;

    let taxpayer = load_taxpayer(&db);
    *state.db.lock().unwrap() = Some(db);
    *state.key.lock().unwrap() = Some(key);
    Ok(taxpayer)
}

#[tauri::command]
pub async fn lock_db(state: State<'_, AppState>) -> Result<(), String> {
    persist_db(&state).await?;
    *state.db.lock().unwrap() = None;
    *state.key.lock().unwrap() = None;
    Ok(())
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

#[tauri::command]
pub async fn recover_with_answers(
    answer_1: String,
    answer_2: String,
    answer_3: String,
    state: State<'_, AppState>,
) -> Result<Option<Taxpayer>, String> {
    let json = std::fs::read_to_string(recovery_path())
        .map_err(|_| "No recovery data found.".to_string())?;
    let data: RecoveryData = serde_json::from_str(&json).map_err(|e| e.to_string())?;

    let salt = hex::decode(&data.answer_salt).map_err(|e| e.to_string())?;
    let blob = hex::decode(&data.recovery_blob).map_err(|e| e.to_string())?;

    let answers = vec![answer_1, answer_2, answer_3];
    let ak = answer_key(&answers, &salt);

    let key_bytes = security::decrypt(&blob, &ak)
        .map_err(|_| "Incorrect answers. Please try again.".to_string())?;

    if key_bytes.len() != 32 {
        return Err("Recovery data is corrupt.".to_string());
    }
    let mut db_key = [0u8; 32];
    db_key.copy_from_slice(&key_bytes);

    let encrypted = std::fs::read(db::db_path()).map_err(|e| e.to_string())?;
    let plaintext = security::decrypt(&encrypted, &db_key)
        .map_err(|_| "Recovery failed: could not decrypt database.".to_string())?;

    let db = AppDb::open_in_memory().map_err(|e| e.to_string())?;
    db.load_from_bytes(&plaintext).map_err(|e| e.to_string())?;

    let taxpayer = load_taxpayer(&db);
    *state.db.lock().unwrap() = Some(db);
    *state.key.lock().unwrap() = Some(db_key);
    Ok(taxpayer)
}

#[tauri::command]
pub async fn reset_pin(new_pin: String, state: State<'_, AppState>) -> Result<(), String> {
    let new_salt = security::generate_salt();
    std::fs::write(db::salt_path(), new_salt).map_err(|e| e.to_string())?;

    let new_key = security::derive_key(&new_pin, &new_salt);

    {
        let guard = state.db.lock().unwrap();
        let db = guard.as_ref().ok_or("Database not unlocked")?;
        let bytes = db.serialize().map_err(|e| e.to_string())?;
        let encrypted = security::encrypt(&bytes, &new_key).map_err(|e| e.to_string())?;
        let tmp = db::db_path().with_extension("enc.tmp");
        std::fs::write(&tmp, &encrypted).map_err(|e| e.to_string())?;
        std::fs::rename(&tmp, db::db_path()).map_err(|e| e.to_string())?;
    }

    *state.key.lock().unwrap() = Some(new_key);

    let _ = std::fs::remove_file(recovery_path());

    Ok(())
}

#[tauri::command]
pub async fn change_pin(
    current_pin: String,
    new_pin: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let salt = std::fs::read(db::salt_path()).map_err(|e| e.to_string())?;
    let derived = security::derive_key(&current_pin, &salt);
    {
        let key_guard = state.key.lock().unwrap();
        let active = key_guard.as_ref().ok_or("Database not unlocked")?;
        if derived != *active {
            return Err("Current PIN is incorrect.".to_string());
        }
    }

    let new_salt = security::generate_salt();
    let new_key = security::derive_key(&new_pin, &new_salt);

    {
        let guard = state.db.lock().unwrap();
        let db = guard.as_ref().ok_or("Database not unlocked")?;
        let bytes = db.serialize().map_err(|e| e.to_string())?;
        let encrypted = security::encrypt(&bytes, &new_key).map_err(|e| e.to_string())?;
        let tmp = db::db_path().with_extension("enc.tmp");
        std::fs::write(&tmp, &encrypted).map_err(|e| e.to_string())?;
        std::fs::rename(&tmp, db::db_path()).map_err(|e| e.to_string())?;
    }

    std::fs::write(db::salt_path(), new_salt).map_err(|e| e.to_string())?;

    *state.key.lock().unwrap() = Some(new_key);

    let _ = std::fs::remove_file(recovery_path());

    Ok(())
}

#[tauri::command]
pub async fn backup_db(dest_path: String, state: State<'_, AppState>) -> Result<(), String> {
    {
        let guard = state.db.lock().unwrap();
        guard.as_ref().ok_or("Database not unlocked")?;
    }
    db::ensure_dirs().map_err(|e| e.to_string())?;
    std::fs::copy(db::db_path(), &dest_path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn restore_db(src_path: String, state: State<'_, AppState>) -> Result<(), String> {
    let encrypted = std::fs::read(&src_path).map_err(|e| e.to_string())?;

    let bytes = {
        let key_guard = state.key.lock().unwrap();
        let key = key_guard.as_ref().ok_or("Database not unlocked")?;
        security::decrypt(&encrypted, key).map_err(|_| {
            "Invalid backup — it may have been created with a different PIN or is corrupt."
                .to_string()
        })?
    };

    let new_db = AppDb::open_in_memory().map_err(|e| e.to_string())?;
    new_db.load_from_bytes(&bytes).map_err(|e| e.to_string())?;

    let tmp = db::db_path().with_extension("enc.tmp");
    std::fs::write(&tmp, &encrypted).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, db::db_path()).map_err(|e| e.to_string())?;

    *state.db.lock().unwrap() = Some(new_db);

    Ok(())
}

pub async fn persist_db(state: &AppState) -> Result<(), String> {
    let guard = state.db.lock().unwrap();
    let key_guard = state.key.lock().unwrap();
    if let (Some(db), Some(key)) = (guard.as_ref(), key_guard.as_ref()) {
        let bytes = db.serialize().map_err(|e| e.to_string())?;
        let encrypted = security::encrypt(&bytes, key).map_err(|e| e.to_string())?;
        let tmp = db::db_path().with_extension("enc.tmp");
        std::fs::write(&tmp, &encrypted).map_err(|e| e.to_string())?;
        std::fs::rename(&tmp, db::db_path()).map_err(|e| e.to_string())?;
    }
    Ok(())
}
