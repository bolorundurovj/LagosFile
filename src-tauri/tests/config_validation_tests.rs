use lagosfile_lib::{
    db::AppDb,
    models::{CgtThresholds, FilingStatus},
    services::config::ConfigService,
};
use serde_json::{json, Value};
use std::str::FromStr;

fn base() -> Value {
    json!({
        "versionLabel": "Validation",
        "bands": [
            {"lower": 0, "upper": 800000, "rate": 0.0},
            {"lower": 800000, "upper": null, "rate": 0.15}
        ],
        "reliefCaps": {},
        "cgtThresholds": {},
        "allowanceRates": {}
    })
}

fn save_err(patch: impl FnOnce(&mut Value)) -> String {
    let db = AppDb::open_in_memory().unwrap();
    let mut cfg = base();
    patch(&mut cfg);
    let conn = db.conn.lock().unwrap();
    ConfigService::save_with_conn(&conn, &cfg)
        .unwrap_err()
        .to_string()
}

#[test]
fn bands_must_be_a_valid_array_or_json_string() {
    assert!(save_err(|c| c["bands"] = json!(5)).contains("must provide a bands array"));
    assert!(save_err(|c| c["bands"] = json!([{"lower": "x"}])).contains("Invalid tax bands:"));
    assert!(save_err(|c| c["bands"] = json!("not json")).contains("Invalid tax bands JSON"));
    assert!(
        save_err(|c| c["bands"] = json!([{"lower": -1, "upper": null, "rate": 0.1}]))
            .contains("invalid lower bound")
    );
}

#[test]
fn relief_caps_are_validated() {
    assert!(save_err(|c| c["reliefCaps"] = json!(null)).contains("valid reliefCaps object"));
    assert!(
        save_err(|c| c["reliefCaps"] = json!({"rentReliefCap": "big"}))
            .contains("Invalid reliefCaps:")
    );
    assert!(save_err(|c| c["reliefCaps"] = json!("{oops")).contains("Invalid reliefCaps JSON"));
    assert!(
        save_err(|c| c["reliefCaps"] = json!({"rentReliefCap": -5.0})).contains("Rent relief cap")
    );
    assert!(
        save_err(|c| c["reliefCaps"] = json!({"rentReliefRate": 1.5})).contains("Rent relief rate")
    );
    assert!(save_err(|c| c["reliefCaps"] = json!({"nhfCap": -1.0}))
        .contains("nhfCap must be a non-negative"));
}

#[test]
fn cgt_thresholds_and_allowance_rates_are_validated() {
    assert!(save_err(|c| c["cgtThresholds"] = json!(1)).contains("valid cgtThresholds object"));
    assert!(
        save_err(|c| c["cgtThresholds"] = json!({"gainThreshold": "x"}))
            .contains("Invalid cgtThresholds:")
    );
    assert!(save_err(|c| c["cgtThresholds"] = json!("[")).contains("Invalid cgtThresholds JSON"));
    assert!(
        save_err(|c| c["cgtThresholds"] = json!({"gainThreshold": -1.0}))
            .contains("CGT thresholds must be non-negative")
    );

    assert!(save_err(|c| c["allowanceRates"] = json!(true)).contains("valid allowanceRates object"));
    assert!(save_err(|c| c["allowanceRates"] = json!({"car": "fast"}))
        .contains("Invalid allowanceRates:"));
    assert!(save_err(|c| c["allowanceRates"] = json!("{")).contains("Invalid allowanceRates JSON"));
    assert!(save_err(|c| c["allowanceRates"] = json!({"car": 1.2}))
        .contains("Allowance rate for 'car'"));
}

#[test]
fn minimum_tax_rate_must_be_numeric_and_in_range() {
    assert!(save_err(|c| c["minimumTaxRate"] = json!("one"))
        .contains("Minimum tax rate must be a number"));
    assert!(save_err(|c| c["minimumTaxRate"] = json!(2.0)).contains("must be between 0 and 1"));
}

#[test]
fn duplicate_labels_are_rejected_and_strings_are_accepted() {
    let db = AppDb::open_in_memory().unwrap();
    let conn = db.conn.lock().unwrap();
    let mut cfg = base();
    cfg["bands"] = json!(r#"[{"lower":0,"upper":null,"rate":0.1}]"#);
    cfg["reliefCaps"] = json!(r#"{"pensionCap":100000}"#);
    cfg["cgtThresholds"] = json!(r#"{"gainThreshold":5}"#);
    cfg["allowanceRates"] = json!(r#"{"car":0.25}"#);
    cfg["minimumTaxRate"] = json!(0.01);
    let saved = ConfigService::save_with_conn(&conn, &cfg).unwrap();
    assert_eq!(saved.bands.len(), 1);
    assert_eq!(saved.relief_caps.pension_cap, Some(100_000.0));
    assert_eq!(saved.cgt_thresholds.gain_threshold, 5.0);
    assert_eq!(saved.cgt_thresholds.proceeds_threshold, 150_000_000.0);
    assert_eq!(saved.allowance_rates.get("car"), Some(&0.25));
    assert_eq!(saved.minimum_tax_rate, 0.01);

    let err = ConfigService::save_with_conn(&conn, &cfg)
        .unwrap_err()
        .to_string();
    assert!(err.contains("already exists"), "{err}");
}

#[test]
fn filing_status_round_trips_through_strings() {
    for status in [
        FilingStatus::Draft,
        FilingStatus::Confirmed,
        FilingStatus::Submitted,
    ] {
        let text = status.to_string();
        assert_eq!(FilingStatus::from_str(&text).unwrap(), status);
    }
    assert!(FilingStatus::from_str("Archived")
        .unwrap_err()
        .to_string()
        .contains("Unknown status: Archived"));

    let defaults = CgtThresholds::default();
    assert_eq!(defaults.proceeds_threshold, 150_000_000.0);
    assert_eq!(defaults.gain_threshold, 10_000_000.0);
}
