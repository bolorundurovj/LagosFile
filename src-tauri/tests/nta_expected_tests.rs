use lagosfile_lib::{models::*, services::computation::ComputationEngine};
use std::collections::HashMap;

/// Explicit NTA 2025 Fourth Schedule + s.30 TaxConfig built directly in the test
/// (independent of whatever seed config is currently in schema.sql).
fn nta_2025_config(minimum_tax_rate: f64) -> TaxConfig {
    let mut allowance_rates = HashMap::new();
    allowance_rates.insert("computer_laptop".to_string(), 0.25);
    allowance_rates.insert("router_networking".to_string(), 0.25);
    allowance_rates.insert("monitor".to_string(), 0.25);
    allowance_rates.insert("keyboard_peripherals".to_string(), 0.25);
    allowance_rates.insert("camera_recording".to_string(), 0.25);
    allowance_rates.insert("software_licence".to_string(), 0.25);
    allowance_rates.insert("other".to_string(), 0.25);

    TaxConfig {
        id: uuid::Uuid::new_v4(),
        version_label: "NTA 2025 Reference (Test)".to_string(),
        governed_by: "NTA 2025".to_string(),
        bands: vec![
            TaxBand {
                lower: 0.0,
                upper: Some(800_000.0),
                rate: 0.00,
            },
            TaxBand {
                lower: 800_000.0,
                upper: Some(3_000_000.0),
                rate: 0.15,
            },
            TaxBand {
                lower: 3_000_000.0,
                upper: Some(12_000_000.0),
                rate: 0.18,
            },
            TaxBand {
                lower: 12_000_000.0,
                upper: Some(25_000_000.0),
                rate: 0.21,
            },
            TaxBand {
                lower: 25_000_000.0,
                upper: Some(50_000_000.0),
                rate: 0.23,
            },
            TaxBand {
                lower: 50_000_000.0,
                upper: None,
                rate: 0.25,
            },
        ],
        relief_caps: ReliefCaps {
            rent_relief_cap: 500_000.0,
            rent_relief_rate: 0.20,
            pension_cap: None,
            nhis_cap: None,
            nhf_cap: None,
        },
        cgt_thresholds: CgtThresholds {
            proceeds_threshold: 150_000_000.0,
            gain_threshold: 10_000_000.0,
        },
        allowance_rates,
        minimum_tax_rate,
        is_active: true,
        last_modified: chrono::Utc::now(),
        modified_by: "test".to_string(),
    }
}

fn employment_entry(gross: f64) -> IncomeEntry {
    IncomeEntry {
        income_type: "employment".to_string(),
        gross_amount_ngn: gross,
        ..Default::default()
    }
}

fn relief(relief_type: &str, amount: f64) -> ReliefEntry {
    ReliefEntry {
        relief_type: relief_type.to_string(),
        claimed_amount: amount,
        approved_amount: amount,
        ..Default::default()
    }
}

fn assert_ngn_eq(actual: f64, expected: f64, label: &str) {
    assert!(
        (actual - expected).abs() < 0.01,
        "{label}: expected ₦{expected:.2}, got ₦{actual:.2}"
    );
}

#[test]
fn test_nta_fourth_schedule_under_800k_and_first_edge() {
    let cfg = nta_2025_config(0.0);

    let r_low = ComputationEngine::compute(&[employment_entry(500_000.0)], &[], &[], &cfg).unwrap();
    assert_ngn_eq(r_low.graduated_tax, 0.0, "₦500k graduated tax");
    assert_ngn_eq(r_low.final_tax_payable, 0.0, "₦500k final tax");

    let r_edge =
        ComputationEngine::compute(&[employment_entry(800_000.0)], &[], &[], &cfg).unwrap();
    assert_ngn_eq(r_edge.graduated_tax, 0.0, "₦800k edge graduated tax");
    assert_ngn_eq(r_edge.final_tax_payable, 0.0, "₦800k edge final tax");

    let r_just_over =
        ComputationEngine::compute(&[employment_entry(800_001.0)], &[], &[], &cfg).unwrap();
    assert_ngn_eq(r_just_over.graduated_tax, 0.15, "₦800,001 graduated tax");
}

