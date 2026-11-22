mod common;

use common::{app_locked, app_with_db, seed_draft, seed_profile, with_conn, NOT_PERSISTED};
use lagosfile_lib::{
    commands::filing::{
        compute_filing, confirm_filing, confirm_filing_with_conn, create_draft_filing,
        delete_allowance, delete_filing, delete_income_entry, delete_relief_entry,
        duplicate_filing, estimate_tax, get_filing, get_prior_year_allowances, list_allowances,
        list_filings, list_income_entries, list_relief_entries, mark_filing_submitted,
        record_payment, save_allowances, save_income_entries, save_relief_entries,
        upsert_allowance, upsert_income_entry, upsert_relief_entry, EstimateAllowance,
        EstimateIncome, EstimateRelief,
    },
    AppState,
};
use rusqlite::params;
use serde_json::json;
use tauri::Manager;

fn income(filing_id: &str, amount: f64) -> serde_json::Value {
    json!({
        "filingId": filing_id,
        "incomeType": "employment",
        "description": "Salary",
        "grossAmountNgn": amount,
        "incomeDate": "2024-06-30",
    })
}

fn insert_document(app: &tauri::App<tauri::test::MockRuntime>, parent: &str, ptype: &str) {
    with_conn(app, |conn| {
        conn.execute(
            "INSERT INTO document (id,parent_entry_id,parent_entry_type,file_path,file_name,file_type,file_size_bytes,uploaded_at)
             VALUES (?1,?2,?3,'documents/x/a.enc','a.pdf','pdf',10,'2025-01-01T00:00:00Z')",
            params![uuid::Uuid::new_v4().to_string(), parent, ptype],
        )
        .unwrap();
    });
}

#[tokio::test]
async fn locked_state_rejects_every_filing_command() {
    let app = app_locked();
    let s = || app.state::<AppState>();
    let id = "x".to_string();
    assert_eq!(list_filings(s()).await.unwrap_err(), NOT_PERSISTED);
    assert_eq!(
        get_filing(id.clone(), s()).await.unwrap_err(),
        NOT_PERSISTED
    );
    assert_eq!(
        create_draft_filing(2024, s()).await.unwrap_err(),
        NOT_PERSISTED
    );
    assert_eq!(
        confirm_filing(id.clone(), None, s()).await.unwrap_err(),
        NOT_PERSISTED
    );
    assert_eq!(
        mark_filing_submitted(id.clone(), s()).await.unwrap_err(),
        NOT_PERSISTED
    );
    assert_eq!(
        record_payment(id.clone(), None, None, None, s())
            .await
            .unwrap_err(),
        NOT_PERSISTED
    );
    assert_eq!(
        delete_filing(id.clone(), s()).await.unwrap_err(),
        NOT_PERSISTED
    );
    assert_eq!(
        duplicate_filing(id.clone(), s()).await.unwrap_err(),
        NOT_PERSISTED
    );
    assert_eq!(
        list_income_entries(id.clone(), s()).await.unwrap_err(),
        NOT_PERSISTED
    );
    assert_eq!(
        list_allowances(id.clone(), s()).await.unwrap_err(),
        NOT_PERSISTED
    );
    assert_eq!(
        list_relief_entries(id.clone(), s()).await.unwrap_err(),
        NOT_PERSISTED
    );
    assert_eq!(
        get_prior_year_allowances(2024, s()).await.unwrap_err(),
        NOT_PERSISTED
    );
    assert_eq!(
        compute_filing(id.clone(), s()).await.unwrap_err(),
        NOT_PERSISTED
    );
    assert_eq!(
        delete_income_entry(id.clone(), s()).await.unwrap_err(),
        NOT_PERSISTED
    );
    assert_eq!(
        delete_allowance(id.clone(), s()).await.unwrap_err(),
        NOT_PERSISTED
    );
    assert_eq!(
        delete_relief_entry(id.clone(), s()).await.unwrap_err(),
        NOT_PERSISTED
    );
    assert_eq!(
        upsert_income_entry(json!({}), s()).await.unwrap_err(),
        NOT_PERSISTED
    );
    assert_eq!(
        upsert_allowance(json!({}), s()).await.unwrap_err(),
        NOT_PERSISTED
    );
    assert_eq!(
        upsert_relief_entry(json!({}), s()).await.unwrap_err(),
        NOT_PERSISTED
    );
    assert_eq!(
        save_income_entries(id.clone(), vec![], vec![], s())
            .await
            .unwrap_err(),
        NOT_PERSISTED
    );
    assert_eq!(
        estimate_tax(vec![], vec![], vec![], None, s())
            .await
            .unwrap_err(),
        NOT_PERSISTED
    );
}

