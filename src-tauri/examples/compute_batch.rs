use lagosfile_lib::{
    commands::filing::{build_estimate_entries, EstimateIncome, EstimateRelief},
    db::AppDb,
    services::{computation::ComputationEngine, config::ConfigService},
};
use serde::{Deserialize, Serialize};
use std::io::Read;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CaseInput {
    gross_income: f64,
    #[serde(default)]
    annual_rent: f64,
    #[serde(default)]
    pension: f64,
    #[serde(default)]
    nhf: f64,
    #[serde(default)]
    nhis: f64,
    #[serde(default)]
    life_assurance: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CaseOutput {
    total_gross_income: f64,
    total_deductions: f64,
    chargeable_income: f64,
    graduated_tax: f64,
    final_tax_payable: f64,
}

fn main() {
    let mut input_str = String::new();
    std::io::stdin()
        .read_to_string(&mut input_str)
        .expect("failed to read JSON input from stdin");

    let cases: Vec<CaseInput> =
        serde_json::from_str(&input_str).expect("failed to parse JSON array of cases");

    let db = AppDb::open_in_memory().expect("failed to open in-memory DB");
    let config = ConfigService::get_active(&db).expect("failed to load active tax config");

    let mut outputs = Vec::with_capacity(cases.len());
    for c in cases {
        let income_entries = vec![EstimateIncome {
            income_type: "employment".to_string(),
            gross_amount_ngn: c.gross_income,
            cgt_proceeds: None,
            cgt_gain: None,
            bik_category: None,
            bik_cost: None,
        }];
        let mut relief_entries = Vec::new();
        if c.annual_rent > 0.0 {
            relief_entries.push(EstimateRelief {
                relief_type: "rent".to_string(),
                claimed_amount: c.annual_rent,
            });
        }
        if c.pension > 0.0 {
            relief_entries.push(EstimateRelief {
                relief_type: "pension".to_string(),
                claimed_amount: c.pension,
            });
        }
        if c.nhf > 0.0 {
            relief_entries.push(EstimateRelief {
                relief_type: "nhf".to_string(),
                claimed_amount: c.nhf,
            });
        }
        if c.nhis > 0.0 {
            relief_entries.push(EstimateRelief {
                relief_type: "nhis".to_string(),
                claimed_amount: c.nhis,
            });
        }
        if c.life_assurance > 0.0 {
            relief_entries.push(EstimateRelief {
                relief_type: "life_assurance".to_string(),
                claimed_amount: c.life_assurance,
            });
        }

        let (income, allowances, reliefs) =
            build_estimate_entries(income_entries, vec![], relief_entries, &config);
        let res = ComputationEngine::compute(&income, &allowances, &reliefs, &config)
            .expect("computation failed");

        outputs.push(CaseOutput {
            total_gross_income: res.total_gross_income,
            total_deductions: res.total_deductions,
            chargeable_income: res.chargeable_income,
            graduated_tax: res.graduated_tax,
            final_tax_payable: res.final_tax_payable,
        });
    }

    println!(
        "{}",
        serde_json::to_string(&outputs).expect("failed to serialize output")
    );
}
