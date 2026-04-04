from dataclasses import dataclass

import pytest

from lagosfile.services.computation_engine import ComputationEngine, FilingData
from lagosfile.services.config_engine import NTA_2025_BANDS, TaxConfig


@dataclass
class IncomeEntry:
    income_type: str
    gross_amount_ngn: float
    cgt_proceeds: float | None = None
    cgt_gain: float | None = None


@dataclass
class CapitalAllowance:
    annual_allowance_amount: float


@dataclass
class ReliefEntry:
    relief_type: str
    approved_amount: float
    claimed_amount: float = 0.0


def make_config(**overrides) -> TaxConfig:
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


def test_zero_income_zero_tax():
    result = engine.compute(make_filing(), make_config())
    assert result.total_gross_income == 0.0
    assert result.chargeable_income == 0.0
    assert result.graduated_tax == 0.0
    assert result.minimum_tax == 0.0
    assert result.final_tax_payable == 0.0


def test_income_in_first_band_zero_tax():
    pass


def test_cgt_exemption_applied_when_below_threshold():
    filing = make_filing(
        income_entries=[
            IncomeEntry(income_type="business", gross_amount_ngn=1_000_000.0),
            IncomeEntry(
                income_type="capital_gain_shares",
                gross_amount_ngn=5_000_000.0,
                cgt_proceeds=100_000_000.0,  # < 150M threshold ✓
                cgt_gain=8_000_000.0,  # ≤ 10M threshold ✓
            ),
        ]
    )
    result = engine.compute(filing, make_config())
    assert result.total_gross_income == pytest.approx(1_000_000.0)
    assert result.cgt_exempt_amount == pytest.approx(5_000_000.0)


def test_cgt_exemption_not_applied_when_proceeds_exceed_threshold():
    filing = make_filing(
        income_entries=[
            IncomeEntry(
                income_type="capital_gain_shares",
                gross_amount_ngn=5_000_000.0,
                cgt_proceeds=150_000_000.0,  # NOT < 150M (equal, so fails)
                cgt_gain=8_000_000.0,
            ),
        ]
    )
    result = engine.compute(filing, make_config())
    assert result.total_gross_income == pytest.approx(5_000_000.0)
    assert result.cgt_exempt_amount == 0.0


def test_cgt_exemption_not_applied_when_gain_exceeds_threshold():
    filing = make_filing(
        income_entries=[
            IncomeEntry(
                income_type="capital_gain_shares",
                gross_amount_ngn=12_000_000.0,
                cgt_proceeds=100_000_000.0,  # < 150M ✓
                cgt_gain=10_000_001.0,  # > 10M ✗
            ),
        ]
    )
    result = engine.compute(filing, make_config())
    assert result.total_gross_income == pytest.approx(12_000_000.0)
    assert result.cgt_exempt_amount == 0.0


def test_wht_credits_reduce_net_tax():
    filing = make_filing(
        income_entries=[IncomeEntry(income_type="business", gross_amount_ngn=5_000_000.0)],
        relief_entries=[ReliefEntry(relief_type="wht", approved_amount=100_000.0)],
    )
    result = engine.compute(filing, make_config())
    assert result.wht_credits == pytest.approx(100_000.0)
    assert result.net_tax_payable == pytest.approx(590_000.0)
    assert result.final_tax_payable == pytest.approx(590_000.0)


def test_wht_credits_cannot_make_net_tax_negative():
    filing = make_filing(
        income_entries=[IncomeEntry(income_type="business", gross_amount_ngn=500_000.0)],
        relief_entries=[ReliefEntry(relief_type="wht", approved_amount=999_999.0)],
    )
    result = engine.compute(filing, make_config())
    assert result.net_tax_payable == 0.0


def test_rent_relief_capped():
    filing = make_filing(
        income_entries=[IncomeEntry(income_type="business", gross_amount_ngn=5_000_000.0)],
        relief_entries=[ReliefEntry(relief_type="rent", approved_amount=4_000_000.0)],
    )
    result = engine.compute(filing, make_config())
    assert result.total_deductions == pytest.approx(500_000.0)


def test_rent_relief_below_cap():
    filing = make_filing(
        income_entries=[IncomeEntry(income_type="business", gross_amount_ngn=5_000_000.0)],
        relief_entries=[ReliefEntry(relief_type="rent", approved_amount=1_000_000.0)],
    )
    result = engine.compute(filing, make_config())
    assert result.total_deductions == pytest.approx(200_000.0)


def test_config_version_recorded():
    config = make_config(version_label="Test Config v2.0")
    result = engine.compute(make_filing(), config)
    assert result.config_version == "Test Config v2.0"