#[test]
fn test_nta_fourth_schedule_every_band_edge() {
    let cfg = nta_2025_config(0.0);

    let cases: &[(f64, f64, &str)] = &[
        (2_000_000.0, 180_000.0, "Band 2 mid (₦2m)"),
        (3_000_000.0, 330_000.0, "Band 2 upper edge (₦3m)"),
        (5_000_000.0, 690_000.0, "Band 3 mid (₦5m)"),
        (12_000_000.0, 1_950_000.0, "Band 3 upper edge (₦12m)"),
        (25_000_000.0, 4_680_000.0, "Band 4 upper edge (₦25m)"),
        (50_000_000.0, 10_430_000.0, "Band 5 upper edge (₦50m)"),
        (60_000_000.0, 12_930_000.0, "Band 6 above ₦50m (₦60m)"),
    ];

    for &(gross, expected_tax, label) in cases {
        let res = ComputationEngine::compute(&[employment_entry(gross)], &[], &[], &cfg).unwrap();
        assert_ngn_eq(res.chargeable_income, gross, label);
        assert_ngn_eq(res.graduated_tax, expected_tax, label);
        assert_ngn_eq(res.final_tax_payable, expected_tax, label);
    }
}

#[test]
fn test_nta_s30_rent_relief_below_at_and_above_cap() {
    let cfg = nta_2025_config(0.0);
    let salary = vec![employment_entry(5_000_000.0)];

    // Below cap: 20% of ₦2,000,000 = ₦400,000 -> chargeable ₦4,600,000 -> tax ₦618,000
    let r_below =
        ComputationEngine::compute(&salary, &[], &[relief("rent", 2_000_000.0)], &cfg).unwrap();
    assert_ngn_eq(r_below.rent_relief_applied, 400_000.0, "rent relief below cap");
    assert_ngn_eq(r_below.chargeable_income, 4_600_000.0, "chargeable below cap");
    assert_ngn_eq(r_below.final_tax_payable, 618_000.0, "tax below cap");

    // Exactly at cap: 20% of ₦2,500,000 = ₦500,000 -> chargeable ₦4,500,000 -> tax ₦600,000
    let r_at =
        ComputationEngine::compute(&salary, &[], &[relief("rent", 2_500_000.0)], &cfg).unwrap();
    assert_ngn_eq(r_at.rent_relief_applied, 500_000.0, "rent relief at cap");
    assert_ngn_eq(r_at.chargeable_income, 4_500_000.0, "chargeable at cap");
    assert_ngn_eq(r_at.final_tax_payable, 600_000.0, "tax at cap");

    // Above cap: 20% of ₦4,000,000 = ₦800,000, capped at ₦500,000 -> tax ₦600,000
    let r_above =
        ComputationEngine::compute(&salary, &[], &[relief("rent", 4_000_000.0)], &cfg).unwrap();
    assert_ngn_eq(r_above.rent_relief_applied, 500_000.0, "rent relief above cap");
    assert_ngn_eq(r_above.final_tax_payable, 600_000.0, "tax above cap");
}

