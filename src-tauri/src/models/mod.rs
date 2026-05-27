use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ── Taxpayer ─────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Taxpayer {
    pub id: Uuid,
    pub full_name: String,
    pub tin: String,
    pub address: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub filing_agent: Option<String>,
    pub created_at: DateTime<Utc>,
}

// ── Filing ───────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[allow(dead_code)]
pub enum FilingStatus {
    Draft,
    Confirmed,
    Submitted,
}

impl std::fmt::Display for FilingStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FilingStatus::Draft => write!(f, "Draft"),
            FilingStatus::Confirmed => write!(f, "Confirmed"),
            FilingStatus::Submitted => write!(f, "Submitted"),
        }
    }
}

impl std::str::FromStr for FilingStatus {
    type Err = anyhow::Error;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "Draft" => Ok(FilingStatus::Draft),
            "Confirmed" => Ok(FilingStatus::Confirmed),
            "Submitted" => Ok(FilingStatus::Submitted),
            _ => Err(anyhow::anyhow!("Unknown status: {}", s)),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Filing {
    pub id: Uuid,
    pub taxpayer_id: Uuid,
    pub parent_filing_id: Option<Uuid>,
    pub year_of_assessment: i32,
    pub status: String,
    pub filing_reference: Option<String>,
    pub created_at: DateTime<Utc>,
    pub confirmed_at: Option<DateTime<Utc>>,
    pub total_income_ngn: Option<f64>,
    pub chargeable_income: Option<f64>,
    pub tax_payable: Option<f64>,
    pub wht_credit: Option<f64>,
    pub net_tax_payable: Option<f64>,
    pub minimum_tax: Option<f64>,
    pub final_tax_payable: Option<f64>,
    pub tax_config_version: String,
}

// ── Income Entry ─────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IncomeEntry {
    pub id: Uuid,
    pub filing_id: Uuid,
    pub income_type: String,
    pub description: Option<String>,
    pub gross_amount_ngn: f64,
    pub is_foreign: bool,
    pub foreign_currency: Option<String>,
    pub foreign_amount: Option<f64>,
    pub income_date: Option<NaiveDate>,
    pub fx_rate_fetched: Option<f64>,
    pub fx_rate_cbn_override: Option<f64>,
    pub fx_rate_used: Option<f64>,
    pub fx_rate_source: Option<String>,
    pub foreign_tax_paid_ngn: Option<f64>,
    pub is_cgt_exempt: bool,
    pub cgt_proceeds: Option<f64>,
    pub cgt_gain: Option<f64>,
    pub documents: Vec<Document>,
}

// ── Capital Allowance ─────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapitalAllowance {
    pub id: Uuid,
    pub filing_id: Uuid,
    pub asset_description: String,
    pub asset_type: String,
    pub asset_cost: f64,
    pub acquisition_date: NaiveDate,
    pub tax_written_down_value: f64,
    pub annual_allowance_rate: f64,
    pub annual_allowance_amount: f64,
    pub documents: Vec<Document>,
}

// ── Relief Entry ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReliefEntry {
    pub id: Uuid,
    pub filing_id: Uuid,
    pub relief_type: String,
    pub claimed_amount: f64,
    pub approved_amount: f64,
    pub wht_ref: Option<String>,
    pub wht_income_type: Option<String>,
    pub wht_date: Option<NaiveDate>,
    pub documents: Vec<Document>,
}

// ── Document ──────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub id: Uuid,
    pub parent_entry_id: Uuid,
    pub parent_entry_type: String,
    pub file_path: String,
    pub file_name: String,
    pub file_type: String,
    pub file_size_bytes: i64,
    pub uploaded_at: DateTime<Utc>,
}

// ── FX Cache ──────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FxCacheEntry {
    pub id: Uuid,
    pub base_currency: String,
    pub quote_currency: String,
    pub rate: f64,
    pub rate_date: NaiveDate,
    pub source: String,
    pub fetched_at: DateTime<Utc>,
}

