use lagosfile_lib::db::AppDb;
use lagosfile_lib::services::profile::ProfileService;
use serde_json::json;

#[test]
fn test_create_and_get_profile() {
    let db = AppDb::open_in_memory().unwrap();

    let input = json!({
        "fullName": "John Doe",
        "tin": "12345678901",
        "email": "john@example.com"
    });

    // Create
    let created = ProfileService::create(&db, input).expect("Failed to create profile");
    assert_eq!(created.full_name, "John Doe");
    assert_eq!(created.email, Some("john@example.com".to_string()));

    // Get
    let fetched = ProfileService::get(&db)
        .expect("Failed to get profile")
        .unwrap();
    assert_eq!(fetched.id, created.id);
    assert_eq!(fetched.full_name, "John Doe");
}
