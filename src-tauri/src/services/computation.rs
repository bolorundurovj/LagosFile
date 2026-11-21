use crate::models::*;
use anyhow::Result;

fn cap(amount: f64, cap: Option<f64>) -> f64 {
    match cap {
        Some(c) if c.is_finite() && c >= 0.0 => amount.min(c),
        _ => amount,
    }
}

/// The share-disposal exemption is tested on aggregate proceeds and gains over
/// 12 consecutive months, not per disposal. A filing covers one year of
/// assessment, so every share disposal in it falls in the same window.
pub fn cgt_shares_exempt(income_entries: &[IncomeEntry], thresholds: &CgtThresholds) -> bool {
    let (proceeds, gain) = income_entries
        .iter()
        .filter(|e| e.income_type == "capital_gain_shares")
        .fold((0.0, 0.0), |(p, g), e| {
            (
                p + e.cgt_proceeds.unwrap_or(0.0).max(0.0),
                g + e.cgt_gain.unwrap_or(e.gross_amount_ngn).max(0.0),
            )
        });
    proceeds < thresholds.proceeds_threshold && gain <= thresholds.gain_threshold
}

/// Straight-line allowance on cost, never exceeding the opening written-down
/// value (an asset with no recorded WDV is treated as newly acquired).
pub fn straight_line_allowance(ca: &CapitalAllowance) -> f64 {
    let opening_wdv = if ca.tax_written_down_value > 0.0 {
        ca.tax_written_down_value
    } else {
        ca.asset_cost
    };
    (ca.asset_cost * ca.annual_allowance_rate)
        .min(opening_wdv)
        .max(0.0)
}

