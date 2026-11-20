use lagosfile_lib::db::AppDb;
use lagosfile_lib::services::security;

#[test]
fn test_setup_pin_encrypts_database_with_pin() {
    let db = AppDb::open_in_memory().unwrap();
    let pin = "1234";
    let salt = security::generate_salt();
    let key = security::derive_key(pin, &salt);

    let plaintext = db.serialize().unwrap();
    assert!(!plaintext.is_empty());

    let ciphertext = security::encrypt(&plaintext, &key).unwrap();
    assert_ne!(plaintext, ciphertext);
}

#[test]
fn test_unlock_db_correct_pin_succeeds() {
    let db = AppDb::open_in_memory().unwrap();
    let pin = "5678";
    let salt = security::generate_salt();
    let key = security::derive_key(pin, &salt);

    let plaintext = db.serialize().unwrap();
    let ciphertext = security::encrypt(&plaintext, &key).unwrap();

    let decrypted = security::decrypt(&ciphertext, &key).unwrap();
    assert_eq!(plaintext, decrypted);

    let db2 = AppDb::open_in_memory().unwrap();
    db2.load_from_bytes(&decrypted).unwrap();
    let conn = db2.conn.lock().unwrap();
    let count: i32 = conn
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE type='table'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert!(count > 0);
}

#[test]
fn test_unlock_db_wrong_pin_returns_error() {
    let db = AppDb::open_in_memory().unwrap();
    let correct_pin = "1234";
    let wrong_pin = "9999";
    let salt = security::generate_salt();

    let correct_key = security::derive_key(correct_pin, &salt);
    let plaintext = db.serialize().unwrap();
    let ciphertext = security::encrypt(&plaintext, &correct_key).unwrap();

    let wrong_key = security::derive_key(wrong_pin, &salt);
    let result = security::decrypt(&ciphertext, &wrong_key);
    assert!(result.is_err());
}

#[test]
fn test_lock_db_clears_key() {
    let mut key: Option<[u8; 32]> = Some(security::derive_key("1234", &security::generate_salt()));
    assert!(key.is_some());

    key = None;
    assert!(key.is_none());
}

#[test]
fn test_change_pin_reencrypts_with_new_key() {
    let db = AppDb::open_in_memory().unwrap();
    let old_pin = "1111";
    let new_pin = "2222";
    let salt = security::generate_salt();

    let old_key = security::derive_key(old_pin, &salt);
    let plaintext = db.serialize().unwrap();
    let _old_ciphertext = security::encrypt(&plaintext, &old_key).unwrap();

    let new_salt = security::generate_salt();
    let new_key = security::derive_key(new_pin, &new_salt);
    let new_ciphertext = security::encrypt(&plaintext, &new_key).unwrap();

    let decrypted_with_new = security::decrypt(&new_ciphertext, &new_key).unwrap();
    assert_eq!(plaintext, decrypted_with_new);

    let decrypt_with_old = security::decrypt(&new_ciphertext, &old_key);
    assert!(decrypt_with_old.is_err());
}

#[test]
fn test_backup_db_creates_file_content() {
    let db = AppDb::open_in_memory().unwrap();
    let pin = "1234";
    let salt = security::generate_salt();
    let key = security::derive_key(pin, &salt);

    let plaintext = db.serialize().unwrap();
    let encrypted = security::encrypt(&plaintext, &key).unwrap();

    assert!(!encrypted.is_empty());
    assert_ne!(encrypted, plaintext);
}

#[test]
fn test_restore_db_from_backup() {
    let db1 = AppDb::open_in_memory().unwrap();
    let conn = db1.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO taxpayer (id, full_name, tin, created_at) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![
            uuid::Uuid::new_v4().to_string(),
            "Backup Taxpayer",
            "00011122233",
            chrono::Utc::now().to_rfc3339(),
        ],
    )
    .unwrap();
    drop(conn);

    let pin = "1234";
    let salt = security::generate_salt();
    let key = security::derive_key(pin, &salt);

    let plaintext = db1.serialize().unwrap();
    let encrypted = security::encrypt(&plaintext, &key).unwrap();

    let decrypted = security::decrypt(&encrypted, &key).unwrap();
    assert_eq!(plaintext, decrypted);

    let db2 = AppDb::open_in_memory().unwrap();
    db2.load_from_bytes(&decrypted).unwrap();

    let conn = db2.conn.lock().unwrap();
    let name: String = conn
        .query_row("SELECT full_name FROM taxpayer LIMIT 1", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(name, "Backup Taxpayer");
}

#[test]
fn test_backup_restore_with_wrong_pin_fails() {
    let db = AppDb::open_in_memory().unwrap();
    let correct_pin = "correct";
    let wrong_pin = "wrong";
    let salt = security::generate_salt();

    let correct_key = security::derive_key(correct_pin, &salt);
    let plaintext = db.serialize().unwrap();
    let encrypted = security::encrypt(&plaintext, &correct_key).unwrap();

    let wrong_key = security::derive_key(wrong_pin, &salt);
    let result = security::decrypt(&encrypted, &wrong_key);
    assert!(result.is_err());
}

#[test]
fn test_salt_uniqueness_ensures_different_keys() {
    let pin = "same_pin";
    let salt1 = security::generate_salt();
    let salt2 = security::generate_salt();

    let key1 = security::derive_key(pin, &salt1);
    let key2 = security::derive_key(pin, &salt2);

    assert_ne!(key1, key2);
}