#[tokio::test]
async fn create_draft_command_inserts_row_then_fails_persist_without_key() {
    let app = app_with_db();
    let s = || app.state::<AppState>();

    let no_profile = create_draft_filing(2024, s()).await.unwrap_err();
    assert!(no_profile.contains("No profile found"), "{no_profile}");

    seed_profile(&app);
    assert_eq!(
        create_draft_filing(2024, s()).await.unwrap_err(),
        NOT_PERSISTED
    );
    let filings = list_filings(s()).await.unwrap();
    assert_eq!(filings.len(), 1);
    assert_eq!(filings[0].year_of_assessment, 2024);
    assert_eq!(filings[0].status, "Draft");

    let dup = create_draft_filing(2024, s()).await.unwrap_err();
    assert!(dup.contains("already exists"), "{dup}");
    let future = create_draft_filing(2999, s()).await.unwrap_err();
    assert!(future.contains("past years"), "{future}");
}

#[tokio::test]
async fn list_filings_orders_by_year_desc_and_get_filing_reads_one() {
    let app = app_with_db();
    let s = || app.state::<AppState>();
    seed_profile(&app);
    let older = seed_draft(&app, 2022);
    let newer = seed_draft(&app, 2024);

    let filings = list_filings(s()).await.unwrap();
    let ids: Vec<String> = filings.iter().map(|f| f.id.to_string()).collect();
    assert_eq!(ids, vec![newer.clone(), older.clone()]);

    let got = get_filing(older.clone(), s()).await.unwrap();
    assert_eq!(got.year_of_assessment, 2022);
    assert!(got.tax_config_id.is_some());
    assert!(get_filing("missing".into(), s()).await.is_err());
}

#[tokio::test]
async fn income_entry_commands_upsert_list_and_delete_with_documents() {
    let app = app_with_db();
    let s = || app.state::<AppState>();
    seed_profile(&app);
    let fid = seed_draft(&app, 2024);

    assert_eq!(
        upsert_income_entry(income(&fid, 4_000_000.0), s())
            .await
            .unwrap_err(),
        NOT_PERSISTED
    );
    let entries = list_income_entries(fid.clone(), s()).await.unwrap();
    assert_eq!(entries.len(), 1);
    let entry = &entries[0];
    assert_eq!(entry.income_type, "employment");
    assert_eq!(entry.gross_amount_ngn, 4_000_000.0);
    assert_eq!(
        entry.income_date,
        chrono::NaiveDate::from_ymd_opt(2024, 6, 30)
    );
    assert!(entry.documents.is_empty());

    let entry_id = entry.id.to_string();
    insert_document(&app, &entry_id, "income_entry");
    let entries = list_income_entries(fid.clone(), s()).await.unwrap();
    assert_eq!(entries[0].documents.len(), 1);
    assert_eq!(entries[0].documents[0].file_name, "a.pdf");

    let bad = upsert_income_entry(json!({ "filingId": fid, "grossAmountNgn": 1.0 }), s())
        .await
        .unwrap_err();
    assert!(bad.contains("incomeType"), "{bad}");

    assert_eq!(
        delete_income_entry(entry_id.clone(), s())
            .await
            .unwrap_err(),
        NOT_PERSISTED
    );
    assert!(list_income_entries(fid.clone(), s())
        .await
        .unwrap()
        .is_empty());
    let docs: i64 = with_conn(&app, |c| {
        c.query_row("SELECT COUNT(*) FROM document", [], |r| r.get(0))
            .unwrap()
    });
    assert_eq!(docs, 0, "deleting the entry removes its document rows");
}

