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
