use lagosfile_lib::db::AppDb;
use lagosfile_lib::services::config::ConfigService;
use serde_json::json;

#[test]
fn test_save_config_then_get_active_returns_it() {
    let db = AppDb::open_in_memory().unwrap();

    let config = json!({
        "versionLabel": "2026-v2",
        "governedBy": "NTA 2026",
        "bands": "[]",
        "reliefCaps": "{}",
        "cgtThresholds": "{}",
        "allowanceRates": "{}"
    });

    let saved = ConfigService::save(&db, config).unwrap();
    assert_eq!(saved.version_label, "2026-v2");
    assert!(saved.is_active);

    let active = ConfigService::get_active(&db).unwrap();
    assert_eq!(active.id, saved.id);
    assert_eq!(active.version_label, "2026-v2");
}

#[test]
fn test_saving_new_config_deactivates_previous() {
    let db = AppDb::open_in_memory().unwrap();

    let first = ConfigService::save(
        &db,
        json!({
            "versionLabel": "v1",
            "governedBy": "NTA 2025",
            "bands": "[]",
            "reliefCaps": "{}",
            "cgtThresholds": "{}",
            "allowanceRates": "{}"
        }),
    )
    .unwrap();
    assert!(first.is_active);

    let second = ConfigService::save(
        &db,
        json!({
            "versionLabel": "v2",
            "governedBy": "NTA 2026",
            "bands": "[]",
            "reliefCaps": "{}",
            "cgtThresholds": "{}",
            "allowanceRates": "{}"
        }),
    )
    .unwrap();
    assert!(second.is_active);

    let active = ConfigService::get_active(&db).unwrap();
    assert_eq!(active.id, second.id);
    assert_eq!(active.version_label, "v2");

    let conn = db.conn.lock().unwrap();
    let old_active_count: i32 = conn
        .query_row(
            "SELECT count(*) FROM tax_config WHERE id != ?1 AND is_active = 1",
            rusqlite::params![second.id.to_string()],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(old_active_count, 0);

    let first_is_active: i32 = conn
        .query_row(
            "SELECT is_active FROM tax_config WHERE id = ?1",
            rusqlite::params![first.id.to_string()],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(first_is_active, 0);
}

#[test]
fn test_get_active_returns_most_recently_saved() {
    let db = AppDb::open_in_memory().unwrap();

    ConfigService::save(
        &db,
        json!({
            "versionLabel": "first",
            "governedBy": "NTA 2024",
            "bands": "[]",
            "reliefCaps": "{}",
            "cgtThresholds": "{}",
            "allowanceRates": "{}"
        }),
    )
    .unwrap();

    ConfigService::save(
        &db,
        json!({
            "versionLabel": "second",
            "governedBy": "NTA 2025",
            "bands": "[]",
            "reliefCaps": "{}",
            "cgtThresholds": "{}",
            "allowanceRates": "{}"
        }),
    )
    .unwrap();

    ConfigService::save(
        &db,
        json!({
            "versionLabel": "third",
            "governedBy": "NTA 2026",
            "bands": "[]",
            "reliefCaps": "{}",
            "cgtThresholds": "{}",
            "allowanceRates": "{}"
        }),
    )
    .unwrap();

    let active = ConfigService::get_active(&db).unwrap();
    assert_eq!(active.version_label, "third");
}

#[test]
fn test_config_serialization_empty_bands() {
    let db = AppDb::open_in_memory().unwrap();

    let saved = ConfigService::save(
        &db,
        json!({
            "versionLabel": "empty-bands",
            "governedBy": "NTA 2026",
            "bands": "[]",
            "reliefCaps": "{}",
            "cgtThresholds": "{}",
            "allowanceRates": "{}"
        }),
    )
    .unwrap();

    let active = ConfigService::get_active(&db).unwrap();
    assert_eq!(active.id, saved.id);
    assert!(active.bands.is_empty());
}

#[test]
fn test_config_serialization_with_bands() {
    let db = AppDb::open_in_memory().unwrap();

    let bands = json!([
        {"lower": 0, "upper": 300000, "rate": 0.07},
        {"lower": 300000, "upper": 600000, "rate": 0.11}
    ]);
    let _saved = ConfigService::save(
        &db,
        json!({
            "versionLabel": "with-bands",
            "governedBy": "NTA 2026",
            "bands": bands,
            "reliefCaps": "{}",
            "cgtThresholds": "{}",
            "allowanceRates": "{}"
        }),
    )
    .unwrap();

    let active = ConfigService::get_active(&db).unwrap();
    assert_eq!(active.bands.len(), 2);
    assert_eq!(active.bands[0].lower, 0.0);
    assert_eq!(active.bands[0].upper, Some(300000.0));
    assert_eq!(active.bands[0].rate, 0.07);
    assert_eq!(active.bands[1].lower, 300000.0);
    assert_eq!(active.bands[1].rate, 0.11);
}

#[test]
fn test_config_with_relief_caps() {
    let db = AppDb::open_in_memory().unwrap();

    let _saved = ConfigService::save(
        &db,
        json!({
            "versionLabel": "with-relief",
            "governedBy": "NTA 2026",
            "bands": "[]",
            "reliefCaps": {"rentReliefCap": 250000, "rentReliefRate": 0.15},
            "cgtThresholds": "{}",
            "allowanceRates": "{}"
        }),
    )
    .unwrap();

    let active = ConfigService::get_active(&db).unwrap();
    assert_eq!(active.relief_caps.rent_relief_cap, 250000.0);
    assert_eq!(active.relief_caps.rent_relief_rate, 0.15);
}

#[test]
fn test_config_default_values_when_missing_fields() {
    let db = AppDb::open_in_memory().unwrap();

    let saved = ConfigService::save(
        &db,
        json!({
            "versionLabel": "defaults-test",
            "governedBy": "NTA 2026",
            "bands": "[]",
            "reliefCaps": "{}",
            "cgtThresholds": "{}",
            "allowanceRates": "{}"
        }),
    )
    .unwrap();

    assert_eq!(saved.version_label, "defaults-test");
    assert_eq!(saved.governed_by, "NTA 2026");

    let active = ConfigService::get_active(&db).unwrap();
    assert!(active.bands.is_empty());
}

#[test]
fn test_multiple_configs_only_one_active() {
    let db = AppDb::open_in_memory().unwrap();

    for i in 1..=5 {
        ConfigService::save(
            &db,
            json!({
                "versionLabel": format!("v{}", i),
                "governedBy": "NTA 2026",
                "bands": "[]",
                "reliefCaps": "{}",
                "cgtThresholds": "{}",
                "allowanceRates": "{}"
            }),
        )
        .unwrap();
    }

    let conn = db.conn.lock().unwrap();
    let active_count: i32 = conn
        .query_row(
            "SELECT count(*) FROM tax_config WHERE is_active = 1",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(active_count, 1);

    let total_count: i32 = conn
        .query_row("SELECT count(*) FROM tax_config", [], |r| r.get(0))
        .unwrap();
    assert_eq!(total_count, 6);
}

#[test]
fn test_config_minimum_tax_rate_default() {
    let db = AppDb::open_in_memory().unwrap();

    let saved = ConfigService::save(
        &db,
        json!({
            "versionLabel": "tax-rate-test",
            "governedBy": "NTA 2026",
            "bands": "[]",
            "reliefCaps": "{}",
            "cgtThresholds": "{}",
            "allowanceRates": "{}"
        }),
    )
    .unwrap();

    assert_eq!(saved.minimum_tax_rate, 0.01);
}

#[test]
fn test_config_custom_minimum_tax_rate() {
    let db = AppDb::open_in_memory().unwrap();

    let saved = ConfigService::save(
        &db,
        json!({
            "versionLabel": "custom-rate",
            "governedBy": "NTA 2026",
            "bands": "[]",
            "reliefCaps": "{}",
            "cgtThresholds": "{}",
            "allowanceRates": "{}",
            "minimumTaxRate": 0.015
        }),
    )
    .unwrap();

    assert!((saved.minimum_tax_rate - 0.015).abs() < f64::EPSILON);
}