#[tokio::test]
async fn allowance_and_relief_commands_round_trip() {
    let app = app_with_db();
    let s = || app.state::<AppState>();
    seed_profile(&app);
    let fid = seed_draft(&app, 2024);

    let allowance = json!({
        "filingId": fid,
        "assetDescription": "Laptop",
        "assetType": "plant_machinery",
        "assetCost": 1_200_000.0,
        "acquisitionDate": "2024-02-01",
        "taxWrittenDownValue": 0.0,
        "annualAllowanceRate": 0.25,
        "annualAllowanceAmount": 300_000.0,
    });
    assert_eq!(
        upsert_allowance(allowance, s()).await.unwrap_err(),
        NOT_PERSISTED
    );
    let allowances = list_allowances(fid.clone(), s()).await.unwrap();
    assert_eq!(allowances.len(), 1);
    assert_eq!(allowances[0].asset_description, "Laptop");
    assert_eq!(
        allowances[0].acquisition_date,
        chrono::NaiveDate::from_ymd_opt(2024, 2, 1)
    );
    let bad = upsert_allowance(
        json!({ "filingId": fid, "assetType": "x", "assetCost": 1.0, "annualAllowanceRate": 2.0 }),
        s(),
    )
    .await
    .unwrap_err();
    assert!(bad.contains("between 0 and 1"), "{bad}");

    let relief = json!({
        "filingId": fid,
        "reliefType": "pension",
        "claimedAmount": 200_000.0,
        "whtDate": "2024-03-03",
        "description": "RSA",
    });
    assert_eq!(
        upsert_relief_entry(relief, s()).await.unwrap_err(),
        NOT_PERSISTED
    );
    let reliefs = list_relief_entries(fid.clone(), s()).await.unwrap();
    assert_eq!(reliefs.len(), 1);
    assert_eq!(reliefs[0].relief_type, "pension");
    assert_eq!(reliefs[0].claimed_amount, 200_000.0);
    assert_eq!(
        reliefs[0].wht_date,
        chrono::NaiveDate::from_ymd_opt(2024, 3, 3)
    );
    let bad = upsert_relief_entry(json!({ "filingId": fid, "reliefType": "x" }), s())
        .await
        .unwrap_err();
    assert!(bad.contains("claimedAmount"), "{bad}");

    let ca_id = allowances[0].id.to_string();
    let re_id = reliefs[0].id.to_string();
    let cross = delete_allowance(re_id.clone(), s()).await.unwrap_err();
    assert!(cross.contains("does not belong"), "{cross}");

    assert_eq!(
        delete_allowance(ca_id, s()).await.unwrap_err(),
        NOT_PERSISTED
    );
    assert_eq!(
        delete_relief_entry(re_id, s()).await.unwrap_err(),
        NOT_PERSISTED
    );
    assert!(list_allowances(fid.clone(), s()).await.unwrap().is_empty());
    assert!(list_relief_entries(fid, s()).await.unwrap().is_empty());
}

#[tokio::test]
async fn batch_save_commands_commit_in_memory_and_validate() {
    let app = app_with_db();
    let s = || app.state::<AppState>();
    seed_profile(&app);
    let fid = seed_draft(&app, 2024);

    let err = save_income_entries(
        fid.clone(),
        vec![income("", 1_000.0), income(&fid, 2_000.0)],
        vec![],
        s(),
    )
    .await
    .unwrap_err();
    assert_eq!(err, NOT_PERSISTED);
    assert_eq!(
        list_income_entries(fid.clone(), s()).await.unwrap().len(),
        2
    );

    let mismatch = save_income_entries(fid.clone(), vec![income("other", 1.0)], vec![], s())
        .await
        .unwrap_err();
    assert!(mismatch.contains("does not match"), "{mismatch}");
    let not_obj = save_income_entries(fid.clone(), vec![json!(5)], vec![], s())
        .await
        .unwrap_err();
    assert!(not_obj.contains("JSON object"), "{not_obj}");

    let ids: Vec<String> = list_income_entries(fid.clone(), s())
        .await
        .unwrap()
        .iter()
        .map(|e| e.id.to_string())
        .collect();
    save_income_entries(fid.clone(), vec![], ids, s())
        .await
        .unwrap_err();
    assert!(list_income_entries(fid.clone(), s())
        .await
        .unwrap()
        .is_empty());

    let ca = json!({ "assetType": "furniture", "assetCost": 500_000.0, "annualAllowanceRate": 0.2, "acquisitionDate": "2024-01-01" });
    assert_eq!(
        save_allowances(fid.clone(), vec![ca], vec![], s())
            .await
            .unwrap_err(),
        NOT_PERSISTED
    );
    assert_eq!(list_allowances(fid.clone(), s()).await.unwrap().len(), 1);

    let re = json!({ "reliefType": "nhf", "claimedAmount": 50_000.0 });
    assert_eq!(
        save_relief_entries(fid.clone(), vec![re], vec![], s())
            .await
            .unwrap_err(),
        NOT_PERSISTED
    );
    assert_eq!(
        list_relief_entries(fid.clone(), s()).await.unwrap().len(),
        1
    );

    let missing = save_relief_entries("nope".into(), vec![], vec![], s())
        .await
        .unwrap_err();
    assert!(missing.contains("not found"), "{missing}");
}

