mod common;

use common::temp_dir;
use lagosfile_lib::{
    db::vault::{
        compute_bytes_digest, decode_with_key, decode_with_pin, encode, legacy_salt_path,
        read_vault_digest, vault_path, write_atomic, write_atomic_cas_with_hook,
        write_new_exclusive, write_new_exclusive_with_hook, write_to_path, VAULT_MAGIC,
    },
    services::security,
};
use std::time::{Duration, SystemTime};

fn key_and_salt(pin: &str) -> ([u8; 32], [u8; 16]) {
    let salt = security::generate_salt();
    (security::derive_key(pin, &salt), salt)
}

fn tmp_files(dir: &std::path::Path) -> usize {
    std::fs::read_dir(dir)
        .unwrap()
        .filter_map(Result::ok)
        .filter(|e| e.file_name().to_string_lossy().ends_with(".tmp"))
        .count()
}

#[test]
fn decode_rejects_truncated_and_unknown_version_headers() {
    let (key, _) = key_and_salt("1234");
    let short = [VAULT_MAGIC.as_slice(), &[1u8, 2, 3]].concat();
    assert_eq!(
        decode_with_pin(&short, "1234", None, None).err().unwrap(),
        "Corrupt vault file"
    );
    assert_eq!(
        decode_with_key(&short, &key, None).err().unwrap(),
        "Corrupt vault file"
    );

    let mut future = VAULT_MAGIC.to_vec();
    future.push(99);
    future.extend_from_slice(&[0u8; 16]);
    future.extend_from_slice(&[0u8; 40]);
    let err = decode_with_pin(&future, "1234", None, None).err().unwrap();
    assert!(err.contains("Unsupported vault format version 99"), "{err}");
    let err = decode_with_key(&future, &key, None).err().unwrap();
    assert!(err.contains("Unsupported vault format version 99"), "{err}");
}

