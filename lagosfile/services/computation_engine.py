"""
Computation Engine — computes tax liability from filing data and Tax_Config.

Requirements: 4.4, 4.5, 8.1, 8.2, 8.3, 8.6, 8.7
"""

from dataclasses import dataclass, field
from typing import List, Optional

from lagosfile.services.config_engine import TaxBand, TaxConfig


# ---------------------------------------------------------------------------
# Input / output dataclasses
# ---------------------------------------------------------------------------

@dataclass
class FilingData:
    """Aggregated filing data passed to the computation engine.

    income_entries: list of objects with attributes:
        - income_type: str
        - gross_amount_ngn: float
        - cgt_proceeds: float | None
        - cgt_gain: float | None
    capital_allowances: list of objects with attribute:
        - annual_allowance_amount: float
    relief_entries: list of objects with attributes:
        - relief_type: str  (e.g. "pension", "nhis", "nhf", "rent", "wht",
                              "life_assurance", "other_approved")
        - approved_amount: float
        - claimed_amount: float
    """
    income_entries: list
    capital_allowances: list
    relief_entries: list


@dataclass
class BandResult:
    band: TaxBand
    taxable_amount: float
    tax_amount: float


@dataclass
class ComputationResult:
    total_gross_income: float
    total_capital_allowances: float
    prorated_capital_allowances: float
    total_deductions: float
    chargeable_income: float
    band_breakdown: List[BandResult]
    graduated_tax: float
    wht_credits: float
    net_tax_payable: float
    minimum_tax: float
    final_tax_payable: float
    cgt_exempt_amount: float
    digital_asset_loss_ringfenced: float
    config_version: str


# ---------------------------------------------------------------------------
# ComputationEngine
# ---------------------------------------------------------------------------