#[tokio::test]
async fn lifecycle_commands_confirm_submit_pay_and_guard_status() {
    let app = app_with_db();
    let s = || app.state::<AppState>();
    seed_profile(&app);
    let fid = seed_draft(&app, 2024);
    save_income_entries(fid.clone(), vec![income(&fid, 6_000_000.0)], vec![], s())
        .await
        .unwrap_err();

    let computed = compute_filing(fid.clone(), s()).await.unwrap();
    assert_eq!(computed.total_gross_income, 6_000_000.0);
    assert!(computed.final_tax_payable > 0.0);

    let early = mark_filing_submitted(fid.clone(), s()).await.unwrap_err();
    assert!(early.contains("Only Confirmed"), "{early}");
    let draft_pay = record_payment(fid.clone(), None, None, None, s())
        .await
        .unwrap_err();
    assert!(draft_pay.contains("confirmed filing"), "{draft_pay}");

    assert_eq!(
        confirm_filing(fid.clone(), None, s()).await.unwrap_err(),
        NOT_PERSISTED
    );
    let confirmed = get_filing(fid.clone(), s()).await.unwrap();
    assert_eq!(confirmed.status, "Confirmed");
    assert_eq!(
        confirmed.filing_reference.as_deref(),
        Some("LIRS/REF/2024/00001")
    );
    assert_eq!(
        confirmed.final_tax_payable,
        Some(computed.final_tax_payable)
    );

    let again = confirm_filing(fid.clone(), None, s()).await.unwrap_err();
    assert!(again.contains("Only Draft"), "{again}");
    let del = delete_filing(fid.clone(), s()).await.unwrap_err();
    assert!(del.contains("Only Draft filings can be deleted"), "{del}");
    let edit = upsert_income_entry(income(&fid, 1.0), s())
        .await
        .unwrap_err();
    assert!(edit.contains("Only Draft"), "{edit}");

    let bad_date = record_payment(fid.clone(), Some("31/12/2025".into()), None, None, s())
        .await
        .unwrap_err();
    assert!(bad_date.contains("YYYY-MM-DD"), "{bad_date}");
    let neg = record_payment(fid.clone(), None, None, Some(-1.0), s())
        .await
        .unwrap_err();
    assert!(neg.contains("zero or more"), "{neg}");
    let nan = record_payment(fid.clone(), None, None, Some(f64::NAN), s())
        .await
        .unwrap_err();
    assert!(nan.contains("zero or more"), "{nan}");
    let missing = record_payment("nope".into(), None, None, None, s())
        .await
        .unwrap_err();
    assert!(missing.contains("not found"), "{missing}");

    let paid = record_payment(
        fid.clone(),
        Some("2025-03-31".into()),
        Some("  RCPT-1  ".into()),
        Some(1000.0),
        s(),
    )
    .await
    .unwrap_err();
    assert_eq!(paid, NOT_PERSISTED);
    let f = get_filing(fid.clone(), s()).await.unwrap();
    assert_eq!(f.payment_reference.as_deref(), Some("RCPT-1"));
    assert_eq!(f.amount_paid, Some(1000.0));
    assert_eq!(f.payment_date, chrono::NaiveDate::from_ymd_opt(2025, 3, 31));

    record_payment(fid.clone(), None, Some("   ".into()), None, s())
        .await
        .unwrap_err();
    assert_eq!(
        get_filing(fid.clone(), s())
            .await
            .unwrap()
            .payment_reference,
        None
    );

    assert_eq!(
        mark_filing_submitted(fid.clone(), s()).await.unwrap_err(),
        NOT_PERSISTED
    );
    let submitted = get_filing(fid.clone(), s()).await.unwrap();
    assert_eq!(submitted.status, "Submitted");
    assert!(submitted.submitted_at.is_some());
    let gone = mark_filing_submitted("nope".into(), s()).await.unwrap_err();
    assert!(gone.contains("not found"), "{gone}");
}

