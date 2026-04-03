"""
Unit tests for ComputationEngine.

Tests:
  - Zero income → final_tax_payable = 0
  - Income in first band only (₦500,000) → 0% tax
  - Income spanning multiple bands → correct marginal tax
  - Digital asset loss does not reduce other income
  - CGT exemption applied when both thresholds met
  - CGT exemption NOT applied when either threshold exceeded
"""

import pytest
from dataclasses import dataclass
from typing import Optional

from lagosfile.services.computation_engine import ComputationEngine, FilingData
from lagosfile.services.config_engine import TaxConfig, NTA_2025_BANDS


# ---------------------------------------------------------------------------
# Helpers — simple in-memory stand-ins for ORM objects
# ---------------------------------------------------------------------------

@dataclass
class IncomeEntry:
    income_type: str
    gross_amount_ngn: float
    cgt_proceeds: Optional[float] = None
    cgt_gain: Optional[float] = None


@dataclass
class CapitalAllowance:
    annual_allowance_amount: float


@dataclass
class ReliefEntry:
    relief_type: str
    approved_amount: float
    claimed_amount: float = 0.0


def make_config(**overrides) -> TaxConfig:
    """Return the NTA 2025 config, optionally overriding fields."""
    base = TaxConfig(
        version_label="Test Config v1.0",
        bands=NTA_2025_BANDS,
        rent_relief_cap=500_000.0,
        cgt_proceeds_threshold=150_000_000.0,
        cgt_gain_threshold=10_000_000.0,
        allowance_rates={},
        minimum_tax_rate=0.01,
    )
    for k, v in overrides.items():
        object.__setattr__(base, k, v)
    return base


def make_filing(
    income_entries=None,
    capital_allowances=None,
    relief_entries=None,
) -> FilingData:
    return FilingData(
        income_entries=income_entries or [],
        capital_allowances=capital_allowances or [],
        relief_entries=relief_entries or [],
    )


engine = ComputationEngine()


# ---------------------------------------------------------------------------
# Test 1: Zero income → final_tax_payable = 0
# ---------------------------------------------------------------------------

def test_zero_income_zero_tax():
    """With no income entries, all computed values should be zero."""
    result = engine.compute(make_filing(), make_config())

    assert result.total_gross_income == 0.0
    assert result.chargeable_income == 0.0
    assert result.graduated_tax == 0.0
    assert result.minimum_tax == 0.0
    assert result.final_tax_payable == 0.0


# ---------------------------------------------------------------------------
# Test 2: Income in first band only (₦500,000) → 0% tax
# ---------------------------------------------------------------------------

def test_income_in_first_band_zero_tax():
    """₦500,000 falls entirely in the 0% band (₦0–₦800,000)."""
    filing = make_filing(
        income_entries=[IncomeEntry(income_type="business", gross_amount_ngn=500_000.0)]
    )
    result = engine.compute(filing, make_config())

    assert result.total_gross_income == 500_000.0
    assert result.chargeable_income == 500_000.0
    assert result.graduated_tax == 0.0
    # minimum tax = 500_000 * 0.01 = 5_000
    assert result.minimum_tax == pytest.approx(5_000.0)
    assert result.final_tax_payable == pytest.approx(5_000.0)


# ---------------------------------------------------------------------------
# Test 3: Income spanning multiple bands → correct marginal tax
# ---------------------------------------------------------------------------

