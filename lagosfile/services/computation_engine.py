from dataclasses import dataclass

from lagosfile.services.config_engine import TaxBand, TaxConfig


@dataclass
class FilingData:
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
    band_breakdown: list[BandResult]
    graduated_tax: float
    wht_credits: float
    net_tax_payable: float
    minimum_tax: float
    final_tax_payable: float
    cgt_exempt_amount: float
    digital_asset_loss_ringfenced: float
    config_version: str


class ComputationEngine:
    def compute(self, filing_data: FilingData, config: TaxConfig) -> ComputationResult:
        income_entries = list(filing_data.income_entries)
        digital_entries = [e for e in income_entries if e.income_type == "digital_asset"]
        other_entries = [e for e in income_entries if e.income_type != "digital_asset"]
        digital_gross = sum(e.gross_amount_ngn for e in digital_entries)
        digital_net = max(digital_gross, 0.0)
        digital_asset_loss_ringfenced = abs(min(digital_gross, 0.0))
        cgt_exempt_amount = 0.0
        processed_other: list = []
        for entry in other_entries:
            if entry.income_type == "capital_gain_shares":
                proceeds = getattr(entry, "cgt_proceeds", None) or 0.0
                gain = getattr(entry, "cgt_gain", None) or 0.0
                if proceeds < config.cgt_proceeds_threshold and gain <= config.cgt_gain_threshold:
                    cgt_exempt_amount += entry.gross_amount_ngn
                    processed_other.append(_ZeroedEntry(entry))
                    continue
            processed_other.append(entry)
        total_gross = sum(e.gross_amount_ngn for e in processed_other) + digital_net
        total_ca = sum(ca.annual_allowance_amount for ca in filing_data.capital_allowances)
        non_taxable_income = 0.0  # placeholder — task 3.4 will populate this
        if total_gross > 0 and non_taxable_income / total_gross >= 0.10:
            proration_ratio = (total_gross - non_taxable_income) / total_gross
            effective_ca = total_ca * proration_ratio
        else:
            effective_ca = total_ca
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
        other_deductions = pension + nhis + nhf + rent_relief + life_assurance + other_approved
        total_deductions = other_deductions  # WHT applied after graduated tax
        chargeable_income = max(total_gross - effective_ca - total_deductions, 0.0)
        graduated_tax = 0.0
        band_breakdown: list[BandResult] = []
        remaining = chargeable_income
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
        net_tax_payable = max(graduated_tax - wht_credits, 0.0)
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


class _ZeroedEntry:
    def __init__(self, original) -> None:
        self._original = original

    def __getattr__(self, name: str):
        if name == "gross_amount_ngn":
            return 0.0
        return getattr(self._original, name)