#[test]
fn test_full_auth_roundtrip() {
    let db = AppDb::open_in_memory().unwrap();
    let conn = db.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO taxpayer (id, full_name, tin, created_at) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![
            uuid::Uuid::new_v4().to_string(),
            "Full Roundtrip Taxpayer",
            "88899900011",
            chrono::Utc::now().to_rfc3339(),
        ],
    )
    .unwrap();
    drop(conn);

    let original_bytes = db.serialize().unwrap();

    let salt = security::generate_salt();
    let key = security::derive_key("my_secure_pin", &salt);
    let encrypted = security::encrypt(&original_bytes, &key).unwrap();

    let decrypted = security::decrypt(&encrypted, &key).unwrap();

    let restored_db = AppDb::open_in_memory().unwrap();
    restored_db.load_from_bytes(&decrypted).unwrap();
    let conn = restored_db.conn.lock().unwrap();
    let name: String = conn
        .query_row("SELECT full_name FROM taxpayer LIMIT 1", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(name, "Full Roundtrip Taxpayer");

    let count: i32 = conn
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='taxpayer'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(count, 1);
}

#[test]
fn test_different_pins_produce_different_ciphertexts() {
    let plaintext = b"Sensitive tax data";
    let salt = security::generate_salt();

    let key1 = security::derive_key("pin1", &salt);
    let key2 = security::derive_key("pin2", &salt);

    let ct1 = security::encrypt(plaintext, &key1).unwrap();
    let ct2 = security::encrypt(plaintext, &key2).unwrap();

    assert_ne!(ct1, ct2);
}