def test_income_spanning_multiple_bands():
    """₦5,000,000 spans bands 1 (0%), 2 (15%), and 3 (18%).

    Band 1: ₦0–₦800,000 → ₦800,000 @ 0%   = ₦0
    Band 2: ₦800k–₦3M   → ₦2,200,000 @ 15% = ₦330,000
    Band 3: ₦3M–₦12M    → ₦2,000,000 @ 18% = ₦360,000
    Total graduated tax = ₦690,000
    """
    filing = make_filing(
        income_entries=[IncomeEntry(income_type="business", gross_amount_ngn=5_000_000.0)]
    )
    result = engine.compute(filing, make_config())

    assert result.total_gross_income == 5_000_000.0
    assert result.chargeable_income == 5_000_000.0
    assert result.graduated_tax == pytest.approx(690_000.0)

    # Verify band breakdown
    assert len(result.band_breakdown) == 3
    assert result.band_breakdown[0].taxable_amount == pytest.approx(800_000.0)
    assert result.band_breakdown[0].tax_amount == pytest.approx(0.0)
    assert result.band_breakdown[1].taxable_amount == pytest.approx(2_200_000.0)
    assert result.band_breakdown[1].tax_amount == pytest.approx(330_000.0)
    assert result.band_breakdown[2].taxable_amount == pytest.approx(2_000_000.0)
    assert result.band_breakdown[2].tax_amount == pytest.approx(360_000.0)

    # minimum tax = 5_000_000 * 0.01 = 50_000 < 690_000
    assert result.minimum_tax == pytest.approx(50_000.0)
    assert result.final_tax_payable == pytest.approx(690_000.0)


# ---------------------------------------------------------------------------
# Test 4: Digital asset loss does not reduce other income
# ---------------------------------------------------------------------------

def test_digital_asset_loss_does_not_reduce_other_income():
    """A net digital asset loss of ₦200,000 should not reduce ₦1,000,000 other income."""
    filing = make_filing(
        income_entries=[
            IncomeEntry(income_type="business", gross_amount_ngn=1_000_000.0),
            IncomeEntry(income_type="digital_asset", gross_amount_ngn=-200_000.0),
        ]
    )
    result = engine.compute(filing, make_config())

    # digital_net = max(-200_000, 0) = 0; total_gross = 1_000_000 + 0
    assert result.total_gross_income == pytest.approx(1_000_000.0)
    assert result.digital_asset_loss_ringfenced == pytest.approx(200_000.0)


def test_digital_asset_gain_adds_to_total():
    """A net digital asset gain of ₦300,000 should add to total gross income."""
    filing = make_filing(
        income_entries=[
            IncomeEntry(income_type="business", gross_amount_ngn=1_000_000.0),
            IncomeEntry(income_type="digital_asset", gross_amount_ngn=300_000.0),
        ]
    )
    result = engine.compute(filing, make_config())

    assert result.total_gross_income == pytest.approx(1_300_000.0)
    assert result.digital_asset_loss_ringfenced == 0.0


# ---------------------------------------------------------------------------
# Test 5: CGT exemption applied when BOTH thresholds met
# ---------------------------------------------------------------------------

def test_cgt_exemption_applied_when_both_thresholds_met():
    """Gain from Nigerian company shares with proceeds < ₦150M AND gain ≤ ₦10M
    should be excluded from chargeable income."""
    filing = make_filing(
        income_entries=[
            IncomeEntry(income_type="business", gross_amount_ngn=1_000_000.0),
            IncomeEntry(
                income_type="capital_gain_shares",
                gross_amount_ngn=5_000_000.0,
                cgt_proceeds=100_000_000.0,   # < 150M threshold ✓
                cgt_gain=8_000_000.0,          # ≤ 10M threshold ✓
            ),
        ]
    )
    result = engine.compute(filing, make_config())

    # CGT entry excluded → total_gross = 1_000_000 only
    assert result.total_gross_income == pytest.approx(1_000_000.0)
    assert result.cgt_exempt_amount == pytest.approx(5_000_000.0)


# ---------------------------------------------------------------------------
# Test 6a: CGT exemption NOT applied when proceeds threshold exceeded
# ---------------------------------------------------------------------------

def test_cgt_exemption_not_applied_when_proceeds_exceed_threshold():
    """Proceeds ≥ ₦150M → CGT exemption does NOT apply."""
    filing = make_filing(
        income_entries=[
            IncomeEntry(
                income_type="capital_gain_shares",
                gross_amount_ngn=5_000_000.0,
                cgt_proceeds=150_000_000.0,   # NOT < 150M (equal, so fails)
                cgt_gain=8_000_000.0,
            ),
        ]
    )
    result = engine.compute(filing, make_config())

    assert result.total_gross_income == pytest.approx(5_000_000.0)
    assert result.cgt_exempt_amount == 0.0


