use lagosfile_lib::models::*;
use lagosfile_lib::services::computation::ComputationEngine;
use uuid::Uuid;

fn mock_config() -> TaxConfig {
    TaxConfig {
        id: Uuid::new_v4(),
        version_label: "2025-v1".to_string(),
        governed_by: "NTA 2025".to_string(),
        bands: vec![
            TaxBand {
                lower: 0.0,
                upper: Some(300_000.0),
                rate: 0.07,
            },
            TaxBand {
                lower: 300_000.0,
                upper: Some(600_000.0),
                rate: 0.11,
            },
            TaxBand {
                lower: 600_000.0,
                upper: None,
                rate: 0.15,
            },
        ],
        relief_caps: ReliefCaps {
            rent_relief_rate: 0.10,
            rent_relief_cap: 100_000.0,
        },
        cgt_thresholds: CgtThresholds {
            proceeds_threshold: 25_000_000.0,
            gain_threshold: 1_000_000.0,
        },
        allowance_rates: std::collections::HashMap::new(),
        minimum_tax_rate: 0.01,
        is_active: true,
        last_modified: chrono::Utc::now(),
        modified_by: "system".to_string(),
    }
}

#[test]
fn test_basic_computation() {
    let config = mock_config();
    let income = vec![IncomeEntry {
        id: Uuid::new_v4(),
        filing_id: Uuid::new_v4(),
        income_type: "employment".to_string(),
        gross_amount_ngn: 1_000_000.0,
        ..Default::default()
    }];
    let reliefs = vec![ReliefEntry {
        id: Uuid::new_v4(),
        filing_id: Uuid::new_v4(),
        relief_type: "pension".to_string(),
        approved_amount: 100_000.0,
        ..Default::default()
    }];

    let result = ComputationEngine::compute(&income, &[], &reliefs, &config).unwrap();

    assert_eq!(result.total_gross_income, 1_000_000.0);
    assert_eq!(result.chargeable_income, 900_000.0);
    assert_eq!(result.graduated_tax, 99_000.0);
}

#[test]
fn test_digital_asset_ringfencing() {
    let config = mock_config();
    let income = vec![
        IncomeEntry {
            income_type: "employment".to_string(),
            gross_amount_ngn: 1_000_000.0,
            ..Default::default()
        },
        IncomeEntry {
            income_type: "digital_asset".to_string(),
            gross_amount_ngn: -200_000.0,
            ..Default::default()
        },
    ];

    let result = ComputationEngine::compute(&income, &[], &[], &config).unwrap();

    assert_eq!(result.total_gross_income, 1_000_000.0);
    assert_eq!(result.digital_asset_loss_ringfenced, 200_000.0);
}

#[test]
fn test_cgt_exemption_logic() {
    let mut config = mock_config();
    config.cgt_thresholds.proceeds_threshold = 25_000_000.0;
    config.cgt_thresholds.gain_threshold = 1_000_000.0;

    // Case 1: Below thresholds -> Exempt
    let income_exempt = vec![IncomeEntry {
        income_type: "capital_gain_shares".to_string(),
        gross_amount_ngn: 500_000.0,
        cgt_proceeds: Some(10_000_000.0),
        cgt_gain: Some(500_000.0),
        ..Default::default()
    }];
    let result = ComputationEngine::compute(&income_exempt, &[], &[], &config).unwrap();
    assert_eq!(result.total_gross_income, 0.0);
    assert_eq!(result.cgt_exempt_amount, 500_000.0);

    // Case 2: Above proceeds threshold -> Not exempt
    let income_taxable = vec![IncomeEntry {
        income_type: "capital_gain_shares".to_string(),
        gross_amount_ngn: 500_000.0,
        cgt_proceeds: Some(30_000_000.0),
        cgt_gain: Some(500_000.0),
        ..Default::default()
    }];
    let result = ComputationEngine::compute(&income_taxable, &[], &[], &config).unwrap();
    assert_eq!(result.total_gross_income, 500_000.0);
    assert_eq!(result.cgt_exempt_amount, 0.0);
}

#[test]
fn test_rent_relief_capping() {
    let mut config = mock_config();
    config.relief_caps.rent_relief_rate = 0.10;
    config.relief_caps.rent_relief_cap = 100_000.0;

    let income = vec![IncomeEntry {
        income_type: "employment".to_string(),
        gross_amount_ngn: 2_000_000.0,
        ..Default::default()
    }];

    // Rent = 1,500,000. 10% is 150,000. Cap is 100,000.
    let reliefs = vec![ReliefEntry {
        relief_type: "rent".to_string(),
        approved_amount: 1_500_000.0,
        ..Default::default()
    }];

    let result = ComputationEngine::compute(&income, &[], &reliefs, &config).unwrap();
    assert_eq!(result.rent_relief_applied, 100_000.0);
}

#[test]
fn test_minimum_tax_logic() {
    let mut config = mock_config();
    config.minimum_tax_rate = 0.01; // 1%

    let income = vec![IncomeEntry {
        income_type: "employment".to_string(),
        gross_amount_ngn: 1_000_000.0,
        ..Default::default()
    }];

    // Huge reliefs so graduated tax is 0
    let reliefs = vec![ReliefEntry {
        relief_type: "pension".to_string(),
        approved_amount: 1_000_000.0,
        ..Default::default()
    }];

    let result = ComputationEngine::compute(&income, &[], &reliefs, &config).unwrap();
    assert_eq!(result.graduated_tax, 0.0);
    assert_eq!(result.minimum_tax, 10_000.0); // 1% of 1M
    assert_eq!(result.final_tax_payable, 10_000.0);
}

#[test]
fn test_wht_credits_application() {
    let config = mock_config();
    let income = vec![IncomeEntry {
        income_type: "employment".to_string(),
        gross_amount_ngn: 1_000_000.0,
        ..Default::default()
    }];

    // Graduated tax on 1M is 99,000 (from previous test)
    // Add WHT credit of 50,000
    let reliefs = vec![ReliefEntry {
        relief_type: "wht".to_string(),
        approved_amount: 50_000.0,
        ..Default::default()
    }];

    let result = ComputationEngine::compute(&income, &[], &reliefs, &config).unwrap();
    assert_eq!(result.graduated_tax, 114_000.0);
    assert_eq!(result.wht_credits, 50_000.0);
    assert_eq!(result.net_tax_payable, 64_000.0);
}
