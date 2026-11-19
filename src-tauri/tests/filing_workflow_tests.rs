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

        // Confirm once: recomputes server-side (3,000,000 - 100,000 CA - 100,000 pension = 2,800,000 -> 56k + 220k = 276,000)
        let confirmed = confirm_filing_with_conn(&conn, &fid).expect("first confirm must succeed");
        assert_eq!(confirmed.status, "Confirmed");
        assert_eq!(confirmed.tax_payable, Some(276_000.0));
        assert_eq!(confirmed.final_tax_payable, Some(276_000.0));
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
        assert_eq!(exported["filing"]["taxPayable"].as_f64(), Some(276_000.0));
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

    // PDF export contains the formatted tax_payable figure (276,000.00)
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
        all_text.contains("276,000.00"),
        "PDF must render saved tax_payable (276,000.00), got: {all_text}"
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