# ---------------------------------------------------------------------------
# Test 6b: CGT exemption NOT applied when gain threshold exceeded
# ---------------------------------------------------------------------------

def test_cgt_exemption_not_applied_when_gain_exceeds_threshold():
    """Gain > ₦10M → CGT exemption does NOT apply."""
    filing = make_filing(
        income_entries=[
            IncomeEntry(
                income_type="capital_gain_shares",
                gross_amount_ngn=12_000_000.0,
                cgt_proceeds=100_000_000.0,   # < 150M ✓
                cgt_gain=10_000_001.0,         # > 10M ✗
            ),
        ]
    )
    result = engine.compute(filing, make_config())

    assert result.total_gross_income == pytest.approx(12_000_000.0)
    assert result.cgt_exempt_amount == 0.0


# ---------------------------------------------------------------------------
# Additional: WHT credits reduce net tax payable
# ---------------------------------------------------------------------------

def test_wht_credits_reduce_net_tax():
    """WHT credits should reduce net_tax_payable (but not below 0)."""
    filing = make_filing(
        income_entries=[IncomeEntry(income_type="business", gross_amount_ngn=5_000_000.0)],
        relief_entries=[ReliefEntry(relief_type="wht", approved_amount=100_000.0)],
    )
    result = engine.compute(filing, make_config())

    # graduated_tax = 690_000; wht = 100_000 → net = 590_000
    assert result.wht_credits == pytest.approx(100_000.0)
    assert result.net_tax_payable == pytest.approx(590_000.0)
    assert result.final_tax_payable == pytest.approx(590_000.0)


def test_wht_credits_cannot_make_net_tax_negative():
    """WHT credits larger than graduated tax → net_tax_payable = 0."""
    filing = make_filing(
        income_entries=[IncomeEntry(income_type="business", gross_amount_ngn=500_000.0)],
        relief_entries=[ReliefEntry(relief_type="wht", approved_amount=999_999.0)],
    )
    result = engine.compute(filing, make_config())

    # graduated_tax = 0 (first band); wht = 999_999 → net = max(0 - 999_999, 0) = 0
    assert result.net_tax_payable == 0.0


# ---------------------------------------------------------------------------
# Additional: Rent relief calculation
# ---------------------------------------------------------------------------

def test_rent_relief_capped():
    """Rent relief = min(annual_rent * 0.20, cap). Cap is ₦500,000."""
    # annual_rent = ₦4,000,000 → 20% = ₦800,000 → capped at ₦500,000
    filing = make_filing(
        income_entries=[IncomeEntry(income_type="business", gross_amount_ngn=5_000_000.0)],
        relief_entries=[ReliefEntry(relief_type="rent", approved_amount=4_000_000.0)],
    )
    result = engine.compute(filing, make_config())

    assert result.total_deductions == pytest.approx(500_000.0)


def test_rent_relief_below_cap():
    """Rent relief = 20% of rent when below cap."""
    # annual_rent = ₦1,000,000 → 20% = ₦200,000 (below ₦500,000 cap)
    filing = make_filing(
        income_entries=[IncomeEntry(income_type="business", gross_amount_ngn=5_000_000.0)],
        relief_entries=[ReliefEntry(relief_type="rent", approved_amount=1_000_000.0)],
    )
    result = engine.compute(filing, make_config())

    assert result.total_deductions == pytest.approx(200_000.0)


# ---------------------------------------------------------------------------
# Additional: config_version is recorded
# ---------------------------------------------------------------------------

def test_config_version_recorded():
    """ComputationResult should record the config version label."""
    config = make_config(version_label="Test Config v2.0")
    result = engine.compute(make_filing(), config)
    assert result.config_version == "Test Config v2.0"
