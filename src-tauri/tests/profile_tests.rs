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

#[test]
fn test_update_profile_filters_by_id_and_updates_tin() {
    use lagosfile_lib::commands::profile::update_profile_with_conn;
    use rusqlite::params;

    let db = AppDb::open_in_memory().unwrap();
    let p1 = ProfileService::create(
        &db,
        json!({ "fullName": "First User", "tin": "1111111111111" }),
    )
    .unwrap();
    let p2 = ProfileService::create(
        &db,
        json!({ "fullName": "Second User", "tin": "2222222222222" }),
    )
    .unwrap();

    let conn = db.conn.lock().unwrap();
    let updated = update_profile_with_conn(
        &conn,
        &json!({
            "id": p1.id.to_string(),
            "fullName": "First Updated",
            "tin": "9999999999999",
            "address": "Victoria Island"
        }),
    )
    .unwrap();
    assert_eq!(updated.id, p1.id);
    assert_eq!(updated.full_name, "First Updated");
    assert_eq!(updated.tin, "9999999999999");

    // Second row must remain completely untouched (proves WHERE id=?)
    let (p2_name, p2_tin): (String, String) = conn
        .query_row(
            "SELECT full_name, tin FROM taxpayer WHERE id=?1",
            params![p2.id.to_string()],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(p2_name, "Second User");
    assert_eq!(p2_tin, "2222222222222");
}