#[test]
fn test_nta_share_gains_around_150m_proceeds_and_10m_gain_thresholds() {
    let cfg = nta_2025_config(0.0);

    // Exempt: proceeds < ₦150m AND gain <= ₦10m
    let exempt_entry = IncomeEntry {
        income_type: "capital_gain_shares".to_string(),
        gross_amount_ngn: 10_000_000.0,
        cgt_proceeds: Some(149_999_999.0),
        cgt_gain: Some(10_000_000.0),
        ..Default::default()
    };
    let r_exempt = ComputationEngine::compute(&[exempt_entry], &[], &[], &cfg).unwrap();
    assert_ngn_eq(r_exempt.cgt_exempt_amount, 10_000_000.0, "exempt share gain");
    assert_ngn_eq(r_exempt.total_gross_income, 0.0, "exempt gross income");
    assert_ngn_eq(r_exempt.final_tax_payable, 0.0, "exempt final tax");

    // Taxable by proceeds: proceeds == ₦150m (not < ₦150m), gain ₦5m -> taxed on ₦5m => ₦690,000
    let taxable_proceeds = IncomeEntry {
        income_type: "capital_gain_shares".to_string(),
        gross_amount_ngn: 5_000_000.0,
        cgt_proceeds: Some(150_000_000.0),
        cgt_gain: Some(5_000_000.0),
        ..Default::default()
    };
    let r_proc = ComputationEngine::compute(&[taxable_proceeds], &[], &[], &cfg).unwrap();
    assert_ngn_eq(r_proc.cgt_exempt_amount, 0.0, "non-exempt proceeds");
    assert_ngn_eq(r_proc.final_tax_payable, 690_000.0, "tax on ₦5m share gain");

    // Taxable by gain: proceeds ₦100m, gain ₦10,000,001 (> ₦10m) -> 330k + 7,000,001 * 0.18 = 1,590,000.18
    let taxable_gain = IncomeEntry {
        income_type: "capital_gain_shares".to_string(),
        gross_amount_ngn: 10_000_001.0,
        cgt_proceeds: Some(100_000_000.0),
        cgt_gain: Some(10_000_001.0),
        ..Default::default()
    };
    let r_gain = ComputationEngine::compute(&[taxable_gain], &[], &[], &cfg).unwrap();
    assert_ngn_eq(r_gain.cgt_exempt_amount, 0.0, "non-exempt gain");
    assert_ngn_eq(r_gain.final_tax_payable, 1_590_000.18, "tax on ₦10,000,001 share gain");
}

#[test]
fn test_nta_wht_credits_with_zero_minimum_tax() {
    let cfg = nta_2025_config(0.0);
    let salary = vec![employment_entry(5_000_000.0)];

    // Partial WHT credit: ₦690,000 - ₦200,000 = ₦490,000
    let r_partial =
        ComputationEngine::compute(&salary, &[], &[relief("wht", 200_000.0)], &cfg).unwrap();
    assert_ngn_eq(r_partial.graduated_tax, 690_000.0, "gross tax");
    assert_ngn_eq(r_partial.final_tax_payable, 490_000.0, "after partial WHT");

    // Full / excess WHT credit floors at ₦0
    let r_full =
        ComputationEngine::compute(&salary, &[], &[relief("wht", 700_000.0)], &cfg).unwrap();
    assert_ngn_eq(r_full.final_tax_payable, 0.0, "excess WHT floors at zero");
}

#[test]
fn test_minimum_tax_floor_applies_before_wht_credits() {
    // Config with 1% minimum tax (e.g., pre-NTA PITA config per D4)
    let cfg = nta_2025_config(0.01);

    // Case 1: Full tax already covered by WHT -> must owe ₦0, NOT 1% minimum tax (₦50,000).
    let r_paid = ComputationEngine::compute(
        &[employment_entry(5_000_000.0)],
        &[],
        &[relief("wht", 690_000.0)],
        &cfg,
    )
    .unwrap();
    assert_ngn_eq(r_paid.final_tax_payable, 0.0, "full WHT wipes out liability");

    // Case 2: Deductions bring graduated tax to ₦0; minimum tax floor is ₦50,000;
    // WHT of ₦30,000 applies AFTER the floor -> final tax = max(50,000 - 30,000, 0) = ₦20,000.
    let r_floor = ComputationEngine::compute(
        &[employment_entry(5_000_000.0)],
        &[],
        &[
            relief("pension", 4_200_000.0),
            relief("wht", 30_000.0),
        ],
        &cfg,
    )
    .unwrap();
    assert_ngn_eq(r_floor.graduated_tax, 0.0, "graduated tax after deductions");
    assert_ngn_eq(r_floor.minimum_tax, 50_000.0, "1% minimum tax");
    assert_ngn_eq(
        r_floor.final_tax_payable,
        20_000.0,
        "minimum tax before WHT credit",
    );
}

#[test]
fn test_s9_estimate_tax_5m_returns_690000_on_fresh_install() {
    use lagosfile_lib::{
        commands::filing::{estimate_tax_with_conn, EstimateIncome},
        db::AppDb,
    };

    let db = AppDb::open_in_memory().unwrap();
    let conn = db.conn.lock().unwrap();
    let res = estimate_tax_with_conn(
        &conn,
        vec![EstimateIncome {
            income_type: "employment".to_string(),
            gross_amount_ngn: 5_000_000.0,
            cgt_proceeds: None,
            cgt_gain: None,
        }],
        vec![],
        vec![],
    )
    .unwrap();
    assert_ngn_eq(res.graduated_tax, 690_000.0, "estimate_tax ₦5m graduated");
    assert_ngn_eq(res.minimum_tax, 0.0, "estimate_tax ₦5m min tax");
    assert_ngn_eq(res.final_tax_payable, 690_000.0, "estimate_tax ₦5m final");
}

