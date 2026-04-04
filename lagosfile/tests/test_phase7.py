from datetime import date, timedelta

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from lagosfile.services.filing_service import calculate_annual_allowance
from lagosfile.utils.deadline import days_until_deadline


@given(
    asset_cost=st.floats(min_value=0.0, max_value=1e12, allow_nan=False, allow_infinity=False),
    annual_allowance_rate=st.floats(min_value=0.0, max_value=1.0, allow_nan=False, allow_infinity=False),
)
@settings(max_examples=25)
def test_property_12_capital_allowance_annual_amount(asset_cost, annual_allowance_rate):
    result = calculate_annual_allowance(asset_cost, annual_allowance_rate)
    assert result == pytest.approx(asset_cost * annual_allowance_rate, rel=1e-9, abs=1e-9)


@given(
    filing_year=st.integers(min_value=2000, max_value=2100),
    days_before=st.integers(min_value=0, max_value=45),
)
@settings(max_examples=25)
def test_property_26_deadline_within_45_days(filing_year, days_before):
    deadline = date(filing_year + 1, 3, 31)
    current_date = deadline - timedelta(days=days_before)
    result = days_until_deadline(current_date, filing_year)
    if days_before == 0:
        assert result == 0
    else:
        assert result == days_before


@given(
    filing_year=st.integers(min_value=2000, max_value=2100),
    days_before=st.integers(min_value=46, max_value=365),
)
@settings(max_examples=25)
def test_property_26_deadline_more_than_45_days_away(filing_year, days_before):
    deadline = date(filing_year + 1, 3, 31)
    current_date = deadline - timedelta(days=days_before)
    result = days_until_deadline(current_date, filing_year)
    assert result is None


@given(
    filing_year=st.integers(min_value=2000, max_value=2100),
    days_after=st.integers(min_value=0, max_value=365),
)
@settings(max_examples=25)
def test_property_26_deadline_passed_returns_zero(filing_year, days_after):
    deadline = date(filing_year + 1, 3, 31)
    current_date = deadline + timedelta(days=days_after)
    result = days_until_deadline(current_date, filing_year)
    assert result == 0
