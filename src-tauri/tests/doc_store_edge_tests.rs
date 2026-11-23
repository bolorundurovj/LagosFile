mod common;

use common::temp_dir;
use lagosfile_lib::{
    db::doc_store::{
        decode_backup_archive, decrypt_doc, encode_backup_archive, encrypt_doc,
        prepare_file_for_external_app_sync, resolve_doc_path, sanitize_file_name,
        validate_safe_rel_doc_path, write_archive_to_path,
    },
    services::security,
};

fn key() -> [u8; 32] {
    security::derive_key("doc", &security::generate_salt())
}

#[test]
fn decrypt_doc_rejects_truncated_unknown_version_and_wrong_key() {
    let k = key();
    assert_eq!(
        decrypt_doc(b"LGFD", &k).unwrap_err(),
        "Corrupt encrypted document"
    );
    let mut bad_version = encrypt_doc(b"secret", &k).unwrap();
    bad_version[4] = 9;
    assert_eq!(
        decrypt_doc(&bad_version, &k).unwrap_err(),
        "Unsupported encrypted document version 9"
    );
    let good = encrypt_doc(b"secret", &k).unwrap();
    assert_eq!(
        decrypt_doc(&good, &key()).unwrap_err(),
        "Could not decrypt attached document."
    );
    assert_eq!(decrypt_doc(&good, &k).unwrap(), b"secret");
    assert_eq!(decrypt_doc(b"plain", &k).unwrap(), b"plain");
}

#[test]
fn sanitize_file_name_strips_unsafe_characters() {
    assert_eq!(sanitize_file_name("a<b>c?.pdf"), "a_b_c_.pdf");
    assert_eq!(sanitize_file_name("..."), "_");
    assert_eq!(sanitize_file_name("  .  "), "attachment");
    assert_eq!(sanitize_file_name("dir/..hidden"), "_hidden");
    assert_eq!(sanitize_file_name(&"x".repeat(300)).len(), 180);
}

#[test]
fn resolve_doc_path_handles_foreign_absolute_and_traversal_paths() {
    let app = std::path::Path::new("/app");
    assert_eq!(
        resolve_doc_path(app, "C:\\Users\\old\\LagosFile\\documents\\e1\\a.enc"),
        app.join("documents").join("e1").join("a.enc")
    );
    assert_eq!(
        resolve_doc_path(app, "/home/old/elsewhere/a.enc"),
        std::path::PathBuf::from("/home/old/elsewhere/a.enc")
    );
    assert_eq!(
        resolve_doc_path(app, "../../etc/passwd"),
        app.join("etc").join("passwd")
    );
    assert_eq!(
        resolve_doc_path(app, "documents/e2/b.enc"),
        app.join("documents").join("e2").join("b.enc")
    );
    assert_eq!(
        resolve_doc_path(app, "documents/../escape.enc"),
        app.join("documents").join("escape.enc")
    );
}

#[test]
fn safe_rel_doc_path_rejects_bad_shapes() {
    assert!(validate_safe_rel_doc_path("documents\\a\\b")
        .unwrap_err()
        .starts_with("Invalid archive document path"));
    assert!(validate_safe_rel_doc_path("other/a")
        .unwrap_err()
        .starts_with("Invalid archive document path"));
    assert!(validate_safe_rel_doc_path("documents/../x")
        .unwrap_err()
        .starts_with("Unsafe archive document path"));
    assert!(validate_safe_rel_doc_path("documents/")
        .unwrap_err()
        .starts_with("Incomplete archive document path"));
    assert_eq!(
        validate_safe_rel_doc_path("documents/e/a.enc").unwrap(),
        std::path::PathBuf::from("documents")
            .join("e")
            .join("a.enc")
    );
}