class ComputationEngine:
    """Pure computation engine — no database access.

    Accepts a FilingData and TaxConfig and returns a ComputationResult.
    All tax rates and thresholds are read exclusively from TaxConfig.
    """

    def compute(self, filing_data: FilingData, config: TaxConfig) -> ComputationResult:
        """Compute tax liability following the NTA 2025 rules.

        Steps:
          1. Separate digital asset entries from other entries.
          2. Ring-fence digital losses (cannot reduce other income).
          3. Apply CGT exemption to qualifying Nigerian company share gains.
          4. Compute total gross income.
          5. Capital allowance proration (non_taxable_income = 0 in task 3.1).
          6. Compute deductions and reliefs.
          7. Compute chargeable income.
          8. Apply progressive tax bands.
          9. Apply WHT credits.
          10. Apply minimum tax check.
        """
        income_entries = list(filing_data.income_entries)

        # ------------------------------------------------------------------
        # Step 1: Separate digital asset entries
        # ------------------------------------------------------------------
        digital_entries = [
            e for e in income_entries if e.income_type == "digital_asset"
        ]
        other_entries = [
            e for e in income_entries if e.income_type != "digital_asset"
        ]

        # ------------------------------------------------------------------
        # Step 2: Ring-fence digital asset losses
        # ------------------------------------------------------------------
        digital_gross = sum(e.gross_amount_ngn for e in digital_entries)
        digital_net = max(digital_gross, 0.0)
        digital_asset_loss_ringfenced = abs(min(digital_gross, 0.0))

        # ------------------------------------------------------------------
        # Step 3: Apply CGT exemption
        # ------------------------------------------------------------------
        cgt_exempt_amount = 0.0
        # Work on copies so we don't mutate the caller's objects
        processed_other: list = []
        for entry in other_entries:
            if entry.income_type == "capital_gain_shares":
                proceeds = getattr(entry, "cgt_proceeds", None) or 0.0
                gain = getattr(entry, "cgt_gain", None) or 0.0
                if (
                    proceeds < config.cgt_proceeds_threshold
                    and gain <= config.cgt_gain_threshold
                ):
                    cgt_exempt_amount += entry.gross_amount_ngn
                    # Exclude from computation — use 0 for this entry
                    processed_other.append(_ZeroedEntry(entry))
                    continue
            processed_other.append(entry)

        # ------------------------------------------------------------------
        # Step 4: Total gross income
        # ------------------------------------------------------------------
        total_gross = (
            sum(e.gross_amount_ngn for e in processed_other) + digital_net
        )

        # ------------------------------------------------------------------
        # Step 5: Capital allowance proration
        # (non_taxable_income = 0 for task 3.1; proration implemented in 3.4)
        # ------------------------------------------------------------------
        total_ca = sum(
            ca.annual_allowance_amount for ca in filing_data.capital_allowances
        )
        non_taxable_income = 0.0  # placeholder — task 3.4 will populate this
        if total_gross > 0 and non_taxable_income / total_gross >= 0.10:
            proration_ratio = (total_gross - non_taxable_income) / total_gross
            effective_ca = total_ca * proration_ratio
        else:
            effective_ca = total_ca

        # ------------------------------------------------------------------
        # Step 6: Deductions and reliefs
        # ------------------------------------------------------------------
        annual_rent = 0.0
        pension = 0.0
        nhis = 0.0
        nhf = 0.0
        life_assurance = 0.0
        other_approved = 0.0
        wht_credits = 0.0

        for r in filing_data.relief_entries:
            rtype = r.relief_type.lower()
            amount = r.approved_amount

            if rtype == "rent":
                annual_rent += amount
            elif rtype == "pension":
                pension += amount
            elif rtype == "nhis":
                nhis += amount
            elif rtype == "nhf":
                nhf += amount
            elif rtype == "life_assurance":
                life_assurance += amount
            elif rtype == "wht":
                wht_credits += amount
            elif rtype == "other_approved":
                other_approved += amount

        rent_relief = min(annual_rent * 0.20, config.rent_relief_cap)
        other_deductions = (
            pension + nhis + nhf + rent_relief + life_assurance + other_approved
        )
        total_deductions = other_deductions  # WHT applied after graduated tax

        # ------------------------------------------------------------------
        # Step 7: Chargeable income
        # ------------------------------------------------------------------
        chargeable_income = max(total_gross - effective_ca - total_deductions, 0.0)

        # ------------------------------------------------------------------
        # Step 8: Progressive tax bands
        # ------------------------------------------------------------------
        graduated_tax = 0.0
        band_breakdown: List[BandResult] = []
        remaining = chargeable_income

        # Bands in TaxConfig are stored as dicts: {"lower", "upper", "rate"}
        sorted_bands = sorted(config.bands, key=lambda b: b["lower"])

        for band_dict in sorted_bands:
            if remaining <= 0:
                break
            lower = band_dict["lower"]
            upper = band_dict["upper"]
            rate = band_dict["rate"]

            band_size = (upper - lower) if upper is not None else remaining
            taxable_in_band = min(remaining, band_size)
            band_tax = taxable_in_band * rate

            graduated_tax += band_tax
            remaining -= taxable_in_band

            band_breakdown.append(
                BandResult(
                    band=TaxBand(lower=lower, upper=upper, rate=rate),
                    taxable_amount=taxable_in_band,
                    tax_amount=band_tax,
                )
            )

        # ------------------------------------------------------------------
        # Step 9: WHT credits
        # ------------------------------------------------------------------
        net_tax_payable = max(graduated_tax - wht_credits, 0.0)

        # ------------------------------------------------------------------
        # Step 10: Minimum tax check
        # ------------------------------------------------------------------
        minimum_tax = total_gross * config.minimum_tax_rate
        final_tax_payable = max(net_tax_payable, minimum_tax)

        return ComputationResult(
            total_gross_income=total_gross,
            total_capital_allowances=total_ca,
            prorated_capital_allowances=effective_ca,
            total_deductions=total_deductions,
            chargeable_income=chargeable_income,
            band_breakdown=band_breakdown,
            graduated_tax=graduated_tax,
            wht_credits=wht_credits,
            net_tax_payable=net_tax_payable,
            minimum_tax=minimum_tax,
            final_tax_payable=final_tax_payable,
            cgt_exempt_amount=cgt_exempt_amount,
            digital_asset_loss_ringfenced=digital_asset_loss_ringfenced,
            config_version=config.version_label,
        )


# ---------------------------------------------------------------------------
# Internal helper
# ---------------------------------------------------------------------------

class _ZeroedEntry:
    """Wraps an income entry but reports gross_amount_ngn = 0 (CGT-exempt)."""

    def __init__(self, original) -> None:
        self._original = original

    def __getattr__(self, name: str):
        if name == "gross_amount_ngn":
            return 0.0
        return getattr(self._original, name)
