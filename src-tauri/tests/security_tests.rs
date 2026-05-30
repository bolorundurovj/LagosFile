use lagosfile_lib::services::security;

#[test]
fn test_salt_generation() {
    let salt1 = security::generate_salt();
    let salt2 = security::generate_salt();
    assert_ne!(salt1, salt2, "Salts should be unique");
}

#[test]
fn test_key_derivation_consistency() {
    let pin = "1234";
    let salt = [1u8; 16];

    let key1 = security::derive_key(pin, &salt);
    let key2 = security::derive_key(pin, &salt);

    assert_eq!(key1, key2, "Same PIN and salt must produce same key");
}

#[test]
fn test_key_derivation_uniqueness() {
    let salt = [1u8; 16];
    let key1 = security::derive_key("1234", &salt);
    let key2 = security::derive_key("4321", &salt);

    assert_ne!(key1, key2, "Different PINs must produce different keys");
}

#[test]
fn test_encrypt_decrypt_roundtrip() {
    let key = [2u8; 32];
    let plaintext = b"Secret Tax Data";

    let ciphertext = security::encrypt(plaintext, &key).expect("Encryption failed");
    assert_ne!(
        plaintext.to_vec(),
        ciphertext,
        "Ciphertext should not be plaintext"
    );

    let decrypted = security::decrypt(&ciphertext, &key).expect("Decryption failed");
    assert_eq!(
        plaintext.to_vec(),
        decrypted,
        "Decrypted data should match original"
    );
}

#[test]
fn test_decryption_failure_with_wrong_key() {
    let key1 = [1u8; 32];
    let key2 = [2u8; 32];
    let plaintext = b"Secret Tax Data";

    let ciphertext = security::encrypt(plaintext, &key1).unwrap();
    let result = security::decrypt(&ciphertext, &key2);

    assert!(result.is_err(), "Decryption should fail with wrong key");
}

#[test]
fn test_decryption_failure_with_corrupted_data() {
    let key = [1u8; 32];
    let plaintext = b"Secret Tax Data";

    let mut ciphertext = security::encrypt(plaintext, &key).unwrap();
    // Corrupt one byte of the ciphertext (skipping the nonce)
    ciphertext[13] ^= 0xFF;

    let result = security::decrypt(&ciphertext, &key);
    assert!(
        result.is_err(),
        "Decryption should fail if data is corrupted"
    );
}