#[test]
fn test_s9_untouched_seed_upgrades_to_nta_2025_and_picks_config_by_income_year() {
    use lagosfile_lib::{
        commands::filing::{compute_filing_with_conn, create_draft_filing_with_conn},
        db::{AppDb, NTA_2025_CONFIG_ID, PITA_CONFIG_ID, SEED_V1_CONFIG_ID, SEED_V1_CONFIG_LABEL},
        services::config::ConfigService,
    };
    use rusqlite::params;

    // Simulate a legacy v1.2.0 DB that had ONLY the untouched v1.0 seed active and a filed 2024 return
    let legacy_conn = rusqlite::Connection::open_in_memory().unwrap();
    legacy_conn
        .execute_batch(
            "CREATE TABLE taxpayer (id TEXT PRIMARY KEY, full_name TEXT NOT NULL, tin TEXT NOT NULL UNIQUE, address TEXT, phone TEXT, email TEXT, filing_agent TEXT, created_at TEXT NOT NULL);
             CREATE TABLE filing (id TEXT PRIMARY KEY, taxpayer_id TEXT NOT NULL, parent_filing_id TEXT, year_of_assessment INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'Draft', filing_reference TEXT, created_at TEXT NOT NULL, confirmed_at TEXT, total_income_ngn REAL, chargeable_income REAL, tax_payable REAL, wht_credit REAL, net_tax_payable REAL, minimum_tax REAL, final_tax_payable REAL, tax_config_version TEXT NOT NULL DEFAULT 'default');
             CREATE TABLE income_entry (id TEXT PRIMARY KEY, filing_id TEXT NOT NULL, income_type TEXT NOT NULL, description TEXT, gross_amount_ngn REAL NOT NULL DEFAULT 0, is_foreign INTEGER NOT NULL DEFAULT 0, foreign_currency TEXT, foreign_amount REAL, income_date TEXT, fx_rate_fetched REAL, fx_rate_cbn_override REAL, fx_rate_used REAL, fx_rate_source TEXT, foreign_tax_paid_ngn REAL, is_cgt_exempt INTEGER NOT NULL DEFAULT 0, cgt_proceeds REAL, cgt_gain REAL);
             CREATE TABLE capital_allowance (id TEXT PRIMARY KEY, filing_id TEXT NOT NULL, asset_description TEXT NOT NULL, asset_type TEXT NOT NULL, asset_cost REAL NOT NULL DEFAULT 0, acquisition_date TEXT NOT NULL, tax_written_down_value REAL NOT NULL DEFAULT 0, annual_allowance_rate REAL NOT NULL DEFAULT 0, annual_allowance_amount REAL NOT NULL DEFAULT 0);
             CREATE TABLE relief_entry (id TEXT PRIMARY KEY, filing_id TEXT NOT NULL, relief_type TEXT NOT NULL, claimed_amount REAL NOT NULL DEFAULT 0, approved_amount REAL NOT NULL DEFAULT 0, wht_ref TEXT, wht_income_type TEXT, wht_date TEXT);
             CREATE TABLE document (id TEXT PRIMARY KEY, parent_entry_id TEXT NOT NULL, parent_entry_type TEXT NOT NULL, file_path TEXT NOT NULL, file_name TEXT NOT NULL, file_type TEXT NOT NULL, file_size_bytes INTEGER NOT NULL DEFAULT 0, uploaded_at TEXT NOT NULL);
             CREATE TABLE fx_cache (id TEXT PRIMARY KEY, base_currency TEXT NOT NULL, quote_currency TEXT NOT NULL, rate REAL NOT NULL, rate_date TEXT NOT NULL, source TEXT NOT NULL, fetched_at TEXT NOT NULL);
             CREATE TABLE tax_config (id TEXT PRIMARY KEY, version_label TEXT NOT NULL, governed_by TEXT NOT NULL, bands_json TEXT NOT NULL, relief_caps_json TEXT NOT NULL, cgt_thresholds_json TEXT NOT NULL, allowance_rates_json TEXT NOT NULL, minimum_tax_rate REAL NOT NULL, is_active INTEGER NOT NULL DEFAULT 0, last_modified TEXT NOT NULL, modified_by TEXT NOT NULL DEFAULT 'system');",
        )
        .unwrap();
    legacy_conn
        .execute(
            "INSERT INTO tax_config VALUES (?1, ?2, 'NTA 2025',
             '[{\"lower\":0,\"upper\":800000,\"rate\":0.07},{\"lower\":800000,\"upper\":2800000,\"rate\":0.11},{\"lower\":2800000,\"upper\":null,\"rate\":0.15}]',
             '{\"rentReliefCap\":500000,\"rentReliefRate\":0.20}',
             '{\"proceedsThreshold\":150000000,\"gainThreshold\":10000000}',
             '{\"software_licence\":0.33,\"other\":0.25}', 0.01, 1, '2025-01-01T00:00:00Z', 'system')",
            params![SEED_V1_CONFIG_ID, SEED_V1_CONFIG_LABEL],
        )
        .unwrap();
    legacy_conn
        .execute(
            "INSERT INTO taxpayer (id, full_name, tin, created_at) VALUES ('tp-1', 'Tunde', '1234567890', '2025-01-01T00:00:00Z')",
            [],
        )
        .unwrap();
    legacy_conn
        .execute(
            "INSERT INTO filing (id, taxpayer_id, year_of_assessment, status, created_at, tax_config_version)
             VALUES ('f-old', 'tp-1', 2024, 'Confirmed', '2025-02-01T00:00:00Z', ?1)",
            params![SEED_V1_CONFIG_LABEL],
        )
        .unwrap();
    legacy_conn
        .execute(
            "INSERT INTO income_entry (id, filing_id, income_type, gross_amount_ngn, is_foreign)
             VALUES ('inc-old', 'f-old', 'employment', 3000000.0, 0)",
            [],
        )
        .unwrap();

    // Serialize legacy_conn and load into AppDb (runs schema + migrate)
    let legacy_bytes = {
        let mut size: i64 = 0;
        unsafe {
            let ptr = rusqlite::ffi::sqlite3_serialize(
                legacy_conn.handle(),
                c"main".as_ptr(),
                &mut size,
                0,
            );
            let slice = std::slice::from_raw_parts(ptr, size as usize);
            let vec = slice.to_vec();
            rusqlite::ffi::sqlite3_free(ptr as *mut std::ffi::c_void);
            vec
        }
    };

    let db = AppDb::open_in_memory().unwrap();
    db.load_from_bytes(&legacy_bytes).unwrap();

    // Active config was upgraded from untouched v1 seed to NTA 2025
    let active = ConfigService::get_active(&db).unwrap();
    assert_eq!(active.id.to_string(), NTA_2025_CONFIG_ID);
    assert_eq!(active.minimum_tax_rate, 0.0);
    assert_eq!(active.allowance_rates.get("software_licence"), Some(&0.25));

    let conn = db.conn.lock().unwrap();
    // Old confirmed filing stayed pinned to v1 seed and recomputes identically (306,000)
    let old_comp = compute_filing_with_conn(&conn, "f-old").unwrap();
    assert_ngn_eq(old_comp.final_tax_payable, 306_000.0, "old filing unchanged");

    // Per D1: draft for <= 2025 gets PITA config (1% min tax); get_for_income_year(2026) gets NTA 2025
    let draft_2025 = create_draft_filing_with_conn(&conn, 2025).unwrap();
    assert_eq!(
        draft_2025.tax_config_id.map(|u| u.to_string()).as_deref(),
        Some(PITA_CONFIG_ID)
    );
    let cfg_2026 = ConfigService::get_for_income_year(&conn, 2026).unwrap();
    assert_eq!(cfg_2026.id.to_string(), NTA_2025_CONFIG_ID);
}

