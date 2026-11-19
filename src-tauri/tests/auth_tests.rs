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
