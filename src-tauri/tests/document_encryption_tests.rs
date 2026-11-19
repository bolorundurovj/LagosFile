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
         VALUES (?1, ?2, 2025, 'Confirmed', '2026-01-10T00:00:00Z', 5000000.0, 5000000.0, 628000.0, 0.0, 628000.0, 50000.0, 628000.0)",
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
