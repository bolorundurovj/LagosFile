use lagosfile_lib::db::AppDb;
use lagosfile_lib::services::filing::FilingService;

#[test]
fn test_create_and_list_filings() {
    let db = AppDb::open_in_memory().unwrap();

    // 1. Create taxpayer first (required by foreign key)
    let taxpayer_input = serde_json::json!({
        "fullName": "Test Taxpayer",
        "tin": "12345678901"
    });
    let taxpayer =
        lagosfile_lib::services::profile::ProfileService::create(&db, taxpayer_input).unwrap();
    let taxpayer_id = taxpayer.id;

    // 2. Create draft
    let draft =
        FilingService::create_draft(&db, taxpayer_id, 2025, "v1").expect("Failed to create draft");
    assert_eq!(draft.year_of_assessment, 2025);
    assert_eq!(draft.status, "Draft");

    // List
    let filings = FilingService::list(&db).expect("Failed to list filings");
    assert_eq!(filings.len(), 1);
    assert_eq!(filings[0].id, draft.id);

    // Mark submitted
    FilingService::mark_submitted(&db, &draft.id.to_string()).expect("Failed to mark submitted");
    let filings = FilingService::list(&db).unwrap();
    assert_eq!(filings[0].status, "Submitted");

    // Delete (should fail for Submitted)
    let result = FilingService::delete(&db, &draft.id.to_string());
    assert!(result.is_err());

    // Create another draft and delete it
    let draft2 = FilingService::create_draft(&db, taxpayer_id, 2024, "v1").unwrap();
    FilingService::delete(&db, &draft2.id.to_string()).expect("Failed to delete draft");
    let filings = FilingService::list(&db).unwrap();
    assert_eq!(filings.len(), 1); // Only the submitted one remains
}