#[test]
fn decode_with_key_reports_wrong_key_and_legacy_salt_problems() {
    let (key, salt) = key_and_salt("1234");
    let (other, _) = key_and_salt("9999");
    let encoded = encode(b"payload", &key, &salt).unwrap();
    assert_eq!(
        decode_with_key(&encoded, &other, None).err().unwrap(),
        "Could not decrypt database."
    );
    let ok = decode_with_key(&encoded, &key, None).unwrap();
    assert_eq!(ok.plaintext, b"payload");
    assert_eq!(ok.salt, salt);
    assert!(!ok.was_legacy);

    let legacy = security::encrypt(b"old", &key).unwrap();
    let err = decode_with_key(&legacy, &key, None).err().unwrap();
    assert!(err.contains("missing its .salt file"), "{err}");
    let dir = temp_dir("vault-legacy-key");
    let err = decode_with_key(&legacy, &key, Some(&legacy_salt_path(&dir)))
        .err()
        .unwrap();
    assert!(err.contains("missing or unreadable"), "{err}");
    std::fs::write(legacy_salt_path(&dir), salt).unwrap();
    let decoded = decode_with_key(&legacy, &key, Some(&legacy_salt_path(&dir))).unwrap();
    assert!(decoded.was_legacy);
    assert_eq!(decoded.plaintext, b"old");
    assert_eq!(
        decode_with_key(&legacy, &other, None).err().unwrap(),
        "Could not decrypt database."
    );
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn decode_with_pin_requires_a_valid_legacy_salt() {
    let (key, salt) = key_and_salt("4321");
    let legacy = security::encrypt(b"legacy-db", &key).unwrap();
    let err = decode_with_pin(&legacy, "4321", None, None).err().unwrap();
    assert!(err.contains("older format"), "{err}");

    let dir = temp_dir("vault-legacy-pin");
    let salt_file = legacy_salt_path(&dir);
    assert_eq!(
        decode_with_pin(&legacy, "4321", None, Some(&salt_file))
            .err()
            .unwrap(),
        "Salt file not found"
    );
    std::fs::write(&salt_file, b"short").unwrap();
    assert_eq!(
        decode_with_pin(&legacy, "4321", None, Some(&salt_file))
            .err()
            .unwrap(),
        "Corrupt salt file"
    );
    std::fs::write(&salt_file, salt).unwrap();
    let decoded = decode_with_pin(&legacy, "4321", None, Some(&salt_file)).unwrap();
    assert!(decoded.was_legacy);
    assert_eq!(decoded.plaintext, b"legacy-db");
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn compare_and_swap_write_refuses_stale_or_missing_vault() {
    let dir = temp_dir("vault-cas");
    let (key, salt) = key_and_salt("1111");

    let err = write_atomic_cas_with_hook(&dir, b"v1", &key, &salt, Some([7u8; 32]), |_| Ok(()))
        .unwrap_err();
    assert!(err.contains("missing on disk"), "{err}");
    assert!(!vault_path(&dir).exists());

    write_atomic(&dir, b"v1", &key, &salt).unwrap();
    let digest = read_vault_digest(&dir).unwrap();
    assert_eq!(
        digest,
        compute_bytes_digest(&std::fs::read(vault_path(&dir)).unwrap())
    );

    let err = write_atomic_cas_with_hook(&dir, b"v2", &key, &salt, Some([7u8; 32]), |_| Ok(()))
        .unwrap_err();
    assert!(err.contains("another LagosFile instance"), "{err}");
    assert_eq!(read_vault_digest(&dir), Some(digest), "vault untouched");

    let err = write_atomic_cas_with_hook(&dir, b"v2", &key, &salt, Some(digest), |_| {
        Err("hook failed".to_string())
    })
    .unwrap_err();
    assert_eq!(err, "hook failed");
    assert_eq!(read_vault_digest(&dir), Some(digest));
    assert_eq!(tmp_files(&dir), 0, "temp files are cleaned up");

    let new_digest =
        write_atomic_cas_with_hook(&dir, b"v2", &key, &salt, Some(digest), |_| Ok(())).unwrap();
    assert_eq!(read_vault_digest(&dir), Some(new_digest));
    let decoded = decode_with_pin(
        &std::fs::read(vault_path(&dir)).unwrap(),
        "1111",
        None,
        None,
    )
    .unwrap();
    assert_eq!(decoded.plaintext, b"v2");
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn stale_cross_process_lock_is_reclaimed() {
    let dir = temp_dir("vault-stale-lock");
    let (key, salt) = key_and_salt("2222");
    let lock = dir.join(".vault.write.lock");
    let f = std::fs::File::create(&lock).unwrap();
    f.set_modified(SystemTime::now() - Duration::from_secs(120))
        .unwrap();
    drop(f);

    write_atomic(&dir, b"data", &key, &salt).unwrap();
    assert!(vault_path(&dir).exists());
    assert!(!lock.exists(), "lock released after write");
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn exclusive_create_honours_hook_and_existing_vault_and_drops_legacy_salt() {
    let dir = temp_dir("vault-exclusive");
    let (key, salt) = key_and_salt("3333");

    let err =
        write_new_exclusive_with_hook(
            &dir,
            b"x",
            &key,
            &salt,
            |_| Err("claim aborted".to_string()),
        )
        .unwrap_err();
    assert_eq!(err, "claim aborted");
    assert!(!vault_path(&dir).exists());
    assert_eq!(tmp_files(&dir), 0);

    std::fs::write(legacy_salt_path(&dir), salt).unwrap();
    write_new_exclusive(&dir, b"first", &key, &salt).unwrap();
    assert!(!legacy_salt_path(&dir).exists());
    let err = write_new_exclusive(&dir, b"second", &key, &salt).unwrap_err();
    assert!(err.contains("A vault already exists"), "{err}");
    let decoded = decode_with_pin(
        &std::fs::read(vault_path(&dir)).unwrap(),
        "3333",
        None,
        None,
    )
    .unwrap();
    assert_eq!(decoded.plaintext, b"first");
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn write_to_path_round_trips_and_reports_missing_parent() {
    let dir = temp_dir("vault-to-path");
    let (key, salt) = key_and_salt("4444");
    let dest = dir.join("copy.enc");
    write_to_path(&dest, b"backup", &key, &salt).unwrap();
    let decoded = decode_with_key(&std::fs::read(&dest).unwrap(), &key, None).unwrap();
    assert_eq!(decoded.plaintext, b"backup");

    let missing = dir.join("no-such-dir").join("copy.enc");
    assert!(write_to_path(&missing, b"backup", &key, &salt).is_err());
    assert!(!missing.exists());
    let _ = std::fs::remove_dir_all(&dir);
}
