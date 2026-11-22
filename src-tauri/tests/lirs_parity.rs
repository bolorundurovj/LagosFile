use chrono::NaiveDate;
use cucumber::{given, then, when, World};
use lagosfile_lib::{
    commands::filing::{build_estimate_entries, EstimateAllowance, EstimateIncome, EstimateRelief},
    db::AppDb,
    services::{computation::ComputationEngine, config::ConfigService},
};
use std::sync::atomic::{AtomicUsize, Ordering};

static UNRECORDED_CASES: AtomicUsize = AtomicUsize::new(0);

#[derive(Debug, Default, World)]
pub struct LirsParityWorld {
    income_year: i32,
    incomes: Vec<EstimateIncome>,
    allowances: Vec<EstimateAllowance>,
    reliefs: Vec<EstimateRelief>,
    case_id: String,
    recorded_by: String,
    recorded_on: String,
    lirs_total_income: Option<f64>,
    lirs_chargeable_income: Option<f64>,
    lirs_gross_tax: Option<f64>,
    lirs_tax_payable: Option<f64>,
}

fn parse_optional_amount(raw: &str, col_name: &str) -> Option<f64> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let parsed = trimmed
        .parse::<f64>()
        .unwrap_or_else(|e| panic!("Invalid number '{}' in column {}: {}", trimmed, col_name, e));
    Some(parsed)
}

#[given("I am logged in to the LIRS eTax portal")]
fn logged_in(_world: &mut LirsParityWorld) {}

#[given("I have opened the tax calculator")]
fn opened_calculator(_world: &mut LirsParityWorld) {}

#[given(expr = "I have started a fresh calculation with Year In View set to {int}")]
fn started_fresh_calculation(world: &mut LirsParityWorld, lirs_yoa: i32) {
    // LIRS Year of Assessment = income_year + 1 (D2)
    world.income_year = lirs_yoa - 1;
}

#[when(expr = "I enter {float} as Employment under Earned Income")]
fn enter_employment(world: &mut LirsParityWorld, amount: f64) {
    if amount != 0.0 {
        world.incomes.push(EstimateIncome {
            income_type: "employment".to_string(),
            gross_amount_ngn: amount,
            ..Default::default()
        });
    }
}

#[when(expr = "I enter {float} as Trade Business or profession under Earned Income")]
fn enter_business(world: &mut LirsParityWorld, amount: f64) {
    if amount != 0.0 {
        world.incomes.push(EstimateIncome {
            income_type: "business".to_string(),
            gross_amount_ngn: amount,
            ..Default::default()
        });
    }
}

#[when(expr = "I enter {float} as Rent under Unearned Income")]
fn enter_rental(world: &mut LirsParityWorld, amount: f64) {
    if amount != 0.0 {
        world.incomes.push(EstimateIncome {
            income_type: "rental".to_string(),
            gross_amount_ngn: amount,
            ..Default::default()
        });
    }
}

#[when(expr = "I enter {float} as Dividend under Unearned Income")]
fn enter_dividend(world: &mut LirsParityWorld, amount: f64) {
    if amount != 0.0 {
        world.incomes.push(EstimateIncome {
            income_type: "dividend".to_string(),
            gross_amount_ngn: amount,
            ..Default::default()
        });
    }
}

#[when(expr = "I enter {float} as Interest under Unearned Income")]
fn enter_interest(world: &mut LirsParityWorld, amount: f64) {
    if amount != 0.0 {
        world.incomes.push(EstimateIncome {
            income_type: "interest".to_string(),
            gross_amount_ngn: amount,
            ..Default::default()
        });
    }
}

#[when(expr = "I enter {float} as Pensions under Deductions")]
fn enter_pension(world: &mut LirsParityWorld, amount: f64) {
    if amount != 0.0 {
        world.reliefs.push(EstimateRelief {
            relief_type: "pension".to_string(),
            claimed_amount: amount,
        });
    }
}

#[when(expr = "I enter {float} as National Housing Fund under Reliefs")]
fn enter_nhf(world: &mut LirsParityWorld, amount: f64) {
    if amount != 0.0 {
        world.reliefs.push(EstimateRelief {
            relief_type: "nhf".to_string(),
            claimed_amount: amount,
        });
    }
}

#[when(expr = "I enter {float} as National Health Insurance Scheme under Reliefs")]
fn enter_nhis(world: &mut LirsParityWorld, amount: f64) {
    if amount != 0.0 {
        world.reliefs.push(EstimateRelief {
            relief_type: "nhis".to_string(),
            claimed_amount: amount,
        });
    }
}

#[when(expr = "I enter {float} as Life Assurance under Reliefs")]
fn enter_life_assurance(world: &mut LirsParityWorld, amount: f64) {
    if amount != 0.0 {
        world.reliefs.push(EstimateRelief {
            relief_type: "life_assurance".to_string(),
            claimed_amount: amount,
        });
    }
}

#[when(expr = "I enter {float} as annual rent paid")]
fn enter_rent_paid(world: &mut LirsParityWorld, amount: f64) {
    if amount != 0.0 {
        world.reliefs.push(EstimateRelief {
            relief_type: "rent".to_string(),
            claimed_amount: amount,
        });
    }
}

#[when(
    expr = "I enter {float} as Capital Allowance under Adjustments for an asset costing {float}"
)]
fn enter_capital_allowance(world: &mut LirsParityWorld, _ca_display: f64, asset_cost: f64) {
    if asset_cost != 0.0 {
        world.allowances.push(EstimateAllowance {
            asset_type: "other".to_string(),
            asset_cost,
            tax_written_down_value: Some(asset_cost),
        });
    }
}