#[test]
fn backup_archive_decoder_reports_each_truncation() {
    let docs = vec![("documents/e/a.enc".to_string(), b"DATA".to_vec())];
    let archive = encode_backup_archive(b"VAULT", &docs);
    let decoded = decode_backup_archive(&archive).unwrap();
    assert!(decoded.is_archive);
    assert_eq!(decoded.vault_bytes, b"VAULT");
    assert_eq!(decoded.documents.len(), 1);
    assert_eq!(decoded.documents[0].1, b"DATA");

    let plain = decode_backup_archive(b"LGFVrest").unwrap();
    assert!(!plain.is_archive);
    assert_eq!(plain.vault_bytes, b"LGFVrest");

    let err = |bytes: &[u8]| decode_backup_archive(bytes).err().unwrap();
    assert_eq!(err(&archive[..10]), "Corrupt backup archive");
    let mut wrong_version = archive.clone();
    wrong_version[4] = 7;
    assert_eq!(err(&wrong_version), "Unsupported backup archive version 7");

    let header = 4 + 1 + 8;
    let mut huge_vault = archive.clone();
    huge_vault[5..13].copy_from_slice(&(10_000u64).to_le_bytes());
    assert_eq!(err(&huge_vault), "Truncated backup archive (vault)");
    assert_eq!(
        err(&archive[..header + 5 + 2]),
        "Truncated backup archive (doc count)"
    );
    let count_pos = header + 5;
    let mut too_many = archive.clone();
    too_many[count_pos..count_pos + 4].copy_from_slice(&1000u32.to_le_bytes());
    assert!(err(&too_many).contains("invalid document count"));

    let path_pos = count_pos + 4;
    let mut long_path = archive.clone();
    long_path[path_pos..path_pos + 4].copy_from_slice(&500u32.to_le_bytes());
    assert_eq!(err(&long_path), "Truncated backup archive (doc path)");

    let data_len_pos = path_pos + 4 + "documents/e/a.enc".len();
    assert_eq!(
        err(&archive[..data_len_pos + 3]),
        "Truncated backup archive (doc data len)"
    );
    assert_eq!(
        err(&archive[..archive.len() - 1]),
        "Truncated backup archive (doc data)"
    );

    let unsafe_docs = vec![("documents/../x.enc".to_string(), b"D".to_vec())];
    let unsafe_archive = encode_backup_archive(b"V", &unsafe_docs);
    assert!(err(&unsafe_archive).starts_with("Unsafe archive document path"));

    let mut bad_utf8 = archive.clone();
    bad_utf8[path_pos + 4] = 0xFF;
    assert_eq!(err(&bad_utf8), "Invalid UTF-8 path in backup archive");
}

#[test]
fn external_app_preview_decrypts_only_encrypted_files() {
    let dir = temp_dir("preview");
    let k = key();
    let docs = dir.join("documents").join("e1");
    std::fs::create_dir_all(&docs).unwrap();
    std::fs::write(docs.join("plain.txt"), b"hello").unwrap();
    std::fs::write(
        docs.join("slip.pdf.enc"),
        encrypt_doc(b"%PDF-1", &k).unwrap(),
    )
    .unwrap();

    let (plain, temp) =
        prepare_file_for_external_app_sync(&dir, "documents/e1/plain.txt", Some(k)).unwrap();
    assert_eq!(plain, dir.join("documents").join("e1").join("plain.txt"));
    assert!(temp.is_none());

    let err =
        prepare_file_for_external_app_sync(&dir, "documents/e1/slip.pdf.enc", None).unwrap_err();
    assert_eq!(err, "Document key not found in database");

    let (out, temp) =
        prepare_file_for_external_app_sync(&dir, "documents/e1/slip.pdf.enc", Some(k)).unwrap();
    let temp = temp.unwrap();
    assert_eq!(out.file_name().unwrap(), "slip.pdf");
    assert_eq!(std::fs::read(&out).unwrap(), b"%PDF-1");
    let _ = std::fs::remove_dir_all(&temp);

    let missing =
        prepare_file_for_external_app_sync(&dir, "documents/e1/none.pdf", Some(k)).unwrap_err();
    assert!(missing.starts_with("File not found"), "{missing}");

    assert!(write_archive_to_path(&dir.join("nope").join("b.lfbak"), b"x").is_err());
    write_archive_to_path(&dir.join("b.lfbak"), b"archive").unwrap();
    assert_eq!(std::fs::read(dir.join("b.lfbak")).unwrap(), b"archive");
    let _ = std::fs::remove_dir_all(&dir);
}