#[tokio::test]
async fn delete_and_duplicate_commands() {
    let app = app_with_db();
    let s = || app.state::<AppState>();
    seed_profile(&app);
    let fid = seed_draft(&app, 2023);
    save_income_entries(fid.clone(), vec![income(&fid, 3_000_000.0)], vec![], s())
        .await
        .unwrap_err();
    let entry_id = list_income_entries(fid.clone(), s()).await.unwrap()[0]
        .id
        .to_string();
    insert_document(&app, &entry_id, "income_entry");

    let missing = duplicate_filing("nope".into(), s()).await.unwrap_err();
    assert!(!missing.is_empty());

    assert_eq!(
        duplicate_filing(fid.clone(), s()).await.unwrap_err(),
        NOT_PERSISTED
    );
    let filings = list_filings(s()).await.unwrap();
    assert_eq!(filings.len(), 2);
    let copy = filings.iter().find(|f| f.id.to_string() != fid).unwrap();
    assert_eq!(copy.year_of_assessment, 2024);
    let copied = list_income_entries(copy.id.to_string(), s()).await.unwrap();
    assert_eq!(copied.len(), 1);
    assert_eq!(copied[0].gross_amount_ngn, 3_000_000.0);

    let not_found = delete_filing("nope".into(), s()).await.unwrap_err();
    assert!(not_found.contains("not found"), "{not_found}");
    assert_eq!(
        delete_filing(fid.clone(), s()).await.unwrap_err(),
        NOT_PERSISTED
    );
    assert!(get_filing(fid.clone(), s()).await.is_err());
    let docs: i64 = with_conn(&app, |c| {
        c.query_row("SELECT COUNT(*) FROM document", [], |r| r.get(0))
            .unwrap()
    });
    assert_eq!(docs, 0);
}

#[tokio::test]
async fn prior_year_allowances_advance_wdv_from_confirmed_filing() {
    let app = app_with_db();
    let s = || app.state::<AppState>();
    seed_profile(&app);
    assert!(get_prior_year_allowances(2024, s())
        .await
        .unwrap()
        .is_empty());

    let fid = seed_draft(&app, 2023);
    let assets = vec![
        json!({ "assetDescription": "Car", "assetType": "motor_vehicle", "assetCost": 1_000_000.0,
                "acquisitionDate": "2023-01-01", "taxWrittenDownValue": 0.0, "annualAllowanceRate": 0.25 }),
        json!({ "assetDescription": "Old", "assetType": "furniture", "assetCost": 100_000.0,
                "acquisitionDate": "2020-01-01", "taxWrittenDownValue": 10_000.0, "annualAllowanceRate": 0.5 }),
    ];
    save_allowances(fid.clone(), assets, vec![], s())
        .await
        .unwrap_err();
    with_conn(&app, |c| confirm_filing_with_conn(c, &fid).unwrap());

    let rows = get_prior_year_allowances(2024, s()).await.unwrap();
    assert_eq!(rows.len(), 1, "fully depreciated assets are skipped");
    let car = &rows[0];
    assert_eq!(car["assetDescription"], "Car");
    assert_eq!(car["taxWrittenDownValue"].as_f64().unwrap(), 750_000.0);
    assert_eq!(car["annualAllowanceAmount"].as_f64().unwrap(), 250_000.0);
    assert_eq!(car["priorYoa"], 2023);
}

#[tokio::test]
async fn estimate_tax_command_uses_year_specific_config() {
    let app = app_with_db();
    let s = || app.state::<AppState>();
    let make = || {
        (
            vec![EstimateIncome {
                income_type: "employment".into(),
                gross_amount_ngn: 10_000_000.0,
                ..Default::default()
            }],
            vec![EstimateAllowance {
                asset_type: "plant_machinery".into(),
                asset_cost: 400_000.0,
                tax_written_down_value: None,
            }],
            vec![EstimateRelief {
                relief_type: "pension".into(),
                claimed_amount: 100_000.0,
            }],
        )
    };
    let (i, a, r) = make();
    let pita = estimate_tax(i, a, r, Some(2024), s()).await.unwrap();
    let (i, a, r) = make();
    let nta = estimate_tax(i, a, r, Some(2026), s()).await.unwrap();
    let (i, a, r) = make();
    let active = estimate_tax(i, a, r, None, s()).await.unwrap();
    assert_eq!(pita.total_gross_income, 10_000_000.0);
    assert!(pita.final_tax_payable > 0.0);
    assert!(nta.final_tax_payable > 0.0);
    assert_ne!(pita.final_tax_payable, nta.final_tax_payable);
    assert!(active.final_tax_payable > 0.0);
}