/// Computes the taxable value of a benefits-in-kind entry per NTA 2025 s.14:
/// - `employer_owned_asset`: 5% of employer's acquisition/market cost (s.14(1)(a))
/// - `rented_asset`: 100% of annual rent or hire paid by employer (s.14(1)(b))
/// - `accommodation`: annual rental value capped at 20% of annual gross employment income (s.14(6))
/// - `other`: 100% of employer's cost (s.14(1)(c))
///
/// Legacy rows without `bik_category`/`bik_cost` fall back to `gross_amount_ngn`.
pub fn bik_taxable_value(entry: &IncomeEntry, total_employment_income: f64) -> f64 {
    match (entry.bik_category.as_deref(), entry.bik_cost) {
        (Some("employer_owned_asset"), Some(cost)) => (cost.max(0.0)) * 0.05,
        (Some("rented_asset"), Some(cost)) => cost.max(0.0),
        (Some("accommodation"), Some(cost)) => {
            let cap_20pct = (total_employment_income.max(0.0)) * 0.20;
            cost.max(0.0).min(cap_20pct)
        }
        (Some("other"), Some(cost)) => cost.max(0.0),
        _ => entry.gross_amount_ngn.max(0.0),
    }
}

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

        let share_disposals_exempt = cgt_shares_exempt(income_entries, &config.cgt_thresholds);

        let total_employment_income: f64 = income_entries
            .iter()
            .filter(|e| e.income_type == "employment")
            .map(|e| e.gross_amount_ngn.max(0.0))
            .sum();
        let mut remaining_accommodation_cap = total_employment_income * 0.20;

        let mut cgt_exempt_amount = 0.0;
        let mut effective_other_income = 0.0;

        for entry in &other_entries {
            if entry.income_type == "capital_gain_shares" {
                let gain_amount = entry.cgt_gain.unwrap_or(entry.gross_amount_ngn).max(0.0);
                if share_disposals_exempt {
                    cgt_exempt_amount += gain_amount;
                    continue;
                }
                effective_other_income += gain_amount;
                continue;
            }
            if entry.income_type == "benefits_in_kind" {
                let val = match (entry.bik_category.as_deref(), entry.bik_cost) {
                    (Some("accommodation"), Some(cost)) => {
                        let capped = cost.max(0.0).min(remaining_accommodation_cap);
                        remaining_accommodation_cap =
                            (remaining_accommodation_cap - capped).max(0.0);
                        capped
                    }
                    _ => bik_taxable_value(entry, total_employment_income),
                };
                effective_other_income += val;
                continue;
            }
            effective_other_income += entry.gross_amount_ngn.max(0.0);
        }

        let total_gross = effective_other_income + digital_net;

        let total_ca: f64 = capital_allowances.iter().map(straight_line_allowance).sum();

        // if non-taxable income (CGT-exempt gains) is ≥ 10% of total gross
        // receipts, prorate capital allowances by the taxable fraction.
        // "Total income" for this rule = taxable gross + CGT-exempt gross (digital
        // losses are not income so they don't enter the denominator).
        let total_receipts = total_gross + cgt_exempt_amount;
        let prorated_ca = if total_receipts > 0.0 && (cgt_exempt_amount / total_receipts) >= 0.10 {
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
        let mut paye_credits = 0.0f64;
        let mut other_approved = 0.0f64;

        for r in relief_entries {
            let amount = r.approved_amount.max(0.0);
            match r.relief_type.as_str() {
                "pension" => pension += amount,
                "nhis" => nhis += amount,
                "nhf" => nhf += amount,
                "life_assurance" => life_assurance += amount,
                "rent" => annual_rent += amount,
                "wht" => wht_credits += amount,
                "paye" => paye_credits += amount,
                "other_approved" => other_approved += amount,
                _ => {}
            }
        }

        // PITA (CRA) and NTA 2025 (Rent Relief) are mutually exclusive regimes;
        // never allow CRA + Rent Relief double-dipping even on custom configs.
        let rent_relief = if config.relief_caps.cra_enabled {
            0.0
        } else {
            (annual_rent * config.relief_caps.rent_relief_rate)
                .min(config.relief_caps.rent_relief_cap)
                .max(0.0)
        };

        let pension = cap(pension, config.relief_caps.pension_cap);
        let nhis = cap(nhis, config.relief_caps.nhis_cap);
        let nhf = cap(nhf, config.relief_caps.nhf_cap);

        // PITA Consolidated Relief Allowance (Finance Act 2020 s.30 amending PITA s.33(2),
        // effective 1 Jan 2021 through 2025):
        // "gross income" for CRA = income from all sources less capital allowances and
        // Sixth Schedule para 2 tax-exempt deductions (Pension, NHF, NHIS, Life Assurance).
        // CRA = max(₦200,000, 1% of adjusted gross income) + 20% of adjusted gross income.
        // NTA 2025 replaces CRA with rent relief (cra_enabled = false).
        let consolidated_relief_allowance = if config.relief_caps.cra_enabled {
            let cra_base =
                (total_gross - prorated_ca - pension - nhis - nhf - life_assurance).max(0.0);
            if cra_base > 0.0 {
                (200_000.0_f64.max(cra_base * 0.01) + cra_base * 0.20).min(cra_base)
            } else {
                0.0
            }
        } else {
            0.0
        };

        let total_deductions = pension
            + nhis
            + nhf
            + life_assurance
            + rent_relief
            + consolidated_relief_allowance
            + other_approved;

        let chargeable_income = (total_gross - prorated_ca - total_deductions).max(0.0);

        let mut sorted_bands = config.bands.clone();
        sorted_bands.sort_by(|a, b| a.lower.total_cmp(&b.lower));

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

        let minimum_tax = total_gross * config.minimum_tax_rate;
        let tax_before_credits = graduated_tax.max(minimum_tax);

        // Foreign tax credit is limited per income entry to the Nigerian tax attributable
        // to that entry's actual contribution to `total_gross` (respecting netted digital gains
        // and the cumulative 20% employment-income cap on accommodation BIKs).
        let mut foreign_tax_credits = 0.0f64;
        if total_gross > 0.0 && tax_before_credits > 0.0 {
            let positive_digital_sum: f64 = digital_entries
                .iter()
                .map(|e| e.gross_amount_ngn.max(0.0))
                .sum();
            let mut ftc_remaining_accomm_cap = total_employment_income * 0.20;

            for entry in income_entries {
                if entry.income_type == "capital_gain_shares" && share_disposals_exempt {
                    continue;
                }
                let entry_amount = if entry.income_type == "digital_asset" {
                    if digital_net <= 0.0 || positive_digital_sum <= 0.0 {
                        0.0
                    } else {
                        digital_net * (entry.gross_amount_ngn.max(0.0) / positive_digital_sum)
                    }
                } else if entry.income_type == "capital_gain_shares" {
                    entry.cgt_gain.unwrap_or(entry.gross_amount_ngn).max(0.0)
                } else if entry.income_type == "benefits_in_kind" {
                    match (entry.bik_category.as_deref(), entry.bik_cost) {
                        (Some("accommodation"), Some(cost)) => {
                            let capped = cost.max(0.0).min(ftc_remaining_accomm_cap);
                            ftc_remaining_accomm_cap =
                                (ftc_remaining_accomm_cap - capped).max(0.0);
                            capped
                        }
                        _ => bik_taxable_value(entry, total_employment_income),
                    }
                } else {
                    entry.gross_amount_ngn.max(0.0)
                };

                if let Some(ft_paid) = entry.foreign_tax_paid_ngn {
                    if ft_paid > 0.0 && entry_amount > 0.0 {
                        let attributable_tax =
                            tax_before_credits * (entry_amount / total_gross);
                        foreign_tax_credits += ft_paid.min(attributable_tax).max(0.0);
                    }
                }
            }
        }

        let total_credits = wht_credits + paye_credits + foreign_tax_credits;
        let net_tax_payable = (tax_before_credits - total_credits).max(0.0);
        let final_tax_payable = net_tax_payable;

        Ok(ComputationResult {
            total_gross_income: total_gross,
            total_capital_allowances: total_ca,
            prorated_capital_allowances: prorated_ca,
            total_deductions,
            chargeable_income,
            band_breakdown,
            graduated_tax,
            wht_credits,
            paye_credits,
            foreign_tax_credits,
            net_tax_payable,
            minimum_tax,
            final_tax_payable,
            cgt_exempt_amount,
            digital_asset_loss_ringfenced,
            config_version: config.version_label.clone(),
            rent_relief_applied: rent_relief,
            consolidated_relief_allowance,
        })
    }
}
