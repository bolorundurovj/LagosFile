use lagosfile_lib::{
    commands::{
        auth::{
            backup_db_to_path_in_dir, change_pin_in_dir, lock_db_in_dir,
            restore_backup_fresh_in_dir, setup_pin_in_dir, unlock_db_in_dir,
        },
        document::attach_document_in_dir,
        export::export_filing_pdf_in_dir,
    },
    db::doc_store,
    AppState,
};
use rusqlite::params;

fn seed_taxpayer_and_filing(state: &AppState) -> (String, String) {
    let tp_id = uuid::Uuid::new_v4().to_string();
    let filing_id = uuid::Uuid::new_v4().to_string();
    let entry_id = uuid::Uuid::new_v4().to_string();
    let guard = state.db.lock().unwrap();
    let db = guard.as_ref().unwrap();
    let conn = db.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO taxpayer (id, full_name, tin, created_at) VALUES (?1, 'Chidi Okafor', '1234567890', '2026-01-01T00:00:00Z')",
        params![tp_id],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO filing (id, taxpayer_id, year_of_assessment, status, created_at, total_income_ngn, chargeable_income, tax_payable, wht_credit, net_tax_payable, minimum_tax, final_tax_payable)
         VALUES (?1, ?2, 2025, 'Draft', '2026-01-10T00:00:00Z', 5000000.0, 5000000.0, 628000.0, 0.0, 628000.0, 50000.0, 628000.0)",
        params![filing_id, tp_id],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO income_entry (id, filing_id, income_type, description, gross_amount_ngn, is_foreign)
         VALUES (?1, ?2, 'employment', 'Annual Salary', 5000000.0, 0)",
        params![entry_id, filing_id],
    )
    .unwrap();
    (filing_id, entry_id)
}

fn make_tiny_png(path: &std::path::Path) {
    let img = image::RgbImage::from_pixel(4, 4, image::Rgb([15, 52, 96]));
    img.save(path).unwrap();
}

fn make_tiny_pdf(path: &std::path::Path) {
    use printpdf::{Mm, PdfDocument};
    let (doc, _, _) = PdfDocument::new("att", Mm(210.0), Mm(297.0), "L1");
    doc.save(&mut std::io::BufWriter::new(
        std::fs::File::create(path).unwrap(),
    ))
    .unwrap();
}