#[when(expr = "I enter {float} as WHT Others under Withheld Taxes")]
fn enter_wht(world: &mut LirsParityWorld, amount: f64) {
    if amount != 0.0 {
        world.reliefs.push(EstimateRelief {
            relief_type: "wht".to_string(),
            claimed_amount: amount,
        });
    }
}

#[when("I run the calculation")]
fn run_calculation(_world: &mut LirsParityWorld) {}

#[then(
    expr = "LIRS showed total income {string}, chargeable income {string}, gross tax {string} and tax payable {string}"
)]
fn lirs_showed(
    world: &mut LirsParityWorld,
    total_income: String,
    chargeable_income: String,
    gross_tax: String,
    tax_payable: String,
) {
    world.lirs_total_income = parse_optional_amount(&total_income, "lirs_total_income");
    world.lirs_chargeable_income =
        parse_optional_amount(&chargeable_income, "lirs_chargeable_income");
    world.lirs_gross_tax = parse_optional_amount(&gross_tax, "lirs_gross_tax");
    world.lirs_tax_payable = parse_optional_amount(&tax_payable, "lirs_tax_payable");
}

#[then(expr = "case {word} was recorded by {string} on {string}")]
fn recorded_by_on(
    world: &mut LirsParityWorld,
    case_id: String,
    recorded_by: String,
    recorded_on: String,
) {
    world.case_id = case_id;
    world.recorded_by = recorded_by.trim().to_string();
    world.recorded_on = recorded_on.trim().to_string();
}

#[then("LagosFile computes the same figures within ₦1")]
fn lagosfile_matches_lirs(world: &mut LirsParityWorld) {
    let any_recorded = world.lirs_total_income.is_some()
        || world.lirs_chargeable_income.is_some()
        || world.lirs_gross_tax.is_some()
        || world.lirs_tax_payable.is_some();

    if any_recorded {
        assert!(
            !world.recorded_by.is_empty(),
            "Case {} has recorded LIRS figures but missing recorded_by",
            world.case_id
        );
        NaiveDate::parse_from_str(&world.recorded_on, "%Y-%m-%d").unwrap_or_else(|_| {
            panic!(
                "Case {} has recorded LIRS figures but invalid recorded_on '{}' (expected YYYY-MM-DD)",
                world.case_id, world.recorded_on
            )
        });
    }

    let db = AppDb::open_in_memory().expect("failed to open in-memory DB");
    let config = {
        let conn = db.conn.lock().unwrap();
        if world.income_year > 0 {
            ConfigService::get_for_income_year(&conn, world.income_year)
                .expect("failed to load tax config for income year")
        } else {
            drop(conn);
            ConfigService::get_active(&db).expect("failed to load active tax config")
        }
    };

    let incomes = std::mem::take(&mut world.incomes);
    let allowances = std::mem::take(&mut world.allowances);
    let reliefs = std::mem::take(&mut world.reliefs);
    let (inc, ca, rel) = build_estimate_entries(incomes, allowances, reliefs, &config);
    let result = ComputationEngine::compute(&inc, &ca, &rel, &config)
        .unwrap_or_else(|e| panic!("Case {} computation failed: {}", world.case_id, e));

    if !any_recorded {
        // No portal figures yet: parity cannot be asserted, so only check that LagosFile's
        // own figures for this case are well-formed.
        UNRECORDED_CASES.fetch_add(1, Ordering::Relaxed);
        for (label, value) in [
            ("total_income", result.total_gross_income),
            ("chargeable_income", result.chargeable_income),
            ("gross_tax", result.graduated_tax),
            ("tax_payable", result.final_tax_payable),
        ] {
            assert!(
                value.is_finite() && value >= 0.0,
                "Case {} {} must be a non-negative amount, got {}",
                world.case_id,
                label,
                value
            );
        }
        assert!(
            result.chargeable_income <= result.total_gross_income + 0.01,
            "Case {} chargeable income {} exceeds total income {}",
            world.case_id,
            result.chargeable_income,
            result.total_gross_income
        );
        return;
    }

    let check = |label: &str, expected: Option<f64>, actual: f64| {
        if let Some(exp) = expected {
            let delta = (actual - exp).abs();
            assert!(
                delta <= 1.0,
                "Case {} {} mismatch: LIRS={}, LagosFile={}, delta=₦{:.2} (> ₦1)",
                world.case_id,
                label,
                exp,
                actual,
                delta
            );
        }
    };

    check(
        "total_income",
        world.lirs_total_income,
        result.total_gross_income,
    );
    check(
        "chargeable_income",
        world.lirs_chargeable_income,
        result.chargeable_income,
    );
    check("gross_tax", world.lirs_gross_tax, result.graduated_tax);
    check(
        "tax_payable",
        world.lirs_tax_payable,
        result.final_tax_payable,
    );
}

#[tokio::main]
async fn main() {
    use cucumber::writer::Stats as _;

    let feature_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("features")
        .join("lirs_parity.feature");

    let writer = LirsParityWorld::cucumber()
        .fail_on_skipped()
        .filter_run(feature_path, |_feature, _rule, scenario| {
            !scenario.tags.iter().any(|tag| tag == "pending")
        })
        .await;

    let unrecorded = UNRECORDED_CASES.load(Ordering::Relaxed);
    if unrecorded > 0 {
        println!(
            "[lirs_parity] {unrecorded} case(s) have no LIRS portal figures yet: LagosFile's figures were sanity-checked but parity was NOT asserted. Record portal figures in tests/features/lirs_parity.feature to enable parity checks."
        );
    }

    if writer.execution_has_failed() {
        std::process::exit(1);
    }
}
