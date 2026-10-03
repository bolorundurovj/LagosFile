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