#[test]
fn test_s11_paye_and_per_entry_foreign_tax_credits() {
    let cfg = nta_2025_config(0.0);

    // 1. PAYE partly covering tax: ₦5m salary -> ₦690,000 tax, ₦400,000 PAYE -> ₦290,000 due
    let r_part = ComputationEngine::compute(
        &[employment_entry(5_000_000.0)],
        &[],
        &[relief("paye", 400_000.0)],
        &cfg,
    )
    .unwrap();
    assert_ngn_eq(r_part.paye_credits, 400_000.0, "partial PAYE credit");
    assert_ngn_eq(r_part.final_tax_payable, 290_000.0, "partial PAYE net tax");

    // 2. PAYE fully / over covering tax -> floored at ₦0
    let r_full = ComputationEngine::compute(
        &[employment_entry(5_000_000.0)],
        &[],
        &[relief("paye", 800_000.0)],
        &cfg,
    )
    .unwrap();
    assert_ngn_eq(r_full.paye_credits, 800_000.0, "full PAYE credit");
    assert_ngn_eq(r_full.final_tax_payable, 0.0, "excess PAYE floors at zero");

    // 3. Mixed domestic (₦10m) + foreign (₦2m) = ₦12m total -> ₦1,950,000 graduated tax.
    // Foreign tax paid = ₦500,000. Whole-return credit would give ₦500k (₦1,450,000 due);
    // per-income limit is 1,950,000 * (2m / 12m) = ₦325,000 -> ₦1,625,000 due.
    let domestic = employment_entry(10_000_000.0);
    let foreign = IncomeEntry {
        income_type: "business".to_string(),
        gross_amount_ngn: 2_000_000.0,
        is_foreign: true,
        foreign_tax_paid_ngn: Some(500_000.0),
        ..Default::default()
    };
    let r_mixed = ComputationEngine::compute(&[domestic, foreign], &[], &[], &cfg).unwrap();
    assert_ngn_eq(r_mixed.graduated_tax, 1_950_000.0, "mixed gross tax");
    assert_ngn_eq(r_mixed.foreign_tax_credits, 325_000.0, "per-entry FTC cap");
    assert_ngn_eq(r_mixed.final_tax_payable, 1_625_000.0, "mixed final tax");

    // 4. Combined WHT + PAYE + FTC exceeding tax floors at ₦0
    let r_floor = ComputationEngine::compute(
        &[
            employment_entry(4_000_000.0),
            IncomeEntry {
                income_type: "business".to_string(),
                gross_amount_ngn: 1_000_000.0,
                is_foreign: true,
                foreign_tax_paid_ngn: Some(100_000.0),
                ..Default::default()
            },
        ],
        &[],
        &[relief("wht", 400_000.0), relief("paye", 400_000.0)],
        &cfg,
    )
    .unwrap();
    assert_ngn_eq(r_floor.final_tax_payable, 0.0, "combined credits floor at zero");
}

