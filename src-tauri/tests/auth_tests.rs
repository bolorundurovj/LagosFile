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
    use lagosfile_lib::{commands::auth::setup_pin_in_dir, AppState};

    let dir = std::env::temp_dir().join(format!("lagosfile-s1-overwrite-{}", uuid::Uuid::new_v4()));
    let state = AppState::default();

    setup_pin_in_dir(&dir, "1234", &state).expect("first setup should succeed");
    let db_bytes_before = std::fs::read(dir.join("lagosfile.db.enc")).unwrap();
    let salt_bytes_before = std::fs::read(dir.join(".salt")).unwrap();

    let state2 = AppState::default();
    let err = setup_pin_in_dir(&dir, "9999", &state2).expect_err("second setup must fail");
    assert!(err.contains("already exists"), "unexpected error: {err}");

    let db_bytes_after = std::fs::read(dir.join("lagosfile.db.enc")).unwrap();
    let salt_bytes_after = std::fs::read(dir.join(".salt")).unwrap();
    assert_eq!(db_bytes_before, db_bytes_after);
    assert_eq!(salt_bytes_before, salt_bytes_after);

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn test_setup_pin_concurrent_calls_produce_exactly_one_vault() {
    use lagosfile_lib::{commands::auth::setup_pin_in_dir, AppState};
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

    // Verify the winning vault is valid and decryptable with one of the two PINs
    let salt = std::fs::read(dir.join(".salt")).unwrap();
    let enc = std::fs::read(dir.join("lagosfile.db.enc")).unwrap();
    let k0 = security::derive_key("1234", &salt);
    let k1 = security::derive_key("5678", &salt);
    assert!(
        security::decrypt(&enc, &k0).is_ok() || security::decrypt(&enc, &k1).is_ok(),
        "winning vault must decrypt with the winning PIN"
    );

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn test_setup_pin_allows_retry_with_leftover_salt_file() {
    use lagosfile_lib::{commands::auth::setup_pin_in_dir, AppState};

    let dir = std::env::temp_dir().join(format!("lagosfile-s1-salt-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let stale_salt = [0xAAu8; 16];
    std::fs::write(dir.join(".salt"), stale_salt).unwrap();

    let state = AppState::default();
    setup_pin_in_dir(&dir, "4321", &state).expect("setup should succeed with lone .salt");

    let salt = std::fs::read(dir.join(".salt")).unwrap();
    let enc = std::fs::read(dir.join("lagosfile.db.enc")).unwrap();
    let key = security::derive_key("4321", &salt);
    assert!(security::decrypt(&enc, &key).is_ok());

    let _ = std::fs::remove_dir_all(&dir);
}
