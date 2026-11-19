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
#[ignore = "Requires S9: minimum tax floor must apply before WHT credits (#2)"]
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