#[test]
fn test_s11_duplicating_carries_no_credits_and_exports_show_all_credits() {
    use lagosfile_lib::{
        commands::{
            auth::setup_pin_in_dir,
            export::{export_filing_json_with_conn, export_filing_pdf_in_dir},
            filing::{
                confirm_filing_with_conn, copy_entries_to_next_year,
                upsert_income_entry_with_conn, upsert_relief_entry_with_conn,
            },
        },
        services::{filing::FilingService, profile::ProfileService},
        AppState,
    };
    use serde_json::json;

    let dir = std::env::temp_dir().join(format!("lagosfile-s11-{}", uuid::Uuid::new_v4()));
    let state = AppState::default();
    setup_pin_in_dir(&dir, "1234", &state).unwrap();

    let filing_id = {
        let guard = state.db.lock().unwrap();
        let db = guard.as_ref().unwrap();
        let tp = ProfileService::create(
            db,
            json!({ "fullName": "Bola Ade", "tin": "1234567890" }),
        )
        .unwrap();
        let f1 = FilingService::create_draft(db, tp.id, 2024, "NTA 2025").unwrap();
        let f2 = FilingService::create_draft(db, tp.id, 2025, "NTA 2025").unwrap();
        let fid1 = f1.id.to_string();
        let fid2 = f2.id.to_string();

        let conn = db.conn.lock().unwrap();
        // ₦10m domestic + ₦2m foreign (₦500k foreign tax -> ₦325k FTC), ₦200k WHT, ₦300k PAYE, ₦0 pension
        upsert_income_entry_with_conn(
            &conn,
            &json!({ "filingId": fid1, "incomeType": "employment", "grossAmountNgn": 10_000_000.0 }),
        )
        .unwrap();
        upsert_income_entry_with_conn(
            &conn,
            &json!({
                "filingId": fid1, "incomeType": "business", "grossAmountNgn": 2_000_000.0,
                "isForeign": true, "foreignTaxPaidNgn": 500_000.0
            }),
        )
        .unwrap();
        upsert_relief_entry_with_conn(
            &conn,
            &json!({ "filingId": fid1, "reliefType": "wht", "claimedAmount": 200_000.0, "approvedAmount": 200_000.0 }),
        )
        .unwrap();
        upsert_relief_entry_with_conn(
            &conn,
            &json!({ "filingId": fid1, "reliefType": "paye", "claimedAmount": 300_000.0, "approvedAmount": 300_000.0 }),
        )
        .unwrap();
        upsert_relief_entry_with_conn(
            &conn,
            &json!({ "filingId": fid1, "reliefType": "pension", "claimedAmount": 0.0, "approvedAmount": 0.0 }),
        )
        .unwrap();

        // Copy to next year: must NULL foreign_tax_paid_ngn and drop wht/paye/foreign_tax reliefs
        copy_entries_to_next_year(&conn, &fid1, &fid2).unwrap();
        let copied_ft_count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM income_entry WHERE filing_id=?1 AND foreign_tax_paid_ngn IS NOT NULL",
                rusqlite::params![fid2],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(copied_ft_count, 0, "foreign_tax_paid_ngn must be NULL after copy");
        let copied_credit_reliefs: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM relief_entry WHERE filing_id=?1 AND relief_type IN ('wht','paye','foreign_tax')",
                rusqlite::params![fid2],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(copied_credit_reliefs, 0, "credit reliefs must not be copied to next year");

        // Confirm f1: 1,950,000 - 200,000 WHT - 300,000 PAYE - 325,000 FTC = 1,125,000
        let confirmed = confirm_filing_with_conn(&conn, &fid1).unwrap();
        assert_eq!(confirmed.tax_payable, Some(1_950_000.0));
        assert_eq!(confirmed.wht_credit, Some(200_000.0));
        assert_eq!(confirmed.paye_credit, Some(300_000.0));
        assert_eq!(confirmed.foreign_tax_credit, Some(325_000.0));
        assert_eq!(confirmed.final_tax_payable, Some(1_125_000.0));

        // JSON export matches exact arithmetic
        let json_path = dir.join("s11.json");
        export_filing_json_with_conn(&conn, &fid1, json_path.to_str().unwrap()).unwrap();
        let exported: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&json_path).unwrap()).unwrap();
        assert_eq!(exported["filing"]["taxPayable"].as_f64(), Some(1_950_000.0));
        assert_eq!(exported["filing"]["whtCredit"].as_f64(), Some(200_000.0));
        assert_eq!(exported["filing"]["payeCredit"].as_f64(), Some(300_000.0));
        assert_eq!(exported["filing"]["foreignTaxCredit"].as_f64(), Some(325_000.0));
        assert_eq!(exported["filing"]["finalTaxPayable"].as_f64(), Some(1_125_000.0));
        fid1
    };

    // PDF export renders all credits and final tax payable cleanly
    let pdf_path = dir.join("s11.pdf");
    export_filing_pdf_in_dir(&dir, &filing_id, pdf_path.to_str().unwrap(), false, None, &state)
        .unwrap();
    let pdf_doc = lopdf::Document::load(&pdf_path).unwrap();
    let text: String = pdf_doc
        .get_pages()
        .keys()
        .filter_map(|p| pdf_doc.extract_text(&[*p]).ok())
        .collect::<Vec<_>>()
        .join("\n");
    assert!(text.contains("1,950,000.00"), "PDF missing gross tax: {text}");
    assert!(text.contains("200,000.00"), "PDF missing WHT credit: {text}");
    assert!(text.contains("300,000.00"), "PDF missing PAYE credit: {text}");
    assert!(text.contains("325,000.00"), "PDF missing FTC: {text}");
    assert!(text.contains("1,125,000.00"), "PDF missing final tax: {text}");

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn test_s13_non_exempt_share_gain_taxes_gain_not_gross_proceeds() {
    let cfg = nta_2025_config(0.0);
    // Simulate legacy row where user accidentally typed disposal proceeds (₦200m)
    // in gross_amount_ngn while recording actual gain (₦15m) in cgt_gain.
    let mut entry = employment_entry(200_000_000.0);
    entry.income_type = "capital_gain_shares".to_string();
    entry.cgt_proceeds = Some(200_000_000.0);
    entry.cgt_gain = Some(15_000_000.0);

    let res = ComputationEngine::compute(&[entry], &[], &[], &cfg).unwrap();
    assert_ngn_eq(res.total_gross_income, 15_000_000.0, "taxable share gain");
    assert_ngn_eq(res.cgt_exempt_amount, 0.0, "not exempt above ₦150m proceeds");
    // Tax on ₦15m under NTA 2025: 0 + 330,000 + 1,620,000 + (3m * 21% = 630,000) = ₦2,580,000
    assert_ngn_eq(res.final_tax_payable, 2_580_000.0, "tax on ₦15m share gain");
}

