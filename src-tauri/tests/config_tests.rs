use lagosfile_lib::db::AppDb;
use lagosfile_lib::services::config::ConfigService;
use serde_json::json;

#[test]
fn test_get_and_save_config() {
    let db = AppDb::open_in_memory().unwrap();

    // Initial active config (seeded by schema.sql)
    let active = ConfigService::get_active(&db).expect("Failed to get active config");
    assert!(active.is_active);

    // Save new config
    let new_config = json!({
        "versionLabel": "2026-v1",
        "governedBy": "NTA 2026",
        "bands": "[]",
        "reliefCaps": "{}",
        "cgtThresholds": "{}",
        "allowanceRates": "{}"
    });

    let saved = ConfigService::save(&db, new_config).expect("Failed to save config");
    assert_eq!(saved.version_label, "2026-v1");
    assert!(saved.is_active);

    // Verify old config is inactive
    let conn = db.conn.lock().unwrap();
    let old_active_count: i32 = conn
        .query_row(
            "SELECT count(*) FROM tax_config WHERE version_label != '2026-v1' AND is_active=1",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(old_active_count, 0);
}