#[tokio::test]
async fn test_s6_attach_encrypts_at_rest_and_survives_pin_change_and_preview_cleanup() {
    let dir = std::env::temp_dir().join(format!("lagosfile-s6-enc-{}", uuid::Uuid::new_v4()));
    let src_file = dir.join("source_payslip.txt");
    let secret = b"TOP-SECRET-PAYSLIP-SALARY-NGN-12345678";

    let state = AppState::default();
    setup_pin_in_dir(&dir, "1234", &state).unwrap();
    let (_filing_id, entry_id) = seed_taxpayer_and_filing(&state);
    std::fs::write(&src_file, secret).unwrap();

    let attached = attach_document_in_dir(
        &dir,
        &entry_id,
        "income_entry",
        src_file.to_str().unwrap(),
        "payslip.txt",
        "txt",
        secret.len() as i64,
        &state,
    )
    .unwrap();
    let rel_path = attached["filePath"].as_str().unwrap().to_string();
    let stored_full = doc_store::resolve_doc_path(&dir, &rel_path);
    let stored_bytes = std::fs::read(&stored_full).unwrap();

    // Stored bytes must be encrypted and not contain plaintext
    assert!(doc_store::is_encrypted_doc(&stored_bytes));
    assert!(
        !stored_bytes.windows(secret.len()).any(|w| w == secret),
        "stored document must not contain plaintext bytes"
    );

    // Change PIN -> lock -> unlock with new PIN -> attachment still opens cleanly
    change_pin_in_dir(&dir, "1234", "9876", &state).unwrap();
    lock_db_in_dir(&dir, &state).await.unwrap();

    let state2 = AppState::default();
    unlock_db_in_dir(&dir, "9876", &state2).unwrap();
    let preview_path = doc_store::prepare_file_for_external_app(&dir, &rel_path, &state2).unwrap();
    assert_eq!(std::fs::read(&preview_path).unwrap(), secret);

    // Locking the vault must remove decrypted temporary preview files
    lock_db_in_dir(&dir, &state2).await.unwrap();
    assert!(
        !preview_path.exists(),
        "temp decrypted preview file must be deleted on lock"
    );

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn test_s6_pdf_export_embeds_encrypted_image_and_pdf_attachments() {
    let dir = std::env::temp_dir().join(format!("lagosfile-s6-pdf-{}", uuid::Uuid::new_v4()));
    let state = AppState::default();
    setup_pin_in_dir(&dir, "1234", &state).unwrap();
    let (filing_id, entry_id) = seed_taxpayer_and_filing(&state);

    let png_src = dir.join("receipt.png");
    let pdf_src = dir.join("statement.pdf");
    make_tiny_png(&png_src);
    make_tiny_pdf(&pdf_src);
    let orig_pdf_bytes = std::fs::read(&pdf_src).unwrap();

    attach_document_in_dir(
        &dir,
        &entry_id,
        "income_entry",
        png_src.to_str().unwrap(),
        "receipt.png",
        "png",
        0,
        &state,
    )
    .unwrap();
    attach_document_in_dir(
        &dir,
        &entry_id,
        "income_entry",
        pdf_src.to_str().unwrap(),
        "statement.pdf",
        "pdf",
        0,
        &state,
    )
    .unwrap();

    let out_pdf = dir.join("export_out.pdf");
    export_filing_pdf_in_dir(
        &dir,
        &filing_id,
        out_pdf.to_str().unwrap(),
        true,
        None,
        &state,
    )
    .expect("PDF export with encrypted attachments must succeed");

    // Cover + Computation + Appendix + Embedded PNG + Appended PDF = 5 pages
    let merged = lopdf::Document::load(&out_pdf).expect("exported PDF must be valid");
    assert_eq!(merged.get_pages().len(), 5);

    // Companion attachments folder has decrypted copy of statement.pdf
    let copied_pdf = dir.join("export_out_attachments").join("statement.pdf");
    assert_eq!(std::fs::read(&copied_pdf).unwrap(), orig_pdf_bytes);

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn test_s6_plaintext_migration_survives_interruption_and_completes_on_retry() {
    let dir = std::env::temp_dir().join(format!("lagosfile-s6-mig-{}", uuid::Uuid::new_v4()));
    let state = AppState::default();
    setup_pin_in_dir(&dir, "1234", &state).unwrap();
    let (_filing_id, entry_id) = seed_taxpayer_and_filing(&state);

    let files = [
        ("doc1.txt", b"PLAINTEXT-FILE-ONE".as_slice()),
        ("doc2.txt", b"PLAINTEXT-FILE-TWO".as_slice()),
        ("doc3.txt", b"PLAINTEXT-FILE-THREE".as_slice()),
    ];
    let doc_dir = dir.join("documents").join(&entry_id);
    std::fs::create_dir_all(&doc_dir).unwrap();

    {
        let guard = state.db.lock().unwrap();
        let db = guard.as_ref().unwrap();
        let conn = db.conn.lock().unwrap();
        for (i, (fname, content)) in files.iter().enumerate() {
            let rel = format!("documents/{}/{}", entry_id, fname);
            std::fs::write(dir.join(&rel), content).unwrap();
            conn.execute(
                "INSERT INTO document (id, parent_entry_id, parent_entry_type, file_path, file_name, file_type, file_size_bytes, uploaded_at)
                 VALUES (?1, ?2, 'income_entry', ?3, ?4, 'txt', ?5, ?6)",
                params![
                    uuid::Uuid::new_v4().to_string(),
                    entry_id,
                    rel,
                    fname,
                    content.len() as i64,
                    format!("2025-01-0{}T00:00:00Z", i + 1),
                ],
            )
            .unwrap();
        }
    }
    lagosfile_lib::commands::auth::persist_db_in_dir(&dir, &state).unwrap();

    // Simulate crash on file index 1 (after file 0 has been encrypted)
    let mut progress_events = Vec::new();
    let err = doc_store::migrate_plaintext_documents_with_hook(
        &dir,
        &state,
        |done, total, name| progress_events.push((done, total, name.to_string())),
        |idx, _| {
            if idx == 1 {
                Err("simulated crash mid-migration".to_string())
            } else {
                Ok(())
            }
        },
    )
    .expect_err("interrupted migration must return error");
    assert!(err.contains("simulated crash"));
    assert_eq!(progress_events.len(), 1);

    // File 0 is already encrypted; Files 1 & 2 are still plaintext
    assert!(doc_store::is_encrypted_doc(
        &std::fs::read(doc_dir.join("doc1.txt")).unwrap()
    ));
    assert!(!doc_store::is_encrypted_doc(
        &std::fs::read(doc_dir.join("doc2.txt")).unwrap()
    ));

    // Simulate app restart & unlock: migration automatically finishes remaining 2 files
    let state2 = AppState::default();
    unlock_db_in_dir(&dir, "1234", &state2).expect("unlock after crash must finish migration");

    let doc_key = {
        let guard = state2.db.lock().unwrap();
        doc_store::get_doc_key(guard.as_ref().unwrap())
            .unwrap()
            .expect("document key must be persisted")
    };

    for (fname, expected) in files {
        let rel = format!("documents/{}/{}", entry_id, fname);
        let raw = std::fs::read(dir.join(&rel)).unwrap();
        assert!(doc_store::is_encrypted_doc(&raw), "{fname} must be encrypted");
        assert!(!raw.windows(expected.len()).any(|w| w == expected));
        let plain = doc_store::read_decrypted_doc(&dir, &rel, &doc_key).unwrap();
        assert_eq!(plain.as_slice(), expected);
    }

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn test_s6_backup_bundles_encrypted_documents_and_fresh_install_restore_opens_them() {
    let src_dir = std::env::temp_dir().join(format!("lagosfile-s6-baksrc-{}", uuid::Uuid::new_v4()));
    let fresh_dir =
        std::env::temp_dir().join(format!("lagosfile-s6-bakdst-{}", uuid::Uuid::new_v4()));
    let backup_file =
        std::env::temp_dir().join(format!("lagosfile-s6-archive-{}.lf.enc", uuid::Uuid::new_v4()));

    let src_state = AppState::default();
    setup_pin_in_dir(&src_dir, "5555", &src_state).unwrap();
    let (_filing_id, entry_id) = seed_taxpayer_and_filing(&src_state);

    let secret = b"RENT-RECEIPT-VICTORIA-ISLAND-2025";
    let tmp_input = src_dir.join("rent_receipt.txt");
    std::fs::write(&tmp_input, secret).unwrap();

    let attached = attach_document_in_dir(
        &src_dir,
        &entry_id,
        "income_entry",
        tmp_input.to_str().unwrap(),
        "rent_receipt.txt",
        "txt",
        secret.len() as i64,
        &src_state,
    )
    .unwrap();
    let rel_path = attached["filePath"].as_str().unwrap().to_string();

    // Create backup archive
    backup_db_to_path_in_dir(&src_dir, &backup_file, &src_state).unwrap();
    let archive_bytes = std::fs::read(&backup_file).unwrap();
    assert_eq!(&archive_bytes[..4], doc_store::ARCHIVE_MAGIC);
    assert!(
        !archive_bytes.windows(secret.len()).any(|w| w == secret),
        "backup archive must never contain plaintext document bytes"
    );

    // Delete source machine completely, restore on a brand new fresh install
    let _ = std::fs::remove_dir_all(&src_dir);

    let fresh_state = AppState::default();
    let tp = restore_backup_fresh_in_dir(&fresh_dir, &backup_file, "5555", &fresh_state)
        .expect("fresh restore of archive must succeed")
        .expect("taxpayer must be restored");
    assert_eq!(tp.full_name, "Chidi Okafor");

    // Restored attachment must exist encrypted on disk and decrypt cleanly
    let restored_full = doc_store::resolve_doc_path(&fresh_dir, &rel_path);
    assert!(restored_full.exists(), "restored attachment file must exist");
    assert!(doc_store::is_encrypted_doc(
        &std::fs::read(&restored_full).unwrap()
    ));

    let preview =
        doc_store::prepare_file_for_external_app(&fresh_dir, &rel_path, &fresh_state).unwrap();
    assert_eq!(std::fs::read(&preview).unwrap(), secret);
    doc_store::cleanup_temp_previews(&fresh_state);

    let _ = std::fs::remove_file(&backup_file);
    let _ = std::fs::remove_dir_all(&fresh_dir);
}

#[test]
fn test_s18_deleting_draft_cleans_up_folder_and_allows_deleting_duplicated_parent() {
    use lagosfile_lib::commands::filing::{
        create_draft_filing_with_conn, delete_filing_in_dir, delete_income_entry_in_dir,
        duplicate_filing_with_conn, upsert_income_entry_with_conn,
    };
    use rusqlite::params;
    use serde_json::json;

    let dir = std::env::temp_dir().join(format!("lagosfile-s18-del-{}", uuid::Uuid::new_v4()));
    let state = AppState::default();
    setup_pin_in_dir(&dir, "654321", &state).unwrap();

    let (draft1_id, entry1_id, draft2_id, entry2_id) = {
        let guard = state.db.lock().unwrap();
        let db = guard.as_ref().unwrap();
        let conn = db.conn.lock().unwrap();
        let tp_id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO taxpayer (id, full_name, tin, created_at) VALUES (?1, 'Tobi', '1000099901', '2025-01-01T00:00:00Z')",
            params![tp_id],
        )
        .unwrap();
        let d1 = create_draft_filing_with_conn(&conn, 2022).unwrap();
        let e1 = upsert_income_entry_with_conn(
            &conn,
            &json!({
                "id": uuid::Uuid::new_v4().to_string(),
                "filingId": d1.id.to_string(),
                "incomeType": "employment",
                "grossAmountNgn": 3_000_000.0,
                "isForeign": false,
                "isCgtExempt": false
            }),
        )
        .unwrap();
        // Duplicate d1 -> d2 so d2 has parent_filing_id = d1.id
        let d2 = duplicate_filing_with_conn(&conn, &d1.id.to_string()).unwrap();
        let e2: String = conn
            .query_row(
                "SELECT id FROM income_entry WHERE filing_id=?1",
                params![d2.id.to_string()],
                |r| r.get(0),
            )
            .unwrap();
        (d1.id.to_string(), e1, d2.id.to_string(), e2)
    };

    let tmp_file = dir.join("receipt.txt");
    std::fs::write(&tmp_file, b"draft1 receipt").unwrap();
    let att1 = attach_document_in_dir(
        &dir,
        &entry1_id,
        "income_entry",
        tmp_file.to_str().unwrap(),
        "receipt.txt",
        "txt",
        14,
        &state,
    )
    .unwrap();
    let att1_path = doc_store::resolve_doc_path(&dir, att1["filePath"].as_str().unwrap());
    let att1_folder = att1_path.parent().unwrap().to_path_buf();
    assert!(att1_path.exists());

    // Delete Draft 1 even though Draft 2 references it via parent_filing_id!
    delete_filing_in_dir(&dir, &draft1_id, &state).expect("deleting duplicated Draft must succeed");
    assert!(!att1_path.exists(), "deleted draft attachment file must be removed");
    assert!(!att1_folder.exists(), "deleted draft entry folder must be removed");

    // Draft 2's parent_filing_id is now NULL, and no document rows remain for entry1
    {
        let guard = state.db.lock().unwrap();
        let db = guard.as_ref().unwrap();
        let conn = db.conn.lock().unwrap();
        let parent: Option<String> = conn
            .query_row(
                "SELECT parent_filing_id FROM filing WHERE id=?1",
                params![draft2_id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(parent, None);
        let leftover_docs: i64 = conn
            .query_row(
                "SELECT COUNT(1) FROM document WHERE parent_entry_id=?1",
                params![entry1_id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(leftover_docs, 0);
    }

    // Deleting a single entry also cleans up its attachment file and row
    let att2 = attach_document_in_dir(
        &dir,
        &entry2_id,
        "income_entry",
        tmp_file.to_str().unwrap(),
        "receipt.txt",
        "txt",
        14,
        &state,
    )
    .unwrap();
    let att2_path = doc_store::resolve_doc_path(&dir, att2["filePath"].as_str().unwrap());
    assert!(att2_path.exists());
    delete_income_entry_in_dir(&dir, &entry2_id, &state).unwrap();
    assert!(!att2_path.exists(), "deleted entry attachment file must be removed");

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn test_s18_shared_file_survives_single_row_delete_and_orphan_sweep_removes_stray_files() {
    use lagosfile_lib::commands::auth::unlock_db_in_dir;
    use lagosfile_lib::commands::document::delete_document_in_dir;
    use rusqlite::params;

    let dir = std::env::temp_dir().join(format!("lagosfile-s18-ref-{}", uuid::Uuid::new_v4()));
    let state = AppState::default();
    setup_pin_in_dir(&dir, "654321", &state).unwrap();
    let (_filing_id, entry_id) = seed_taxpayer_and_filing(&state);

    let tmp_file = dir.join("shared.txt");
    std::fs::write(&tmp_file, b"shared content").unwrap();
    let att1 = attach_document_in_dir(
        &dir,
        &entry_id,
        "income_entry",
        tmp_file.to_str().unwrap(),
        "shared.txt",
        "txt",
        14,
        &state,
    )
    .unwrap();
    let doc1_id = att1["id"].as_str().unwrap().to_string();
    let rel_path = att1["filePath"].as_str().unwrap().to_string();
    let full_path = doc_store::resolve_doc_path(&dir, &rel_path);

    // Insert a second document row referencing the exact same file_path
    let doc2_id = uuid::Uuid::new_v4().to_string();
    {
        let guard = state.db.lock().unwrap();
        let db = guard.as_ref().unwrap();
        let conn = db.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO document (id,parent_entry_id,parent_entry_type,file_path,file_name,file_type,file_size_bytes,uploaded_at)
             VALUES (?1,?2,'income_entry',?3,'shared.txt','txt',14,'2025-01-01T00:00:00Z')",
            params![doc2_id, entry_id, rel_path],
        )
        .unwrap();
    }

    // Deleting row 1 must NOT delete the file while row 2 still references it
    delete_document_in_dir(&dir, &doc1_id, &state).unwrap();
    assert!(full_path.exists(), "file referenced by two rows must survive deleting one");

    // Deleting row 2 now leaves zero references, so the file is removed
    delete_document_in_dir(&dir, &doc2_id, &state).unwrap();
    assert!(!full_path.exists(), "file must be removed once last reference is deleted");

    // Drop an orphaned stray file under documents/ and unlock to verify startup sweep removes it
    let orphan_dir = dir.join("documents").join("orphan-entry-id");
    std::fs::create_dir_all(&orphan_dir).unwrap();
    let orphan_file = orphan_dir.join("stray.enc");
    std::fs::write(&orphan_file, b"orphan bytes").unwrap();
    assert!(orphan_file.exists());

    let restarted_state = AppState::default();
    unlock_db_in_dir(&dir, "654321", &restarted_state).unwrap();
    assert!(!orphan_file.exists(), "startup orphan sweep must delete unreferenced file");
    assert!(!orphan_dir.exists(), "startup orphan sweep must prune empty orphan folder");

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn test_attach_sanitizes_path_traversal_and_cross_os_resolve_preserves_docs() {
    let dir = std::env::temp_dir().join(format!("lagosfile-sec-doc-{}", uuid::Uuid::new_v4()));
    let state = AppState::default();
    setup_pin_in_dir(&dir, "1234", &state).unwrap();
    let (_filing_id, entry_id) = seed_taxpayer_and_filing(&state);

    let src = dir.join("input.pdf");
    std::fs::write(&src, b"receipt bytes").unwrap();

    // 1. Path traversal file_name must be sanitized into a safe path strictly inside documents/<entry_id>/
    let att = attach_document_in_dir(
        &dir,
        &entry_id,
        "income_entry",
        src.to_str().unwrap(),
        "../../evil\\..\\receipt.pdf",
        "pdf",
        13,
        &state,
    )
    .expect("attach with untrusted filename must sanitize safely");
    let rel = att["filePath"].as_str().unwrap();
    assert!(rel.starts_with(&format!("documents/{}/", entry_id)), "unexpected rel path: {rel}");
    assert!(!rel.contains(".."), "path must not contain traversal: {rel}");
    assert!(doc_store::validate_safe_rel_doc_path(rel).is_ok());

    // 2. Cross-OS legacy absolute paths (POSIX path on Windows, Windows path on POSIX) resolve to app_dir/documents/...
    let posix_stored = format!("/Users/alice/LagosFile/documents/{}/unix_doc.enc", entry_id);
    let win_stored = format!("C:\\Users\\alice\\LagosFile\\documents\\{}\\win_doc.enc", entry_id);
    assert_eq!(
        doc_store::resolve_doc_path(&dir, &posix_stored),
        dir.join(format!("documents/{}/unix_doc.enc", entry_id))
    );
    assert_eq!(
        doc_store::resolve_doc_path(&dir, &win_stored),
        dir.join(format!("documents/{}/win_doc.enc", entry_id))
    );

    // 3. Create actual encrypted files for both cross-OS paths, insert rows, and verify unlock normalizes
    //    their paths and orphan sweep does NOT delete them!
    let doc_key = {
        let guard = state.db.lock().unwrap();
        doc_store::get_or_create_doc_key(guard.as_ref().unwrap()).unwrap().0
    };
    let unix_file = dir.join(format!("documents/{}/unix_doc.enc", entry_id));
    let win_file = dir.join(format!("documents/{}/win_doc.enc", entry_id));
    doc_store::write_encrypted_doc_atomic(&unix_file, b"unix payload", &doc_key).unwrap();
    doc_store::write_encrypted_doc_atomic(&win_file, b"win payload", &doc_key).unwrap();
    {
        let guard = state.db.lock().unwrap();
        let conn = guard.as_ref().unwrap().conn.lock().unwrap();
        conn.execute(
            "INSERT INTO document (id,parent_entry_id,parent_entry_type,file_path,file_name,file_type,file_size_bytes,uploaded_at)
             VALUES ('doc-unix',?1,'income_entry',?2,'unix_doc.pdf','pdf',12,'2025-01-01T00:00:00Z')",
            params![entry_id, posix_stored],
        ).unwrap();
        conn.execute(
            "INSERT INTO document (id,parent_entry_id,parent_entry_type,file_path,file_name,file_type,file_size_bytes,uploaded_at)
             VALUES ('doc-win',?1,'income_entry',?2,'win_doc.pdf','pdf',11,'2025-01-01T00:00:00Z')",
            params![entry_id, win_stored],
        ).unwrap();
    }
    lagosfile_lib::commands::auth::persist_db_in_dir(&dir, &state).unwrap();

    let restarted = AppState::default();
    unlock_db_in_dir(&dir, "1234", &restarted).unwrap();
    assert!(unix_file.exists(), "cross-OS POSIX-pathed doc must not be swept as orphan");
    assert!(win_file.exists(), "cross-OS Windows-pathed doc must not be swept as orphan");

    // Verify paths were normalized to portable relative paths even though files were already encrypted.
    {
        let guard = restarted.db.lock().unwrap();
        let conn = guard.as_ref().unwrap().conn.lock().unwrap();
        let u_path: String = conn
            .query_row("SELECT file_path FROM document WHERE id='doc-unix'", [], |r| r.get(0))
            .unwrap();
        let w_path: String = conn
            .query_row("SELECT file_path FROM document WHERE id='doc-win'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(u_path, format!("documents/{}/unix_doc.enc", entry_id));
        assert_eq!(w_path, format!("documents/{}/win_doc.enc", entry_id));
    }

    let _ = std::fs::remove_dir_all(&dir);
}