#[test]
fn test_s13_share_gain_migration_fixes_drafts_and_notifies_filed() {
    use lagosfile_lib::db::{get_migration_notices, AppDb};
    use rusqlite::params;

    // Seed a database with one Draft and one Submitted filing having mismatched share-gain rows
    let seed = AppDb::open_in_memory().unwrap();
    let bytes = {
        let conn = seed.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO taxpayer (id, full_name, tin, created_at) VALUES ('tp-1', 'Sade', '1000000001', '2025-01-01T00:00:00Z')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO filing (id, taxpayer_id, year_of_assessment, status, filing_reference, created_at, confirmed_at, submitted_at, total_income_ngn, final_tax_payable, tax_config_version)
             VALUES ('f-sub', 'tp-1', 2024, 'Submitted', 'LIRS/REF/2024/00001', '2025-01-02T00:00:00Z', '2025-01-03T00:00:00Z', '2025-01-04T00:00:00Z', 200000000, 45000000, 'NTA 2025')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO filing (id, taxpayer_id, year_of_assessment, status, created_at, tax_config_version)
             VALUES ('f-draft', 'tp-1', 2025, 'Draft', '2026-01-02T00:00:00Z', 'NTA 2025')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO income_entry (id, filing_id, income_type, description, gross_amount_ngn, is_foreign, is_cgt_exempt, cgt_proceeds, cgt_gain)
             VALUES ('ie-sub', 'f-sub', 'capital_gain_shares', 'Listed shares', 200000000, 0, 0, 200000000, 15000000)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO income_entry (id, filing_id, income_type, description, gross_amount_ngn, is_foreign, is_cgt_exempt, cgt_proceeds, cgt_gain)
             VALUES ('ie-draft', 'f-draft', 'capital_gain_shares', 'Listed shares', 200000000, 0, 0, 200000000, 15000000)",
            [],
        )
        .unwrap();
        drop(conn);
        seed.serialize().unwrap()
    };

    // Re-open through load_from_bytes so migrate() runs migrate_share_gain_rows
    let migrated = AppDb::open_in_memory().unwrap();
    migrated.load_from_bytes(&bytes).unwrap();
    let conn = migrated.conn.lock().unwrap();

    let draft_gross: f64 = conn
        .query_row(
            "SELECT gross_amount_ngn FROM income_entry WHERE id='ie-draft'",
            params![],
            |r| r.get(0),
        )
        .unwrap();
    assert_ngn_eq(draft_gross, 15_000_000.0, "Draft share-gain row fixed to cgt_gain");

    let sub_gross: f64 = conn
        .query_row(
            "SELECT gross_amount_ngn FROM income_entry WHERE id='ie-sub'",
            params![],
            |r| r.get(0),
        )
        .unwrap();
    assert_ngn_eq(sub_gross, 200_000_000.0, "Submitted share-gain row must remain untouched");

    let notices = get_migration_notices(&conn);
    assert!(
        notices.iter().any(|n| n.contains("LIRS/REF/2024/00001")),
        "expected migration notice mentioning Submitted filing, got: {notices:?}"
    );
}
