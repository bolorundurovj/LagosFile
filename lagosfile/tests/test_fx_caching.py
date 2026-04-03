"""
Property 11: FX rate caching on successful fetch

# Feature: lagos-file, Property 11: FX rate caching on successful fetch

Validates: Requirements 5.9, 16.3

After a successful API fetch, FXCache must contain a record for that
currency pair, date, and source immediately after the fetch.
"""

import pytest
from datetime import date
from unittest.mock import AsyncMock, patch

from hypothesis import given, settings, HealthCheck
from hypothesis import strategies as st
from tortoise import Tortoise

from lagosfile.models import FXCache
from lagosfile.services.fx_service import FXResult, FXService


# ---------------------------------------------------------------------------
# DB fixture — fresh in-memory DB per test
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
async def tortoise_db():
    """Fresh in-memory DB per test."""
    await Tortoise.init(
        db_url="sqlite://:memory:",
        modules={"models": ["lagosfile.models"]},
    )
    await Tortoise.generate_schemas()
    yield
    await Tortoise.close_connections()


# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

currencies = st.sampled_from(["USD", "EUR", "GBP", "JPY"])
target_dates = st.dates(min_value=date(2020, 1, 1), max_value=date(2025, 12, 31))
rates = st.floats(min_value=1.0, max_value=2000.0, allow_nan=False, allow_infinity=False)


# ---------------------------------------------------------------------------
# Property 11: After a successful fawazahmed0 fetch, FXCache has a record
# ---------------------------------------------------------------------------

@given(base=currencies, quote=currencies, target_date=target_dates, rate=rates)
@settings(max_examples=25, suppress_health_check=[HealthCheck.function_scoped_fixture])
async def test_caching_after_fawazahmed0_success(tortoise_db, base, quote, target_date, rate):
    """
    **Validates: Requirements 5.9, 16.3**

    After a successful fawazahmed0 fetch, FXCache must contain a record
    for that currency pair, date, and source.
    """
    svc = FXService()

    # Mock _try_fawazahmed0 to return a known rate without hitting the network
    success_result = FXResult(
        rate=rate,
        source="fawazahmed0",
        rate_date=target_date,
        is_cached=False,
        cache_date=None,
    )

    with patch.object(svc, "_try_fawazahmed0", new_callable=AsyncMock) as mock_f, \
         patch.object(svc, "_try_exchangerate_api", new_callable=AsyncMock), \
         patch.object(svc, "_try_cached_rate", new_callable=AsyncMock):

        mock_f.return_value = success_result

        result = await svc.resolve_rate(base, quote, target_date)

    # The result must come from fawazahmed0
    assert result.source == "fawazahmed0"
    assert result.rate == rate

    # FXCache must now contain a record for this pair, date, and source
    cached = await FXCache.filter(
        base_currency=base,
        quote_currency=quote,
        rate_date=target_date,
        source="fawazahmed0",
    ).first()

    assert cached is not None, (
        f"FXCache must contain a record for {base}/{quote} on {target_date} "
        f"from fawazahmed0 after a successful fetch"
    )
    assert cached.rate == rate


# ---------------------------------------------------------------------------
# Property 11 (variant): After a successful exchangerate-api fetch, FXCache has a record
# ---------------------------------------------------------------------------

@given(base=currencies, quote=currencies, target_date=target_dates, rate=rates)
@settings(max_examples=25, suppress_health_check=[HealthCheck.function_scoped_fixture])
async def test_caching_after_exchangerate_api_success(tortoise_db, base, quote, target_date, rate):
    """
    **Validates: Requirements 5.9, 16.3**

    After a successful exchangerate-api fetch (fawazahmed0 failed), FXCache
    must contain a record for that currency pair, today's date, and source.
    """
    svc = FXService()
    today = date.today()

    success_result = FXResult(
        rate=rate,
        source="exchangerate-api",
        rate_date=today,
        is_cached=False,
        cache_date=None,
    )

    with patch.object(svc, "_try_fawazahmed0", new_callable=AsyncMock) as mock_f, \
         patch.object(svc, "_try_exchangerate_api", new_callable=AsyncMock) as mock_e, \
         patch.object(svc, "_try_cached_rate", new_callable=AsyncMock):

        mock_f.return_value = None
        mock_e.return_value = success_result

        result = await svc.resolve_rate(base, quote, target_date)

    assert result.source == "exchangerate-api"
    assert result.rate == rate

    # FXCache must now contain a record for this pair, today's date, and source
    cached = await FXCache.filter(
        base_currency=base,
        quote_currency=quote,
        source="exchangerate-api",
    ).first()

    assert cached is not None, (
        f"FXCache must contain a record for {base}/{quote} from exchangerate-api "
        f"after a successful fetch"
    )