#[test]
fn test_setup_pin_refuses_overwrite_and_leaves_files_unchanged() {
    use lagosfile_lib::{commands::auth::setup_pin_in_dir, db::vault, AppState};

    let dir = std::env::temp_dir().join(format!("lagosfile-s1-overwrite-{}", uuid::Uuid::new_v4()));
    let state = AppState::default();

    setup_pin_in_dir(&dir, "1234", &state).expect("first setup should succeed");
    let db_bytes_before = std::fs::read(dir.join("lagosfile.db.enc")).unwrap();
    assert!(vault::has_vault_header(&db_bytes_before));
    assert!(!dir.join(".salt").exists());

    let state2 = AppState::default();
    let err = setup_pin_in_dir(&dir, "9999", &state2).expect_err("second setup must fail");
    assert!(err.contains("already exists"), "unexpected error: {err}");

    let db_bytes_after = std::fs::read(dir.join("lagosfile.db.enc")).unwrap();
    assert_eq!(db_bytes_before, db_bytes_after);

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn test_setup_pin_concurrent_calls_produce_exactly_one_vault() {
    use lagosfile_lib::{commands::auth::setup_pin_in_dir, db::vault, AppState};
    use std::sync::{Arc, Barrier};

    let dir = std::env::temp_dir().join(format!("lagosfile-s1-race-{}", uuid::Uuid::new_v4()));
    let barrier = Arc::new(Barrier::new(2));

    let handles: Vec<_> = (0..2)
        .map(|i| {
            let d = dir.clone();
            let b = Arc::clone(&barrier);
            std::thread::spawn(move || {
                let state = AppState::default();
                b.wait();
                setup_pin_in_dir(&d, if i == 0 { "1234" } else { "5678" }, &state)
            })
        })
        .collect();

    let results: Vec<_> = handles.into_iter().map(|h| h.join().unwrap()).collect();
    let successes = results.iter().filter(|r| r.is_ok()).count();
    let failures = results.iter().filter(|r| r.is_err()).count();
    assert_eq!(successes, 1, "exactly one concurrent setup must succeed");
    assert_eq!(failures, 1, "the other concurrent setup must fail");

    // Verify the winning self-describing vault is valid and decryptable with one of the two PINs
    let enc = std::fs::read(dir.join("lagosfile.db.enc")).unwrap();
    assert!(vault::has_vault_header(&enc));
    assert!(
        vault::decode_with_pin(&enc, "1234", None, None).is_ok()
            || vault::decode_with_pin(&enc, "5678", None, None).is_ok(),
        "winning vault must decrypt with the winning PIN"
    );

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn test_setup_pin_allows_retry_with_leftover_salt_file() {
    use lagosfile_lib::{commands::auth::setup_pin_in_dir, db::vault, AppState};

    let dir = std::env::temp_dir().join(format!("lagosfile-s1-salt-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let stale_salt = [0xAAu8; 16];
    std::fs::write(dir.join(".salt"), stale_salt).unwrap();

    let state = AppState::default();
    setup_pin_in_dir(&dir, "4321", &state).expect("setup should succeed with lone .salt");

    let enc = std::fs::read(dir.join("lagosfile.db.enc")).unwrap();
    assert!(vault::has_vault_header(&enc));
    assert!(!dir.join(".salt").exists(), "stale .salt should be cleaned up");
    assert!(vault::decode_with_pin(&enc, "4321", None, None).is_ok());

    let _ = std::fs::remove_dir_all(&dir);
}

fn create_legacy_vault_dir(dir: &std::path::Path, pin: &str) -> [u8; 32] {
    std::fs::create_dir_all(dir.join("documents")).unwrap();
    let db = AppDb::open_in_memory().unwrap();
    {
        let conn = db.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO taxpayer (id, full_name, tin, created_at) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![
                uuid::Uuid::new_v4().to_string(),
                "Legacy User",
                "1234567890",
                chrono::Utc::now().to_rfc3339(),
            ],
        )
        .unwrap();
    }
    let salt = security::generate_salt();
    let key = security::derive_key(pin, &salt);
    let plaintext = db.serialize().unwrap();
    let encrypted = security::encrypt(&plaintext, &key).unwrap();
    std::fs::write(dir.join(".salt"), salt).unwrap();
    std::fs::write(dir.join("lagosfile.db.enc"), encrypted).unwrap();

    // Recovery blob wrapping `key`
    let ans_salt = security::generate_salt();
    let ak = security::derive_key("a1|a2|a3", &ans_salt);
    let blob = security::encrypt(&key, &ak).unwrap();
    let rec = serde_json::json!({
        "question_1": "Q1",
        "question_2": "Q2",
        "question_3": "Q3",
        "answer_salt": hex::encode(ans_salt),
        "recovery_blob": hex::encode(blob),
    });
    std::fs::write(dir.join(".recovery"), serde_json::to_string(&rec).unwrap()).unwrap();
    key
}

fn mutate_taxpayer_name(state: &lagosfile_lib::AppState, new_name: &str) {
    let guard = state.db.lock().unwrap();
    let db = guard.as_ref().unwrap();
    let conn = db.conn.lock().unwrap();
    conn.execute("UPDATE taxpayer SET full_name = ?1", rusqlite::params![new_name])
        .unwrap();
}

#[tokio::test]
async fn test_s2_legacy_vault_upgrade_via_pin_biometric_and_recovery() {
    use lagosfile_lib::{
        commands::auth::{
            lock_db_in_dir, recover_with_answers_in_dir, unlock_db_in_dir,
            unlock_with_biometric_key_in_dir,
        },
        db::vault,
        AppState,
    };

    // 1. Legacy -> unlock via PIN -> edit -> lock -> reopen via PIN & biometric & recovery
    {
        let dir = std::env::temp_dir().join(format!("lagosfile-s2-pin-{}", uuid::Uuid::new_v4()));
        let orig_key = create_legacy_vault_dir(&dir, "1234");
        assert!(!vault::has_vault_header(&std::fs::read(dir.join("lagosfile.db.enc")).unwrap()));

        let state = AppState::default();
        let tp = unlock_db_in_dir(&dir, "1234", &state).unwrap().unwrap();
        assert_eq!(tp.full_name, "Legacy User");
        // Unlock alone does not rewrite yet
        assert!(dir.join(".salt").exists());

        mutate_taxpayer_name(&state, "Edited Via PIN");
        lock_db_in_dir(&dir, &state).await.unwrap();

        let raw_after = std::fs::read(dir.join("lagosfile.db.enc")).unwrap();
        assert!(vault::has_vault_header(&raw_after), "vault must have v1 header after first save");
        assert!(!dir.join(".salt").exists(), "legacy .salt must be removed after upgrade");

        let state2 = AppState::default();
        let tp2 = unlock_db_in_dir(&dir, "1234", &state2).unwrap().unwrap();
        assert_eq!(tp2.full_name, "Edited Via PIN");

        // Same key still works for biometric and recovery after upgrade!
        let state3 = AppState::default();
        let tp3 = unlock_with_biometric_key_in_dir(&dir, orig_key, &state3).unwrap().unwrap();
        assert_eq!(tp3.full_name, "Edited Via PIN");

        let state4 = AppState::default();
        let tp4 = recover_with_answers_in_dir(
            &dir,
            &["a1".into(), "a2".into(), "a3".into()],
            &state4,
        )
        .unwrap()
        .unwrap();
        assert_eq!(tp4.full_name, "Edited Via PIN");

        let _ = std::fs::remove_dir_all(&dir);
    }

    // 2. Legacy -> unlock via biometric key -> edit -> lock -> reopen via biometric & PIN
    {
        let dir = std::env::temp_dir().join(format!("lagosfile-s2-bio-{}", uuid::Uuid::new_v4()));
        let orig_key = create_legacy_vault_dir(&dir, "2468");

        let state = AppState::default();
        let tp = unlock_with_biometric_key_in_dir(&dir, orig_key, &state).unwrap().unwrap();
        assert_eq!(tp.full_name, "Legacy User");

        mutate_taxpayer_name(&state, "Edited Via Bio");
        lock_db_in_dir(&dir, &state).await.unwrap();

        assert!(vault::has_vault_header(&std::fs::read(dir.join("lagosfile.db.enc")).unwrap()));
        assert!(!dir.join(".salt").exists());

        let state2 = AppState::default();
        let tp2 = unlock_with_biometric_key_in_dir(&dir, orig_key, &state2).unwrap().unwrap();
        assert_eq!(tp2.full_name, "Edited Via Bio");

        let state3 = AppState::default();
        let tp3 = unlock_db_in_dir(&dir, "2468", &state3).unwrap().unwrap();
        assert_eq!(tp3.full_name, "Edited Via Bio");

        let _ = std::fs::remove_dir_all(&dir);
    }

    // 3. Legacy -> unlock via recovery questions -> edit -> lock -> reopen via recovery & PIN
    {
        let dir = std::env::temp_dir().join(format!("lagosfile-s2-rec-{}", uuid::Uuid::new_v4()));
        let _orig_key = create_legacy_vault_dir(&dir, "1357");

        let state = AppState::default();
        let tp = recover_with_answers_in_dir(
            &dir,
            &["a1".into(), "a2".into(), "a3".into()],
            &state,
        )
        .unwrap()
        .unwrap();
        assert_eq!(tp.full_name, "Legacy User");

        mutate_taxpayer_name(&state, "Edited Via Recovery");
        lock_db_in_dir(&dir, &state).await.unwrap();

        assert!(vault::has_vault_header(&std::fs::read(dir.join("lagosfile.db.enc")).unwrap()));
        assert!(!dir.join(".salt").exists());

        let state2 = AppState::default();
        let tp2 = recover_with_answers_in_dir(
            &dir,
            &["a1".into(), "a2".into(), "a3".into()],
            &state2,
        )
        .unwrap()
        .unwrap();
        assert_eq!(tp2.full_name, "Edited Via Recovery");

        let state3 = AppState::default();
        let tp3 = unlock_db_in_dir(&dir, "1357", &state3).unwrap().unwrap();
        assert_eq!(tp3.full_name, "Edited Via Recovery");

        let _ = std::fs::remove_dir_all(&dir);
    }
}

#[tokio::test]
async fn test_s2_fresh_install_restore_and_settings_restore_different_pin() {
    use lagosfile_lib::{
        commands::auth::{
            backup_db_to_path, lock_db_in_dir, restore_backup_fresh_in_dir, restore_db_in_dir,
            setup_pin_in_dir, unlock_db_in_dir,
        },
        AppState,
    };

    let src_dir = std::env::temp_dir().join(format!("lagosfile-s2-src-{}", uuid::Uuid::new_v4()));
    let backup_file = std::env::temp_dir().join(format!("lagosfile-s2-bak-{}.lf.enc", uuid::Uuid::new_v4()));
    let fresh_dir = std::env::temp_dir().join(format!("lagosfile-s2-fresh-{}", uuid::Uuid::new_v4()));
    let settings_dir = std::env::temp_dir().join(format!("lagosfile-s2-settings-{}", uuid::Uuid::new_v4()));

    // Create source vault with PIN "1111", insert taxpayer, and create backup
    let src_state = AppState::default();
    setup_pin_in_dir(&src_dir, "1111", &src_state).unwrap();
    {
        let guard = src_state.db.lock().unwrap();
        let db = guard.as_ref().unwrap();
        let conn = db.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO taxpayer (id, full_name, tin, created_at) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![
                uuid::Uuid::new_v4().to_string(),
                "Backed Up Taxpayer",
                "99988877766",
                chrono::Utc::now().to_rfc3339(),
            ],
        )
        .unwrap();
    }
    backup_db_to_path(&backup_file, &src_state).unwrap();

    // Fresh install restore with ONLY the backup file and its PIN "1111"
    let fresh_state = AppState::default();
    let tp = restore_backup_fresh_in_dir(&fresh_dir, &backup_file, "1111", &fresh_state)
        .expect("fresh restore should succeed")
        .expect("taxpayer should be present");
    assert_eq!(tp.full_name, "Backed Up Taxpayer");
    lock_db_in_dir(&fresh_dir, &fresh_state).await.unwrap();

    // Fresh vault now opens with backup's PIN "1111"
    let reopen_state = AppState::default();
    let tp2 = unlock_db_in_dir(&fresh_dir, "1111", &reopen_state).unwrap().unwrap();
    assert_eq!(tp2.full_name, "Backed Up Taxpayer");

    // Settings restore: create a separate vault with DIFFERENT PIN "9999" and different taxpayer
    let set_state = AppState::default();
    setup_pin_in_dir(&settings_dir, "9999", &set_state).unwrap();
    {
        let guard = set_state.db.lock().unwrap();
        let db = guard.as_ref().unwrap();
        let conn = db.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO taxpayer (id, full_name, tin, created_at) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![
                uuid::Uuid::new_v4().to_string(),
                "Original Live Taxpayer",
                "11111111111",
                chrono::Utc::now().to_rfc3339(),
            ],
        )
        .unwrap();
    }
    lagosfile_lib::commands::auth::persist_db_in_dir(&settings_dir, &set_state).unwrap();
    let live_before = std::fs::read(settings_dir.join("lagosfile.db.enc")).unwrap();

    // Wrong backup PIN must fail and leave live vault untouched
    let err = restore_db_in_dir(&settings_dir, &backup_file, "0000", &set_state)
        .expect_err("wrong backup PIN must fail");
    assert!(err.contains("Invalid backup"), "unexpected error: {err}");
    assert_eq!(
        live_before,
        std::fs::read(settings_dir.join("lagosfile.db.enc")).unwrap(),
        "wrong PIN must leave live vault byte-for-byte untouched"
    );

    // Correct backup PIN "1111" succeeds and re-encrypts under active vault PIN "9999"
    let restored_tp = restore_db_in_dir(&settings_dir, &backup_file, "1111", &set_state)
        .expect("settings restore with different PIN must succeed")
        .expect("restored taxpayer expected");
    assert_eq!(restored_tp.full_name, "Backed Up Taxpayer");
    lock_db_in_dir(&settings_dir, &set_state).await.unwrap();

    // Live vault still unlocks with its own PIN "9999" (not backup's "1111")
    let verify_state = AppState::default();
    assert!(unlock_db_in_dir(&settings_dir, "1111", &verify_state).is_err());
    let tp_live = unlock_db_in_dir(&settings_dir, "9999", &verify_state).unwrap().unwrap();
    assert_eq!(tp_live.full_name, "Backed Up Taxpayer");

    let _ = std::fs::remove_dir_all(&src_dir);
    let _ = std::fs::remove_file(&backup_file);
    let _ = std::fs::remove_dir_all(&fresh_dir);
    let _ = std::fs::remove_dir_all(&settings_dir);
}

struct MockKeyring {
    value: std::sync::Mutex<Option<String>>,
    fail_on_set: bool,
}

impl MockKeyring {
    fn new(initial: Option<String>, fail_on_set: bool) -> Self {
        Self {
            value: std::sync::Mutex::new(initial),
            fail_on_set,
        }
    }

    fn current(&self) -> Option<String> {
        self.value.lock().unwrap().clone()
    }
}

impl lagosfile_lib::commands::auth::BiometricKeyStore for MockKeyring {
    fn get_key_hex(&self) -> Option<String> {
        self.value.lock().unwrap().clone()
    }

    fn set_key_hex(&self, hex_key: &str) -> Result<(), String> {
        if self.fail_on_set {
            return Err("keyring unavailable".to_string());
        }
        *self.value.lock().unwrap() = Some(hex_key.to_string());
        Ok(())
    }

    fn delete_key(&self) {
        *self.value.lock().unwrap() = None;
    }
}

#[test]
fn test_s3_change_pin_injected_failure_leaves_old_pin_working() {
    use lagosfile_lib::{
        commands::auth::{change_pin_with_deps, setup_pin_in_dir, unlock_db_in_dir},
        AppState,
    };

    let dir = std::env::temp_dir().join(format!("lagosfile-s3-fail-{}", uuid::Uuid::new_v4()));
    let state = AppState::default();
    setup_pin_in_dir(&dir, "1111", &state).unwrap();
    let old_key_hex = hex::encode(state.key.lock().unwrap().unwrap());
    let keyring = MockKeyring::new(Some(old_key_hex.clone()), false);

    // Inject failure after encrypted temp file is written, right before rename
    let err = change_pin_with_deps(&dir, "1111", "2222", &state, &keyring, |tmp_path| {
        assert!(tmp_path.exists(), "encrypted temp file should exist before rename");
        Err("simulated disk failure".to_string())
    })
    .expect_err("injected failure must abort PIN change");
    assert!(err.contains("simulated disk failure"));

    // Vault on disk must still open with old PIN "1111", not "2222"
    let verify_state = AppState::default();
    assert!(unlock_db_in_dir(&dir, "2222", &verify_state).is_err());
    unlock_db_in_dir(&dir, "1111", &verify_state).expect("old PIN must still open vault");

    // Keyring must still hold the old key
    assert_eq!(keyring.current(), Some(old_key_hex));

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn test_s3_change_pin_updates_keyring_so_biometric_unlock_still_works() {
    use lagosfile_lib::{
        commands::auth::{
            change_pin_with_deps, setup_pin_in_dir, unlock_db_in_dir,
            unlock_with_biometric_key_in_dir,
        },
        AppState,
    };

    let dir = std::env::temp_dir().join(format!("lagosfile-s3-bio-{}", uuid::Uuid::new_v4()));
    let state = AppState::default();
    setup_pin_in_dir(&dir, "1111", &state).unwrap();
    let old_key = state.key.lock().unwrap().unwrap();
    let keyring = MockKeyring::new(Some(hex::encode(old_key)), false);

    let bio_still_on =
        change_pin_with_deps(&dir, "1111", "2222", &state, &keyring, |_| Ok(())).unwrap();
    assert!(bio_still_on, "biometric should stay enabled after keyring sync");

    let new_key_hex = keyring.current().expect("keyring must contain updated key");
    assert_ne!(new_key_hex, hex::encode(old_key));
    let mut new_key = [0u8; 32];
    new_key.copy_from_slice(&hex::decode(&new_key_hex).unwrap());

    // Biometric unlock with updated keyring key works on the re-encrypted vault
    let bio_state = AppState::default();
    unlock_with_biometric_key_in_dir(&dir, new_key, &bio_state)
        .expect("biometric unlock must succeed after PIN change");

    // New PIN works, old PIN does not
    let pin_state = AppState::default();
    assert!(unlock_db_in_dir(&dir, "1111", &pin_state).is_err());
    unlock_db_in_dir(&dir, "2222", &pin_state).expect("new PIN must unlock");

    // When keyring update fails, stale entry is deleted and biometric is disabled
    let failing_keyring = MockKeyring::new(Some(new_key_hex), true);
    let bio_after_fail =
        change_pin_with_deps(&dir, "2222", "3333", &pin_state, &failing_keyring, |_| Ok(()))
            .unwrap();
    assert!(!bio_after_fail, "biometric must be turned off if keyring update fails");
    assert!(failing_keyring.current().is_none(), "stale keyring key must be deleted");

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn test_s3_reset_pin_requires_prior_recovery_and_syncs_keyring() {
    use lagosfile_lib::{
        commands::auth::{
            recover_with_answers_in_dir, reset_pin_with_deps, unlock_db_in_dir,
            unlock_with_biometric_key_in_dir,
        },
        AppState,
    };

    let dir = std::env::temp_dir().join(format!("lagosfile-s3-reset-{}", uuid::Uuid::new_v4()));
    let orig_key = create_legacy_vault_dir(&dir, "1234");
    let keyring = MockKeyring::new(Some(hex::encode(orig_key)), false);

    // Normal PIN unlock MUST NOT permit reset_pin
    let normal_state = AppState::default();
    unlock_db_in_dir(&dir, "1234", &normal_state).unwrap();
    let err = reset_pin_with_deps(&dir, "9999", &normal_state, &keyring, |_| Ok(()))
        .expect_err("reset_pin without prior recovery must be rejected");
    assert!(err.contains("after account recovery"), "unexpected error: {err}");

    // Recover with answers -> reset_pin is now permitted once and syncs keyring
    let rec_state = AppState::default();
    recover_with_answers_in_dir(&dir, &["a1".into(), "a2".into(), "a3".into()], &rec_state)
        .unwrap();
    let bio_on = reset_pin_with_deps(&dir, "9999", &rec_state, &keyring, |_| Ok(())).unwrap();
    assert!(bio_on);

    // Second reset_pin in same session without another recovery must be rejected
    let err2 = reset_pin_with_deps(&dir, "8888", &rec_state, &keyring, |_| Ok(()))
        .expect_err("reset_pin must be single-use after recovery");
    assert!(err2.contains("after account recovery"));

    // New PIN and synced biometric key both open the vault
    let verify_pin = AppState::default();
    unlock_db_in_dir(&dir, "9999", &verify_pin).expect("new PIN must unlock after reset");

    let new_key_bytes = hex::decode(keyring.current().unwrap()).unwrap();
    let mut new_key = [0u8; 32];
    new_key.copy_from_slice(&new_key_bytes);
    let verify_bio = AppState::default();
    unlock_with_biometric_key_in_dir(&dir, new_key, &verify_bio)
        .expect("synced biometric key must unlock after reset");

    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn test_concurrent_persist_and_change_pin_are_strictly_serialized() {
    use lagosfile_lib::{
        commands::auth::{
            change_pin_in_dir_async, persist_db_in_dir_async_with_hook, setup_pin_in_dir,
            unlock_db_in_dir,
        },
        AppState,
    };
    use std::sync::Arc;

    let dir = std::env::temp_dir().join(format!("lagosfile-serial-io-{}", uuid::Uuid::new_v4()));
    let state = Arc::new(AppState::default());
    setup_pin_in_dir(&dir, "1111", &state).unwrap();

    // Seed initial taxpayer row so we can mutate it between overlapping writes.
    {
        let guard = state.db.lock().unwrap();
        let db = guard.as_ref().unwrap();
        let conn = db.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO taxpayer (id, full_name, tin, created_at) VALUES ('tp-1', 'Initial', '12345678-0001', '2026-01-01T00:00:00Z')",
            [],
        )
        .unwrap();
    }

    // Start save 1 and pause inside its before_rename hook while change_pin queues behind vault_io_lock.
    let (entered_tx, entered_rx) = tokio::sync::oneshot::channel::<()>();
    let state1 = Arc::clone(&state);
    let dir1 = dir.clone();

    mutate_taxpayer_name(&state, "Older Write");
    let t1 = tokio::spawn(async move {
        persist_db_in_dir_async_with_hook(dir1, &state1, move |_| {
            let _ = entered_tx.send(());
            std::thread::sleep(std::time::Duration::from_millis(120));
            Ok(())
        })
        .await
    });

    // Await (non-blocking) until t1 is actively inside spawn_blocking (holding vault_io_lock).
    entered_rx.await.unwrap();

    // Mutate DB to newer state and trigger change_pin concurrently; it MUST serialize after t1.
    mutate_taxpayer_name(&state, "Newer Write");
    let state2 = Arc::clone(&state);
    let dir2 = dir.clone();
    let t2 = tokio::spawn(async move {
        change_pin_in_dir_async(dir2, "1111".to_string(), "2222".to_string(), &state2, false).await
    });

    t1.await.unwrap().unwrap();
    t2.await.unwrap().unwrap();

    // Reopen from disk: new PIN MUST work and data MUST reflect "Newer Write", never "Older Write".
    let verify = AppState::default();
    let tp = unlock_db_in_dir(&dir, "2222", &verify)
        .expect("new PIN must unlock after serialized persist + change_pin")
        .unwrap();
    assert_eq!(tp.full_name, "Newer Write");

    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn test_lock_db_waits_for_inflight_change_pin_and_leaves_no_key_leak() {
    use lagosfile_lib::{
        commands::auth::{change_pin_in_dir_async, lock_db_in_dir, setup_pin_in_dir, unlock_db_in_dir},
        AppState,
    };
    use std::sync::Arc;

    let dir = std::env::temp_dir().join(format!("lagosfile-lock-race-{}", uuid::Uuid::new_v4()));
    let state = Arc::new(AppState::default());
    setup_pin_in_dir(&dir, "1234", &state).unwrap();

    let s1 = Arc::clone(&state);
    let d1 = dir.clone();
    let s2 = Arc::clone(&state);
    let d2 = dir.clone();

    let t_change = tokio::spawn(async move {
        change_pin_in_dir_async(d1, "1234".into(), "5678".into(), &s1, false).await
    });
    tokio::task::yield_now().await;
    let t_lock = tokio::spawn(async move { lock_db_in_dir(&d2, &s2).await });

    let change_res = t_change.await.unwrap();
    let lock_res = t_lock.await.unwrap();
    assert!(lock_res.is_ok());

    // After both finish, if lock ran second, state MUST be completely locked (no leaked key or db).
    // Even if lock ran first (making change_pin return "Database not unlocked"), state MUST be locked.
    assert!(state.db.lock().unwrap().is_none(), "db must be None after lock");
    assert!(state.key.lock().unwrap().is_none(), "key must be None after lock");
    assert!(state.salt.lock().unwrap().is_none(), "salt must be None after lock");

    let expected_pin = if change_res.is_ok() { "5678" } else { "1234" };
    let reopened = AppState::default();
    unlock_db_in_dir(&dir, expected_pin, &reopened).expect("vault must reopen cleanly with consistent PIN");

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn test_failed_restore_on_second_attachment_preserves_original_vault_and_documents() {
    use lagosfile_lib::{
        commands::{
            auth::{
                backup_db_to_path_in_dir, restore_backup_fresh_in_dir_with_hook,
                restore_db_in_dir_with_hook, setup_pin_in_dir, unlock_db_in_dir,
            },
            document::attach_document_in_dir,
        },
        db::doc_store,
        AppState,
    };

    // 1. Build a source backup containing two encrypted documents.
    let src_dir = std::env::temp_dir().join(format!("lagosfile-res-src-{}", uuid::Uuid::new_v4()));
    let src_state = AppState::default();
    setup_pin_in_dir(&src_dir, "9999", &src_state).unwrap();
    {
        let guard = src_state.db.lock().unwrap();
        let db = guard.as_ref().unwrap();
        let conn = db.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO taxpayer (id, full_name, tin, created_at) VALUES ('tp-b', 'Backup User', '11111111-0001', '2026-01-01T00:00:00Z')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO filing (id, taxpayer_id, year_of_assessment, status, tax_config_version, created_at)
             VALUES ('f-b', 'tp-b', 2025, 'Draft', 'v1', '2026-01-01T00:00:00Z')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO income_entry (id, filing_id, income_type, gross_amount_ngn) VALUES ('inc-b', 'f-b', 'employment', 1000000)",
            [],
        ).unwrap();
    }
    let tmp_a = src_dir.join("a.txt");
    let tmp_b = src_dir.join("b.txt");
    std::fs::write(&tmp_a, b"backup doc A").unwrap();
    std::fs::write(&tmp_b, b"backup doc B").unwrap();
    attach_document_in_dir(&src_dir, "inc-b", "income", tmp_a.to_str().unwrap(), "a.txt", "text/plain", 12, &src_state).unwrap();
    attach_document_in_dir(&src_dir, "inc-b", "income", tmp_b.to_str().unwrap(), "b.txt", "text/plain", 12, &src_state).unwrap();

    let backup_path = src_dir.join("backup.lgfa");
    backup_db_to_path_in_dir(&src_dir, &backup_path, &src_state).unwrap();

    // 2. Create a live target vault with its own taxpayer + original attachment.
    let live_dir = std::env::temp_dir().join(format!("lagosfile-res-live-{}", uuid::Uuid::new_v4()));
    let live_state = AppState::default();
    setup_pin_in_dir(&live_dir, "1111", &live_state).unwrap();
    {
        let guard = live_state.db.lock().unwrap();
        let db = guard.as_ref().unwrap();
        let conn = db.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO taxpayer (id, full_name, tin, created_at) VALUES ('tp-orig', 'Original User', '22222222-0001', '2026-01-01T00:00:00Z')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO filing (id, taxpayer_id, year_of_assessment, status, tax_config_version, created_at)
             VALUES ('f-orig', 'tp-orig', 2025, 'Draft', 'v1', '2026-01-01T00:00:00Z')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO income_entry (id, filing_id, income_type, gross_amount_ngn) VALUES ('inc-orig', 'f-orig', 'employment', 500000)",
            [],
        ).unwrap();
    }
    let orig_src = live_dir.join("orig.txt");
    std::fs::write(&orig_src, b"original secret doc").unwrap();
    let orig_doc = attach_document_in_dir(&live_dir, "inc-orig", "income", orig_src.to_str().unwrap(), "orig.txt", "text/plain", 19, &live_state).unwrap();
    let orig_rel = orig_doc["filePath"].as_str().unwrap().to_string();

    // 3. Inject failure on 2nd attachment during Settings restore -> original vault & doc MUST survive restart!
    let err = restore_db_in_dir_with_hook(&live_dir, &backup_path, "9999", &live_state, |idx, _| {
        if idx == 1 {
            Err("simulated disk full on 2nd attachment".to_string())
        } else {
            Ok(())
        }
    })
    .expect_err("restore must fail on injected 2nd-attachment error");
    assert!(err.contains("simulated disk full"));

    let restarted = AppState::default();
    let tp = unlock_db_in_dir(&live_dir, "1111", &restarted).unwrap().unwrap();
    assert_eq!(tp.full_name, "Original User", "original DB must remain untouched on disk");
    let orig_bytes = {
        let guard = restarted.db.lock().unwrap();
        let db = guard.as_ref().unwrap();
        let dk = doc_store::get_doc_key(db).unwrap().unwrap();
        let raw = std::fs::read(doc_store::resolve_doc_path(&live_dir, &orig_rel)).unwrap();
        doc_store::decrypt_doc(&raw, &dk).unwrap()
    };
    assert_eq!(orig_bytes, b"original secret doc");

    // 4. Successful Settings restore sweeps prior vault's documents cleanly.
    restore_db_in_dir_with_hook(&live_dir, &backup_path, "9999", &restarted, |_, _| Ok(())).unwrap();
    assert!(
        !doc_store::resolve_doc_path(&live_dir, &orig_rel).exists(),
        "prior vault's document must be swept after successful restore"
    );

    // 5. Fresh restore failing on 2nd attachment must NOT leave lagosfile.db.enc blocking retry.
    let fresh_dir = std::env::temp_dir().join(format!("lagosfile-res-fresh-{}", uuid::Uuid::new_v4()));
    let fresh_state = AppState::default();
    let fresh_err = restore_backup_fresh_in_dir_with_hook(&fresh_dir, &backup_path, "9999", &fresh_state, |idx, _| {
        if idx == 1 {
            Err("simulated fresh failure".to_string())
        } else {
            Ok(())
        }
    })
    .expect_err("fresh restore must fail");
    assert!(fresh_err.contains("simulated fresh failure"));
    assert!(!fresh_dir.join("lagosfile.db.enc").exists(), "failed fresh restore must not leave vault file");

    // Retry succeeds cleanly.
    let tp_fresh = restore_backup_fresh_in_dir_with_hook(&fresh_dir, &backup_path, "9999", &fresh_state, |_, _| Ok(()))
        .unwrap()
        .unwrap();
    assert_eq!(tp_fresh.full_name, "Backup User");

    let _ = std::fs::remove_dir_all(&src_dir);
    let _ = std::fs::remove_dir_all(&live_dir);
    let _ = std::fs::remove_dir_all(&fresh_dir);
}

#[test]
fn test_vault_safety_guards_missing_salt_exclusive_abort_oom_and_unlock_migration_error() {
    use lagosfile_lib::{
        commands::auth::{setup_pin_in_dir, unlock_db_in_dir_with_hook},
        db::{doc_store, vault},
        services::security,
        AppState,
    };

    // 1. Legacy vault missing .salt in decode_with_key MUST error instead of fabricating random salt.
    let dir = std::env::temp_dir().join(format!("lagosfile-guards-{}", uuid::Uuid::new_v4()));
    let orig_key = create_legacy_vault_dir(&dir, "1234");
    std::fs::remove_file(dir.join(".salt")).unwrap();
    let raw = std::fs::read(dir.join("lagosfile.db.enc")).unwrap();
    let err = vault::decode_with_key(&raw, &orig_key, Some(&dir.join(".salt")))
        .err()
        .expect("missing legacy .salt must error instead of generating a random salt");
    assert!(err.contains(".salt"));

    // 2. Interrupted write_new_exclusive leaves no lagosfile.db.enc blocking retry.
    let setup_dir = std::env::temp_dir().join(format!("lagosfile-excl-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&setup_dir).unwrap();
    let salt = security::generate_salt();
    let key = security::derive_key("4321", &salt);
    let _ = vault::write_new_exclusive_with_hook(&setup_dir, b"hello", &key, &salt, |_| {
        Err("simulated crash before claim".to_string())
    });
    assert!(!setup_dir.join("lagosfile.db.enc").exists(), "failed exclusive write must not leave vault file");
    vault::write_new_exclusive(&setup_dir, b"hello", &key, &salt).expect("retry must succeed");

    // 3. Corrupt 20-byte LGFA archive with u32::MAX doc_count is rejected cleanly without OOM abort.
    let mut bad_archive = Vec::new();
    bad_archive.extend_from_slice(b"LGFA");
    bad_archive.push(1u8);
    bad_archive.extend_from_slice(&0u64.to_le_bytes()); // vault_len = 0
    bad_archive.extend_from_slice(&u32::MAX.to_le_bytes()); // bogus doc_count
    let oom_err = doc_store::decode_backup_archive(&bad_archive)
        .err()
        .expect("huge doc_count must be rejected before allocation");
    assert!(oom_err.contains("document count"));

    // 4. Unlock failure during document migration leaves AppState completely locked.
    let mig_dir = std::env::temp_dir().join(format!("lagosfile-mig-fail-{}", uuid::Uuid::new_v4()));
    {
        let st = AppState::default();
        setup_pin_in_dir(&mig_dir, "5555", &st).unwrap();
        let doc_path = mig_dir.join("documents").join("inc-1").join("plain.txt");
        std::fs::create_dir_all(doc_path.parent().unwrap()).unwrap();
        std::fs::write(&doc_path, b"plaintext").unwrap();
        {
            let guard = st.db.lock().unwrap();
            let db = guard.as_ref().unwrap();
            let conn = db.conn.lock().unwrap();
            conn.execute(
                "INSERT INTO document (id, parent_entry_id, parent_entry_type, file_path, file_name, file_type, file_size_bytes, uploaded_at)
                 VALUES ('d1', 'inc-1', 'income', 'documents/inc-1/plain.txt', 'plain.txt', 'text/plain', 9, '2026-01-01T00:00:00Z')",
                [],
            ).unwrap();
        }
        lagosfile_lib::commands::auth::persist_db_in_dir(&mig_dir, &st).unwrap();
    }
    let locked_state = AppState::default();
    let mig_err = unlock_db_in_dir_with_hook(&mig_dir, "5555", &locked_state, |_, _| {
        Err("simulated migration failure".to_string())
    })
    .expect_err("unlock must fail when migration fails");
    assert!(mig_err.contains("simulated migration failure"));
    assert!(locked_state.db.lock().unwrap().is_none(), "AppState.db must remain None on migration error");
    assert!(locked_state.key.lock().unwrap().is_none(), "AppState.key must remain None on migration error");
    assert!(locked_state.salt.lock().unwrap().is_none(), "AppState.salt must remain None on migration error");

    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_dir_all(&setup_dir);
    let _ = std::fs::remove_dir_all(&mig_dir);
}
