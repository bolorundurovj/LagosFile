from dataclasses import dataclass

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from lagosfile.services.computation_engine import ComputationEngine, FilingData
from lagosfile.services.config_engine import NTA_2025_BANDS, TaxConfig


@dataclass
class IncomeEntry:
    income_type: str
    gross_amount_ngn: float
    cgt_proceeds: float | None = None
    cgt_gain: float | None = None


def make_config() -> TaxConfig:
    return TaxConfig(
        version_label="Test Config v1.0",
        bands=NTA_2025_BANDS,
        rent_relief_cap=500_000.0,
        cgt_proceeds_threshold=150_000_000.0,
        cgt_gain_threshold=10_000_000.0,
        allowance_rates={},
        minimum_tax_rate=0.01,
    )


def make_filing(income_entries=None) -> FilingData:
    return FilingData(
        income_entries=income_entries or [],
        capital_allowances=[],
        relief_entries=[],
    )


engine = ComputationEngine()


@given(
    non_digital_amount=st.floats(min_value=0.01, max_value=1e9, allow_nan=False, allow_infinity=False),
    digital_loss=st.floats(min_value=-1e9, max_value=-0.01, allow_nan=False, allow_infinity=False),
)
@settings(max_examples=25)
def test_property_5_digital_asset_loss_ring_fencing(non_digital_amount, digital_loss):
    filing = make_filing(
        income_entries=[
            IncomeEntry(income_type="business", gross_amount_ngn=non_digital_amount),
            IncomeEntry(income_type="digital_asset", gross_amount_ngn=digital_loss),
        ]
    )
    result = engine.compute(filing, make_config())
    assert result.total_gross_income == pytest.approx(non_digital_amount, rel=1e-6)
    assert result.digital_asset_loss_ringfenced == pytest.approx(abs(digital_loss), rel=1e-6)


@given(
    gross_amount=st.floats(min_value=0.01, max_value=1e9, allow_nan=False, allow_infinity=False),
    proceeds=st.floats(min_value=0.01, max_value=149_999_999.99, allow_nan=False, allow_infinity=False),
    gain=st.floats(min_value=0.01, max_value=10_000_000.0, allow_nan=False, allow_infinity=False),
)
@settings(max_examples=25)
def test_property_6_cgt_exempt_when_both_thresholds_met(gross_amount, proceeds, gain):
    config = make_config()
    assert proceeds < config.cgt_proceeds_threshold
    assert gain <= config.cgt_gain_threshold
    filing = make_filing(
        income_entries=[
            IncomeEntry(
                income_type="capital_gain_shares",
                gross_amount_ngn=gross_amount,
                cgt_proceeds=proceeds,
                cgt_gain=gain,
            )
        ]
    )
    result = engine.compute(filing, config)
    assert result.total_gross_income == pytest.approx(0.0, abs=1e-6)
    assert result.cgt_exempt_amount == pytest.approx(gross_amount, rel=1e-6)


@given(
    gross_amount=st.floats(min_value=0.01, max_value=1e9, allow_nan=False, allow_infinity=False),
    proceeds=st.floats(min_value=150_000_000.0, max_value=1e12, allow_nan=False, allow_infinity=False),
    gain=st.floats(min_value=0.01, max_value=10_000_000.0, allow_nan=False, allow_infinity=False),
)
@settings(max_examples=25)
def test_property_6_cgt_not_exempt_when_proceeds_exceed_threshold(gross_amount, proceeds, gain):
    config = make_config()
    assert proceeds >= config.cgt_proceeds_threshold
    filing = make_filing(
        income_entries=[
            IncomeEntry(
                income_type="capital_gain_shares",
                gross_amount_ngn=gross_amount,
                cgt_proceeds=proceeds,
                cgt_gain=gain,
            )
        ]
    )
    result = engine.compute(filing, config)
    assert result.total_gross_income == pytest.approx(gross_amount, rel=1e-6)
    assert result.cgt_exempt_amount == pytest.approx(0.0, abs=1e-6)


@given(
    gross_amount=st.floats(min_value=0.01, max_value=1e9, allow_nan=False, allow_infinity=False),
    proceeds=st.floats(min_value=0.01, max_value=149_999_999.99, allow_nan=False, allow_infinity=False),
    gain=st.floats(min_value=10_000_000.01, max_value=1e12, allow_nan=False, allow_infinity=False),
)
@settings(max_examples=25)
def test_property_6_cgt_not_exempt_when_gain_exceeds_threshold(gross_amount, proceeds, gain):
    config = make_config()
    assert gain > config.cgt_gain_threshold
    filing = make_filing(
        income_entries=[
            IncomeEntry(
                income_type="capital_gain_shares",
                gross_amount_ngn=gross_amount,
                cgt_proceeds=proceeds,
                cgt_gain=gain,
            )
        ]
    )
    result = engine.compute(filing, config)
    assert result.total_gross_income == pytest.approx(gross_amount, rel=1e-6)
    assert result.cgt_exempt_amount == pytest.approx(0.0, abs=1e-6)
