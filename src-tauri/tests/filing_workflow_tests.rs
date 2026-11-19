use lagosfile_lib::db::AppDb;
use lagosfile_lib::services::filing::FilingService;
use lagosfile_lib::services::profile::ProfileService;
use serde_json::json;
use uuid::Uuid;

fn create_taxpayer(db: &AppDb) -> Uuid {
    let input = json!({
        "fullName": "Workflow Taxpayer",
        "tin": "55566677788"
    });
    ProfileService::create(db, input).unwrap().id
}

#[test]
fn test_create_draft_then_confirm() {
    let db = AppDb::open_in_memory().unwrap();
    let taxpayer_id = create_taxpayer(&db);
    let filing = FilingService::create_draft(&db, taxpayer_id, 2024, "v1").unwrap();
    assert_eq!(filing.status, "Draft");
    assert!(filing.confirmed_at.is_none());

    let conn = db.conn.lock().unwrap();
    conn.execute(
        "UPDATE filing SET status = 'Confirmed', confirmed_at = ?1, filing_reference = 'LIRS/REF/2024/00001' WHERE id = ?2",
        rusqlite::params![chrono::Utc::now().to_rfc3339(), filing.id.to_string()],
    ).unwrap();

    let status: String = conn
        .query_row(
            "SELECT status FROM filing WHERE id = ?1",
            rusqlite::params![filing.id.to_string()],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(status, "Confirmed");

    let confirmed_at: Option<String> = conn
        .query_row(
            "SELECT confirmed_at FROM filing WHERE id = ?1",
            rusqlite::params![filing.id.to_string()],
            |row| row.get(0),
        )
        .unwrap();
    assert!(confirmed_at.is_some());
}

#[test]
fn test_create_draft_then_mark_submitted() {
    let db = AppDb::open_in_memory().unwrap();
    let taxpayer_id = create_taxpayer(&db);
    let filing = FilingService::create_draft(&db, taxpayer_id, 2024, "v1").unwrap();
    assert_eq!(filing.status, "Draft");

    FilingService::mark_submitted(&db, &filing.id.to_string()).unwrap();

    let filings = FilingService::list(&db).unwrap();
    assert_eq!(filings.len(), 1);
    assert_eq!(filings[0].status, "Submitted");
}

#[test]
fn test_delete_confirmed_filing_fails() {
    let db = AppDb::open_in_memory().unwrap();
    let taxpayer_id = create_taxpayer(&db);
    let filing = FilingService::create_draft(&db, taxpayer_id, 2024, "v1").unwrap();

    let conn = db.conn.lock().unwrap();
    conn.execute(
        "UPDATE filing SET status = 'Confirmed' WHERE id = ?1",
        rusqlite::params![filing.id.to_string()],
    )
    .unwrap();
    drop(conn);

    let result = FilingService::delete(&db, &filing.id.to_string());
    assert!(result.is_err());
}

#[test]
fn test_delete_submitted_filing_fails() {
    let db = AppDb::open_in_memory().unwrap();
    let taxpayer_id = create_taxpayer(&db);
    let filing = FilingService::create_draft(&db, taxpayer_id, 2024, "v1").unwrap();

    FilingService::mark_submitted(&db, &filing.id.to_string()).unwrap();

    let result = FilingService::delete(&db, &filing.id.to_string());
    assert!(result.is_err());
}

#[test]
fn test_get_single_filing_by_id() {
    let db = AppDb::open_in_memory().unwrap();
    let taxpayer_id = create_taxpayer(&db);
    let filing = FilingService::create_draft(&db, taxpayer_id, 2024, "v1").unwrap();

    let conn = db.conn.lock().unwrap();
    let fetched: (String, i32, String) = conn
        .query_row(
            "SELECT id, year_of_assessment, status FROM filing WHERE id = ?1",
            rusqlite::params![filing.id.to_string()],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .unwrap();
    drop(conn);

    assert_eq!(fetched.0, filing.id.to_string());
    assert_eq!(fetched.1, 2024);
    assert_eq!(fetched.2, "Draft");
}

#[test]
fn test_list_filings_ordered_by_year_desc() {
    let db = AppDb::open_in_memory().unwrap();
    let taxpayer_id = create_taxpayer(&db);

    let f1 = FilingService::create_draft(&db, taxpayer_id, 2022, "v1").unwrap();
    let f2 = FilingService::create_draft(&db, taxpayer_id, 2024, "v1").unwrap();
    let f3 = FilingService::create_draft(&db, taxpayer_id, 2023, "v1").unwrap();

    let filings = FilingService::list(&db).unwrap();
    assert_eq!(filings.len(), 3);

    let years: Vec<i32> = filings.iter().map(|f| f.year_of_assessment).collect();
    assert_eq!(years[0], 2024);
    assert_eq!(years[1], 2023);
    assert_eq!(years[2], 2022);

    assert!(filings.iter().any(|f| f.id == f1.id));
    assert!(filings.iter().any(|f| f.id == f2.id));
    assert!(filings.iter().any(|f| f.id == f3.id));
}

#[test]
fn test_confirm_then_submit_status_progression() {
    let db = AppDb::open_in_memory().unwrap();
    let taxpayer_id = create_taxpayer(&db);
    let filing = FilingService::create_draft(&db, taxpayer_id, 2024, "v1").unwrap();
    assert_eq!(filing.status, "Draft");

    let conn = db.conn.lock().unwrap();
    conn.execute(
        "UPDATE filing SET status = 'Confirmed', confirmed_at = ?1, filing_reference = 'LIRS/REF/2024/00001' WHERE id = ?2",
        rusqlite::params![chrono::Utc::now().to_rfc3339(), filing.id.to_string()],
    ).unwrap();
    let status: String = conn
        .query_row(
            "SELECT status FROM filing WHERE id = ?1",
            rusqlite::params![filing.id.to_string()],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(status, "Confirmed");
    drop(conn);

    FilingService::mark_submitted(&db, &filing.id.to_string()).unwrap();

    let filings = FilingService::list(&db).unwrap();
    assert_eq!(filings[0].status, "Submitted");
}

#[test]
fn test_multiple_filings_same_status_ordering() {
    let db = AppDb::open_in_memory().unwrap();
    let taxpayer_id = create_taxpayer(&db);

    let f2022 = FilingService::create_draft(&db, taxpayer_id, 2022, "v1").unwrap();
    let f2023 = FilingService::create_draft(&db, taxpayer_id, 2023, "v1").unwrap();
    let f2024 = FilingService::create_draft(&db, taxpayer_id, 2024, "v1").unwrap();

    let filings = FilingService::list(&db).unwrap();
    assert_eq!(filings[0].id, f2024.id);
    assert_eq!(filings[1].id, f2023.id);
    assert_eq!(filings[2].id, f2022.id);
}

#[test]
fn test_delete_draft_then_other_filings_remain() {
    let db = AppDb::open_in_memory().unwrap();
    let taxpayer_id = create_taxpayer(&db);

    let f1 = FilingService::create_draft(&db, taxpayer_id, 2022, "v1").unwrap();
    let f2 = FilingService::create_draft(&db, taxpayer_id, 2023, "v1").unwrap();
    let f3 = FilingService::create_draft(&db, taxpayer_id, 2024, "v1").unwrap();

    FilingService::delete(&db, &f2.id.to_string()).unwrap();

    let filings = FilingService::list(&db).unwrap();
    assert_eq!(filings.len(), 2);
    let ids: Vec<String> = filings.iter().map(|f| f.id.to_string()).collect();
    assert!(ids.contains(&f1.id.to_string()));
    assert!(ids.contains(&f3.id.to_string()));
    assert!(!ids.contains(&f2.id.to_string()));
}

#[test]
fn test_filing_fields_populated_correctly() {
    let db = AppDb::open_in_memory().unwrap();
    let taxpayer_id = create_taxpayer(&db);
    let filing = FilingService::create_draft(&db, taxpayer_id, 2024, "v1").unwrap();

    assert_eq!(filing.year_of_assessment, 2024);
    assert_eq!(filing.status, "Draft");
    assert_eq!(filing.tax_config_version, "v1");
    assert!(filing.filing_reference.is_none());
    assert!(filing.confirmed_at.is_none());
    assert!(filing.total_income_ngn.is_none());
    assert!(filing.chargeable_income.is_none());
    assert!(filing.tax_payable.is_none());
    assert!(filing.net_tax_payable.is_none());
    assert!(filing.minimum_tax.is_none());
    assert!(filing.final_tax_payable.is_none());
    assert!(filing.parent_filing_id.is_none());
}

#[test]
fn test_s12_confirm_recomputes_saves_tax_payable_and_rejects_mutations() {
    use lagosfile_lib::{
        commands::{
            auth::setup_pin_in_dir,
            document::attach_document_in_dir,
            export::{export_filing_json_with_conn, export_filing_pdf_in_dir},
            filing::{
                confirm_filing_with_conn, delete_allowance_with_conn,
                delete_income_entry_with_conn, delete_relief_entry_with_conn,
                mark_filing_submitted_with_conn, upsert_allowance_with_conn,
                upsert_income_entry_with_conn, upsert_relief_entry_with_conn,
            },
        },
        AppState,
    };

    let dir = std::env::temp_dir().join(format!("lagosfile-s12-{}", uuid::Uuid::new_v4()));
    let state = AppState::default();
    setup_pin_in_dir(&dir, "1234", &state).unwrap();

    let (filing_id, income_id, ca_id, relief_id) = {
        let guard = state.db.lock().unwrap();
        let db = guard.as_ref().unwrap();
        let tp_id = create_taxpayer(db);
        let filing = FilingService::create_draft(db, tp_id, 2024, "v1").unwrap();
        let fid = filing.id.to_string();

        let conn = db.conn.lock().unwrap();
        let inc_id = upsert_income_entry_with_conn(
            &conn,
            &json!({
                "filingId": fid,
                "incomeType": "employment",
                "description": "Salary",
                "grossAmountNgn": 3_000_000.0
            }),
        )
        .unwrap();
        let ca_id = upsert_allowance_with_conn(
            &conn,
            &json!({
                "filingId": fid,
                "assetDescription": "Laptop",
                "assetType": "computer_laptop",
                "assetCost": 400_000.0,
                "acquisitionDate": "2024-01-01",
                "taxWrittenDownValue": 400_000.0,
                "annualAllowanceRate": 0.25,
                "annualAllowanceAmount": 100_000.0
            }),
        )
        .unwrap();
        let rel_id = upsert_relief_entry_with_conn(
            &conn,
            &json!({
                "filingId": fid,
                "reliefType": "pension",
                "claimedAmount": 100_000.0,
                "approvedAmount": 100_000.0
            }),
        )
        .unwrap();

        // Confirm once: recomputes server-side against active NTA 2025 config
        // (3,000,000 - 100,000 CA - 100,000 pension = 2,800,000 -> 0..800k @ 0% + 2m @ 15% = 300,000)
        let confirmed = confirm_filing_with_conn(&conn, &fid).expect("first confirm must succeed");
        assert_eq!(confirmed.status, "Confirmed");
        assert_eq!(confirmed.tax_payable, Some(300_000.0));
        assert_eq!(confirmed.final_tax_payable, Some(300_000.0));
        assert_eq!(
            confirmed.filing_reference.as_deref(),
            Some("LIRS/REF/2024/00001")
        );

        // Confirming twice must fail
        let err_twice = confirm_filing_with_conn(&conn, &fid).expect_err("confirming twice must fail");
        assert!(err_twice.contains("Only Draft filings"));

        // Mutating entries on Confirmed filing must fail
        assert!(upsert_income_entry_with_conn(
            &conn,
            &json!({ "filingId": fid, "incomeType": "business", "grossAmountNgn": 500_000.0 })
        )
        .is_err());
        assert!(delete_income_entry_with_conn(&conn, &inc_id).is_err());
        assert!(upsert_allowance_with_conn(
            &conn,
            &json!({
                "filingId": fid, "assetDescription": "Monitor", "assetType": "monitor",
                "assetCost": 200_000.0, "acquisitionDate": "2024-01-01",
                "taxWrittenDownValue": 200_000.0, "annualAllowanceRate": 0.25, "annualAllowanceAmount": 50_000.0
            })
        )
        .is_err());
        assert!(delete_allowance_with_conn(&conn, &ca_id).is_err());
        assert!(upsert_relief_entry_with_conn(
            &conn,
            &json!({ "filingId": fid, "reliefType": "nhf", "claimedAmount": 50_000.0, "approvedAmount": 50_000.0 })
        )
        .is_err());
        assert!(delete_relief_entry_with_conn(&conn, &rel_id).is_err());

        // Mark submitted records submitted_at
        let submitted = mark_filing_submitted_with_conn(&conn, &fid).unwrap();
        assert_eq!(submitted.status, "Submitted");
        assert!(submitted.submitted_at.is_some());

        // Export JSON contains non-null taxPayable and submittedAt
        let json_path = dir.join("filing.json");
        export_filing_json_with_conn(&conn, &fid, json_path.to_str().unwrap()).unwrap();
        let exported: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&json_path).unwrap()).unwrap();
        assert_eq!(exported["filing"]["taxPayable"].as_f64(), Some(300_000.0));
        assert!(exported["filing"]["submittedAt"].as_str().is_some());

        (fid, inc_id, ca_id, rel_id)
    };

    // Attaching a document to an entry of a Submitted filing must fail
    let dummy_file = dir.join("note.txt");
    std::fs::write(&dummy_file, b"cannot attach").unwrap();
    let att_err = attach_document_in_dir(
        &dir,
        &income_id,
        "income_entry",
        dummy_file.to_str().unwrap(),
        "note.txt",
        "txt",
        13,
        &state,
    )
    .expect_err("attaching document to Submitted filing must fail");
    assert!(att_err.contains("Only Draft filings"));

    // PDF export contains the formatted tax_payable figure (300,000.00)
    let pdf_path = dir.join("filing.pdf");
    export_filing_pdf_in_dir(&dir, &filing_id, pdf_path.to_str().unwrap(), false, None, &state)
        .unwrap();
    let pdf_doc = lopdf::Document::load(&pdf_path).unwrap();
    let all_text: String = pdf_doc
        .get_pages()
        .keys()
        .filter_map(|p| pdf_doc.extract_text(&[*p]).ok())
        .collect::<Vec<_>>()
        .join("\n");
    assert!(
        all_text.contains("300,000.00"),
        "PDF must render saved tax_payable (300,000.00), got: {all_text}"
    );

    let _ = (ca_id, relief_id);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn test_s12_two_confirmations_never_share_a_reference() {
    use lagosfile_lib::commands::filing::confirm_filing_with_conn;

    let db = AppDb::open_in_memory().unwrap();
    let tp_id = create_taxpayer(&db);
    let f1 = FilingService::create_draft(&db, tp_id, 2024, "v1").unwrap();
    let f2 = FilingService::create_draft(&db, tp_id, 2024, "v1").unwrap();

    let conn = db.conn.lock().unwrap();
    let c1 = confirm_filing_with_conn(&conn, &f1.id.to_string()).unwrap();
    // Even if the first confirmed row were removed from filing table, counter still increments!
    conn.execute(
        "DELETE FROM filing WHERE id=?1",
        rusqlite::params![f1.id.to_string()],
    )
    .unwrap();
    let c2 = confirm_filing_with_conn(&conn, &f2.id.to_string()).unwrap();

    assert_eq!(c1.filing_reference.as_deref(), Some("LIRS/REF/2024/00001"));
    assert_eq!(c2.filing_reference.as_deref(), Some("LIRS/REF/2024/00002"));
    assert_ne!(c1.filing_reference, c2.filing_reference);
}

#[test]
fn test_s17_amend_copies_entries_and_attachments_independently() {
    use lagosfile_lib::{
        commands::{
            auth::setup_pin_in_dir,
            document::{attach_document_in_dir, delete_document_in_dir},
            filing::{
                amend_filing_in_dir, confirm_filing_with_conn, create_draft_filing_with_conn,
                upsert_allowance_with_conn, upsert_income_entry_with_conn,
                upsert_relief_entry_with_conn,
            },
        },
        db::doc_store,
        AppState,
    };
    use rusqlite::params;
    use serde_json::json;

    let dir = std::env::temp_dir().join(format!("lagosfile_s17_amend_{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let state = AppState::default();
    setup_pin_in_dir(&dir, "123456", &state).unwrap();

    let src_doc = dir.join("payslip.txt");
    let expected_bytes = b"Confidential 2024 payslip content";
    std::fs::write(&src_doc, expected_bytes).unwrap();

    let (parent_id, income_id) = {
        let guard = state.db.lock().unwrap();
        let db = guard.as_ref().unwrap();
        let conn = db.conn.lock().unwrap();
        let tp_id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO taxpayer (id, full_name, tin, created_at) VALUES (?1, 'Chidi', '1234500001', '2025-01-01T00:00:00Z')",
            params![tp_id],
        )
        .unwrap();
        let f = create_draft_filing_with_conn(&conn, 2024).unwrap();
        let fid = f.id.to_string();
        let ie_id = upsert_income_entry_with_conn(
            &conn,
            &json!({
                "id": uuid::Uuid::new_v4().to_string(),
                "filingId": fid,
                "incomeType": "employment",
                "description": "Salary",
                "grossAmountNgn": 8_000_000.0,
                "isForeign": false,
                "isCgtExempt": false
            }),
        )
        .unwrap();
        upsert_allowance_with_conn(
            &conn,
            &json!({
                "id": uuid::Uuid::new_v4().to_string(),
                "filingId": fid,
                "assetDescription": "Laptop",
                "assetType": "computer_laptop",
                "assetCost": 1_000_000.0,
                "acquisitionDate": "2024-02-01",
                "taxWrittenDownValue": 1_000_000.0,
                "annualAllowanceRate": 0.25,
                "annualAllowanceAmount": 250_000.0
            }),
        )
        .unwrap();
        upsert_relief_entry_with_conn(
            &conn,
            &json!({
                "id": uuid::Uuid::new_v4().to_string(),
                "filingId": fid,
                "reliefType": "wht",
                "claimedAmount": 100_000.0,
                "approvedAmount": 100_000.0,
                "whtRef": "WHT-2024-1"
            }),
        )
        .unwrap();
        (fid, ie_id)
    };

    let parent_doc = attach_document_in_dir(
        &dir,
        &income_id,
        "income_entry",
        src_doc.to_str().unwrap(),
        "payslip.txt",
        "txt",
        expected_bytes.len() as i64,
        &state,
    )
    .unwrap();
    let parent_doc_path = parent_doc["filePath"].as_str().unwrap().to_string();

    // Amending a Draft must fail
    assert!(amend_filing_in_dir(&dir, &parent_id, &state).is_err());

    // Confirm parent filing, then amend
    {
        let guard = state.db.lock().unwrap();
        let db = guard.as_ref().unwrap();
        let conn = db.conn.lock().unwrap();
        confirm_filing_with_conn(&conn, &parent_id).unwrap();
    }

    let amended = amend_filing_in_dir(&dir, &parent_id, &state).unwrap();
    assert_eq!(amended.status, "Draft");
    assert_eq!(amended.year_of_assessment, 2024);
    assert_eq!(amended.parent_filing_id.map(|u| u.to_string()), Some(parent_id.clone()));

    // Verify all entries and copied attachment exist on the amendment
    let (amend_doc_id, amend_doc_path, doc_key) = {
        let guard = state.db.lock().unwrap();
        let db = guard.as_ref().unwrap();
        let conn = db.conn.lock().unwrap();
        let amend_fid = amended.id.to_string();

        let amend_ie_id: String = conn
            .query_row(
                "SELECT id FROM income_entry WHERE filing_id=?1",
                params![amend_fid],
                |r| r.get(0),
            )
            .unwrap();
        assert_ne!(amend_ie_id, income_id);

        let ca_wdv: f64 = conn
            .query_row(
                "SELECT tax_written_down_value FROM capital_allowance WHERE filing_id=?1",
                params![amend_fid],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(ca_wdv, 1_000_000.0, "amendment keeps same-year WDV as-is");

        let wht_amt: f64 = conn
            .query_row(
                "SELECT claimed_amount FROM relief_entry WHERE filing_id=?1 AND relief_type='wht'",
                params![amend_fid],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(wht_amt, 100_000.0, "amendment preserves same-year WHT relief");

        let (doc_id, doc_path): (String, String) = conn
            .query_row(
                "SELECT id, file_path FROM document WHERE parent_entry_id=?1",
                params![amend_ie_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_ne!(doc_path, parent_doc_path, "amendment must not share file path with parent");
        assert!(doc_path.starts_with(&format!("documents/{amend_ie_id}/")));

        drop(conn);
        let key = doc_store::get_doc_key(db).unwrap().unwrap();
        (doc_id, doc_path, key)
    };

    // Both parent and amendment files decrypt to the original plaintext
    let amend_plain = doc_store::read_decrypted_doc(&dir, &amend_doc_path, &doc_key).unwrap();
    assert_eq!(amend_plain, expected_bytes);

    // Deleting the amendment's attachment leaves the parent's attachment intact and readable
    delete_document_in_dir(&dir, &amend_doc_id, &state).unwrap();
    let parent_plain = doc_store::read_decrypted_doc(&dir, &parent_doc_path, &doc_key).unwrap();
    assert_eq!(parent_plain, expected_bytes);

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn test_s17_duplicate_year_checks_and_rfc3339_timestamps() {
    use chrono::Datelike;
    use lagosfile_lib::{
        commands::filing::{create_draft_filing_with_conn, duplicate_filing_with_conn},
        db::AppDb,
    };
    use rusqlite::params;

    let current_year = chrono::Utc::now().year();
    let db = AppDb::open_in_memory().unwrap();
    let bytes = {
        let conn = db.conn.lock().unwrap();
        let tp_id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO taxpayer (id, full_name, tin, created_at) VALUES (?1, 'Yemi', '1234500002', '2025-01-01T00:00:00Z')",
            params![tp_id],
        )
        .unwrap();

        // Duplicating (current_year - 1) into current_year must fail
        let last_year = create_draft_filing_with_conn(&conn, current_year - 1).unwrap();
        let err_current = duplicate_filing_with_conn(&conn, &last_year.id.to_string())
            .expect_err("duplicating into current year must fail");
        assert!(err_current.contains("past years"));

        // Duplicating (current_year - 2) into (current_year - 1) which already exists must fail
        let two_ago = create_draft_filing_with_conn(&conn, current_year - 2).unwrap();
        let err_dup = duplicate_filing_with_conn(&conn, &two_ago.id.to_string())
            .expect_err("duplicating into existing year must fail");
        assert!(err_dup.contains("already exists"));

        // Duplicating (current_year - 4) into (current_year - 3) succeeds with an RFC 3339 timestamp
        let four_ago = create_draft_filing_with_conn(&conn, current_year - 4).unwrap();
        let before = chrono::Utc::now() - chrono::Duration::seconds(5);
        let duplicated = duplicate_filing_with_conn(&conn, &four_ago.id.to_string()).unwrap();
        let after = chrono::Utc::now() + chrono::Duration::seconds(5);
        assert_eq!(duplicated.year_of_assessment, current_year - 3);
        assert!(
            duplicated.created_at >= before && duplicated.created_at <= after,
            "duplicated created_at must round-trip as current RFC 3339 timestamp, got {}",
            duplicated.created_at
        );

        // Insert legacy SQLite datetime('now') rows to verify migration rewrites them to RFC 3339
        conn.execute(
            "UPDATE filing SET created_at = '2024-03-15 14:22:10' WHERE id = ?1",
            params![four_ago.id.to_string()],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO fx_cache (id, base_currency, quote_currency, rate, rate_date, source, fetched_at)
             VALUES ('fx-1', 'USD', 'NGN', 1500.0, '2024-03-15', 'test', '2024-03-15 09:05:00')",
            [],
        )
        .unwrap();
        drop(conn);
        db.serialize().unwrap()
    };

    let migrated = AppDb::open_in_memory().unwrap();
    migrated.load_from_bytes(&bytes).unwrap();
    let conn = migrated.conn.lock().unwrap();
    let migrated_filing_ts: String = conn
        .query_row(
            "SELECT created_at FROM filing WHERE year_of_assessment=?1",
            params![current_year - 4],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(migrated_filing_ts, "2024-03-15T14:22:10Z");
    assert!(chrono::DateTime::parse_from_rfc3339(&migrated_filing_ts).is_ok());

    let migrated_fx_ts: String = conn
        .query_row(
            "SELECT fetched_at FROM fx_cache WHERE id='fx-1'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(migrated_fx_ts, "2024-03-15T09:05:00Z");
    assert!(chrono::DateTime::parse_from_rfc3339(&migrated_fx_ts).is_ok());
}
