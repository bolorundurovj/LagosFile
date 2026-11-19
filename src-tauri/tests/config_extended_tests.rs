use lagosfile_lib::commands::config::{export_config_json_with_conn, import_config_json_with_conn};
use lagosfile_lib::db::AppDb;
use lagosfile_lib::services::config::ConfigService;
use serde_json::json;

fn valid_bands() -> serde_json::Value {
    json!([
        {"lower": 0, "upper": 800000, "rate": 0.0},
        {"lower": 800000, "upper": null, "rate": 0.15}
    ])
}

#[test]
fn test_save_config_then_get_active_returns_it() {
    let db = AppDb::open_in_memory().unwrap();

    let config = json!({
        "versionLabel": "2026-v2",
        "governedBy": "NTA 2026",
        "bands": valid_bands(),
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
            "bands": valid_bands(),
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
            "bands": valid_bands(),
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

    for (label, gov) in [
        ("first", "NTA 2024"),
        ("second", "NTA 2025"),
        ("third", "NTA 2026"),
    ] {
        ConfigService::save(
            &db,
            json!({
                "versionLabel": label,
                "governedBy": gov,
                "bands": valid_bands(),
                "reliefCaps": "{}",
                "cgtThresholds": "{}",
                "allowanceRates": "{}"
            }),
        )
        .unwrap();
    }

    let active = ConfigService::get_active(&db).unwrap();
    assert_eq!(active.version_label, "third");
}

#[test]
fn test_config_serialization_with_bands() {
    let db = AppDb::open_in_memory().unwrap();

    let bands = json!([
        {"lower": 0, "upper": 300000, "rate": 0.07},
        {"lower": 300000, "upper": null, "rate": 0.11}
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
    assert_eq!(active.bands[1].upper, None);
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
            "bands": valid_bands(),
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
fn test_multiple_configs_only_one_active() {
    let db = AppDb::open_in_memory().unwrap();

    for i in 1..=5 {
        ConfigService::save(
            &db,
            json!({
                "versionLabel": format!("v{}", i),
                "governedBy": "NTA 2026",
                "bands": valid_bands(),
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
    assert_eq!(total_count, 7);
}

#[test]
fn test_config_minimum_tax_rate_default() {
    let db = AppDb::open_in_memory().unwrap();

    let saved = ConfigService::save(
        &db,
        json!({
            "versionLabel": "tax-rate-test",
            "governedBy": "NTA 2026",
            "bands": valid_bands(),
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
            "bands": valid_bands(),
            "reliefCaps": "{}",
            "cgtThresholds": "{}",
            "allowanceRates": "{}",
            "minimumTaxRate": 0.015
        }),
    )
    .unwrap();

    assert!((saved.minimum_tax_rate - 0.015).abs() < f64::EPSILON);
}

#[test]
fn test_s8_save_config_rejects_empty_and_duplicate_version_label() {
    let db = AppDb::open_in_memory().unwrap();

    let empty_res = ConfigService::save(
        &db,
        json!({
            "versionLabel": "   ",
            "governedBy": "NTA 2025",
            "bands": valid_bands(),
            "reliefCaps": {},
            "cgtThresholds": {},
            "allowanceRates": {}
        }),
    );
    assert!(empty_res.is_err());

    let first = ConfigService::save(
        &db,
        json!({
            "versionLabel": "Custom v2.0",
            "governedBy": "NTA 2025",
            "bands": valid_bands(),
            "reliefCaps": {},
            "cgtThresholds": {},
            "allowanceRates": {}
        }),
    )
    .unwrap();
    assert_eq!(first.version_label, "Custom v2.0");

    let dup = ConfigService::save(
        &db,
        json!({
            "versionLabel": "Custom v2.0",
            "governedBy": "NTA 2025",
            "bands": valid_bands(),
            "reliefCaps": {},
            "cgtThresholds": {},
            "allowanceRates": {}
        }),
    );
    assert!(dup.is_err());
    let active = ConfigService::get_active(&db).unwrap();
    assert_eq!(active.id, first.id);
}

#[test]
fn test_s20_invalid_bands_rejected_and_previous_config_stays_active() {
    let db = AppDb::open_in_memory().unwrap();
    let initial = ConfigService::get_active(&db).unwrap();

    let invalid_cases: Vec<(&str, serde_json::Value)> = vec![
        ("empty", json!([])),
        (
            "non-zero start",
            json!([{"lower": 100000, "upper": null, "rate": 0.15}]),
        ),
        (
            "gap between bands",
            json!([
                {"lower": 0, "upper": 800000, "rate": 0.0},
                {"lower": 900000, "upper": null, "rate": 0.15}
            ]),
        ),
        (
            "missing open-ended top band",
            json!([
                {"lower": 0, "upper": 800000, "rate": 0.0},
                {"lower": 800000, "upper": 3000000, "rate": 0.15}
            ]),
        ),
        (
            "open-ended band not last",
            json!([
                {"lower": 0, "upper": null, "rate": 0.0},
                {"lower": 800000, "upper": null, "rate": 0.15}
            ]),
        ),
        (
            "rate above 1",
            json!([{"lower": 0, "upper": null, "rate": 1.25}]),
        ),
        (
            "negative rate",
            json!([{"lower": 0, "upper": null, "rate": -0.05}]),
        ),
    ];

    for (name, bands) in invalid_cases {
        let res = ConfigService::save(
            &db,
            json!({
                "versionLabel": format!("bad-{name}"),
                "governedBy": "NTA 2025",
                "bands": bands,
                "reliefCaps": {},
                "cgtThresholds": {},
                "allowanceRates": {}
            }),
        );
        assert!(res.is_err(), "expected invalid band case '{name}' to fail");
        let active = ConfigService::get_active(&db).unwrap();
        assert_eq!(active.id, initial.id, "previous config must stay active after '{name}'");
    }
}

#[test]
fn test_s20_failed_insert_rolls_back_and_leaves_previous_config_active() {
    let db = AppDb::open_in_memory().unwrap();
    let initial = ConfigService::get_active(&db).unwrap();

    // Inject a trigger that aborts INSERT into tax_config right after UPDATE is_active=0
    {
        let conn = db.conn.lock().unwrap();
        conn.execute_batch(
            "CREATE TRIGGER fail_config_insert BEFORE INSERT ON tax_config
             BEGIN
                 SELECT RAISE(ABORT, 'simulated insert failure');
             END;",
        )
        .unwrap();
    }

    let res = ConfigService::save(
        &db,
        json!({
            "versionLabel": "should-rollback",
            "governedBy": "NTA 2025",
            "bands": valid_bands(),
            "reliefCaps": {},
            "cgtThresholds": {},
            "allowanceRates": {}
        }),
    );
    assert!(res.is_err());

    // Transaction rollback must have preserved the previous active config
    let active = ConfigService::get_active(&db).unwrap();
    assert_eq!(active.id, initial.id);
    assert!(active.is_active);
}

#[test]
fn test_s20_exported_config_imports_again() {
    let db = AppDb::open_in_memory().unwrap();
    let active = ConfigService::get_active(&db).unwrap();

    let conn = db.conn.lock().unwrap();
    let exported_json = export_config_json_with_conn(&conn, &active.id.to_string()).unwrap();

    // Re-importing the exported JSON string succeeds and preserves bands/rates/caps
    let reimported = import_config_json_with_conn(&conn, &exported_json).unwrap();
    assert_ne!(reimported.id, active.id);
    assert!(reimported.is_active);
    assert_eq!(reimported.bands.len(), active.bands.len());
    assert_eq!(reimported.minimum_tax_rate, active.minimum_tax_rate);
    assert_eq!(reimported.relief_caps.rent_relief_cap, active.relief_caps.rent_relief_cap);
}