// ── Tax Config ────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaxBand {
    pub lower: f64,
    pub upper: Option<f64>,
    pub rate: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReliefCaps {
    pub rent_relief_cap: f64,
    pub rent_relief_rate: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CgtThresholds {
    pub proceeds_threshold: f64,
    pub gain_threshold: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaxConfig {
    pub id: Uuid,
    pub version_label: String,
    pub governed_by: String,
    pub bands: Vec<TaxBand>,
    pub relief_caps: ReliefCaps,
    pub cgt_thresholds: CgtThresholds,
    pub allowance_rates: std::collections::HashMap<String, f64>,
    pub minimum_tax_rate: f64,
    pub is_active: bool,
    pub last_modified: DateTime<Utc>,
    pub modified_by: String,
}

// ── FX Result (returned to frontend) ─────────────────────────

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FxResult {
    pub rate: Option<f64>,
    pub source: String,
    pub rate_date: NaiveDate,
    pub is_cached: bool,
    pub cache_date: Option<NaiveDate>,
}

// ── Computation Result ────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BandResult {
    pub lower: f64,
    pub upper: Option<f64>,
    pub rate: f64,
    pub taxable_amount: f64,
    pub tax_amount: f64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComputationResult {
    pub total_gross_income: f64,
    pub total_capital_allowances: f64,
    pub prorated_capital_allowances: f64,
    pub total_deductions: f64,
    pub chargeable_income: f64,
    pub band_breakdown: Vec<BandResult>,
    pub graduated_tax: f64,
    pub wht_credits: f64,
    pub net_tax_payable: f64,
    pub minimum_tax: f64,
    pub final_tax_payable: f64,
    pub cgt_exempt_amount: f64,
    pub digital_asset_loss_ringfenced: f64,
    pub config_version: String,
    pub rent_relief_applied: f64,
}

// ── App Status ────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppStatus {
    pub has_db: bool,
    pub has_profile: bool,
    pub has_recovery: bool,
}

// ── LIRS Pending Filing (shared JSON schema) ──────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PendingFilingTaxpayer {
    pub full_name: String,
    pub tin: String,
    pub payer_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PendingFilingForeignIncome {
    pub total_usd: f64,
    pub currency: String,
    pub fx_rate_used: f64,
    pub fx_rate_source: String,
    pub naira_equivalent: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PendingFilingIncome {
    pub employment: f64,
    pub business: f64,
    pub rental: f64,
    pub dividend: f64,
    pub interest: f64,
    #[serde(rename = "capitalGain")]
    pub capital_gain: f64,
    #[serde(rename = "digitalAsset")]
    pub digital_asset: f64,
    pub royalty: f64,
    pub prize: f64,
    pub other: f64,
    pub foreign_income: PendingFilingForeignIncome,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PendingFilingAccommodation {
    #[serde(rename = "type")]
    pub acc_type: String,
    pub ownership: String,
    pub rent_paid: f64,
    pub rent_paid_by_employer: f64,
    pub date_started: String,
    pub date_end: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PendingFilingDeductions {
    pub pension: f64,
    pub nhf: f64,
    pub nhis: f64,
    #[serde(rename = "lifeAssurance")]
    pub life_assurance: f64,
    #[serde(rename = "rentReliefApplied")]
    pub rent_relief_applied: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PendingFilingComputation {
    #[serde(rename = "totalGrossIncome")]
    pub total_gross_income: f64,
    #[serde(rename = "totalCapitalAllowances")]
    pub total_capital_allowances: f64,
    #[serde(rename = "chargeableIncome")]
    pub chargeable_income: f64,
    #[serde(rename = "graduatedTax")]
    pub graduated_tax: f64,
    #[serde(rename = "whtCredits")]
    pub wht_credits: f64,
    #[serde(rename = "netTaxPayable")]
    pub net_tax_payable: f64,
    #[serde(rename = "minimumTax")]
    pub minimum_tax: f64,
    #[serde(rename = "finalTaxPayable")]
    pub final_tax_payable: f64,
    #[serde(rename = "configVersion")]
    pub config_version: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PendingFiling {
    #[serde(rename = "filingId")]
    pub filing_id: String,
    pub taxpayer: PendingFilingTaxpayer,
    #[serde(rename = "yearOfAssessment")]
    pub year_of_assessment: i32,
    #[serde(rename = "filingReference")]
    pub filing_reference: Option<String>,
    pub income: PendingFilingIncome,
    pub accommodation: PendingFilingAccommodation,
    pub deductions: PendingFilingDeductions,
    pub computation: PendingFilingComputation,
    #[serde(rename = "generatedAt")]
    pub generated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LIRSAutomationResult {
    pub success: bool,
    pub fallback_active: bool,
    pub message: String,
    pub pending_filing_path: Option<String>,
    pub filing_id: String,
}
