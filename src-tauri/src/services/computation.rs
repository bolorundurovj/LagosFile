use crate::models::*;
use anyhow::Result;

pub struct ComputationEngine;

impl ComputationEngine {
    pub fn compute(
        income_entries: &[IncomeEntry],
        capital_allowances: &[CapitalAllowance],
        relief_entries: &[ReliefEntry],
        config: &TaxConfig,
    ) -> Result<ComputationResult> {
        let digital_entries: Vec<_> = income_entries
            .iter()
            .filter(|e| e.income_type == "digital_asset")
            .collect();
        let other_entries: Vec<_> = income_entries
            .iter()
            .filter(|e| e.income_type != "digital_asset")
            .collect();

        let digital_gross: f64 = digital_entries.iter().map(|e| e.gross_amount_ngn).sum();
        let digital_net = digital_gross.max(0.0);
        let digital_asset_loss_ringfenced = (-digital_gross).max(0.0);

        let mut cgt_exempt_amount = 0.0;
        let mut effective_other_income = 0.0;

        for entry in &other_entries {
            if entry.income_type == "capital_gain_shares" {
                let proceeds = entry.cgt_proceeds.unwrap_or(0.0);
                let gain = entry.cgt_gain.unwrap_or(0.0);
                if proceeds < config.cgt_thresholds.proceeds_threshold
                    && gain <= config.cgt_thresholds.gain_threshold
                {
                    cgt_exempt_amount += entry.gross_amount_ngn;
                    continue; // excluded from chargeable income
                }
            }
            effective_other_income += entry.gross_amount_ngn;
        }

        let total_gross = effective_other_income + digital_net;

        let total_ca: f64 = capital_allowances
            .iter()
            .map(|ca| ca.annual_allowance_amount)
            .sum();

        // if non-taxable income (CGT-exempt gains) is ≥ 10% of total gross
        // receipts, prorate capital allowances by the taxable fraction.
        // "Total income" for this rule = taxable gross + CGT-exempt gross (digital
        // losses are not income so they don't enter the denominator).
        let total_receipts = total_gross + cgt_exempt_amount;
        let prorated_ca = if total_receipts > 0.0
            && (cgt_exempt_amount / total_receipts) >= 0.10
        {
            total_ca * (total_gross / total_receipts)
        } else {
            total_ca
        };

        let mut pension = 0.0f64;
        let mut nhis = 0.0f64;
        let mut nhf = 0.0f64;
        let mut life_assurance = 0.0f64;
        let mut annual_rent = 0.0f64;
        let mut wht_credits = 0.0f64;
        let mut other_approved = 0.0f64;

        for r in relief_entries {
            let amount = r.approved_amount;
            match r.relief_type.as_str() {
                "pension" => pension += amount,
                "nhis" => nhis += amount,
                "nhf" => nhf += amount,
                "life_assurance" => life_assurance += amount,
                "rent" => annual_rent += amount,
                "wht" => wht_credits += amount,
                "other_approved" => other_approved += amount,
                _ => {}
            }
        }

        let rent_relief = (annual_rent * config.relief_caps.rent_relief_rate)
            .min(config.relief_caps.rent_relief_cap);

        let total_deductions = pension + nhis + nhf + life_assurance + rent_relief + other_approved;

        let chargeable_income = (total_gross - prorated_ca - total_deductions).max(0.0);

        let mut sorted_bands = config.bands.clone();
        sorted_bands.sort_by(|a, b| a.lower.partial_cmp(&b.lower).unwrap());

        let mut graduated_tax = 0.0f64;
        let mut band_breakdown = Vec::new();
        let mut remaining = chargeable_income;

        for band in &sorted_bands {
            if remaining <= 0.0 {
                break;
            }
            let band_size = match band.upper {
                Some(upper) => upper - band.lower,
                None => remaining,
            };
            let taxable_in_band = remaining.min(band_size);
            let band_tax = taxable_in_band * band.rate;
            graduated_tax += band_tax;
            remaining -= taxable_in_band;
            band_breakdown.push(BandResult {
                lower: band.lower,
                upper: band.upper,
                rate: band.rate,
                taxable_amount: taxable_in_band,
                tax_amount: band_tax,
            });
        }

        let net_tax_payable = (graduated_tax - wht_credits).max(0.0);
        let minimum_tax = total_gross * config.minimum_tax_rate;
        let final_tax_payable = net_tax_payable.max(minimum_tax);

        Ok(ComputationResult {
            total_gross_income: total_gross,
            total_capital_allowances: total_ca,
            prorated_capital_allowances: prorated_ca,
            total_deductions,
            chargeable_income,
            band_breakdown,
            graduated_tax,
            wht_credits,
            net_tax_payable,
            minimum_tax,
            final_tax_payable,
            cgt_exempt_amount,
            digital_asset_loss_ringfenced,
            config_version: config.version_label.clone(),
            rent_relief_applied: rent_relief,
        })
    }
}
