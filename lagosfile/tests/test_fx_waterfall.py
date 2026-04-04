from datetime import date
from unittest.mock import AsyncMock, patch

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from tortoise import Tortoise

from lagosfile.services.fx_service import FXResult, FXService


@pytest.fixture(autouse=True)
async def tortoise_db():
    await Tortoise.init(
        db_url="sqlite://:memory:",
        modules={"models": ["lagosfile.models"]},
    )
    await Tortoise.generate_schemas()
    yield
    await Tortoise.close_connections()


currencies = st.sampled_from(["USD", "EUR", "GBP", "JPY"])
target_dates = st.dates(min_value=date(2020, 1, 1), max_value=date(2025, 12, 31))
rates = st.floats(min_value=1.0, max_value=2000.0, allow_nan=False, allow_infinity=False)


@given(base=currencies, quote=currencies, target_date=target_dates, rate=rates)
@settings(max_examples=25, suppress_health_check=[HealthCheck.function_scoped_fixture])
async def test_waterfall_fawazahmed0_success(tortoise_db, base, quote, target_date, rate):
    svc = FXService()
    success_result = FXResult(
        rate=rate,
        source="fawazahmed0",
        rate_date=target_date,
        is_cached=False,
        cache_date=None,
    )
    with (
        patch.object(svc, "_try_fawazahmed0", new_callable=AsyncMock) as mock_f,
        patch.object(svc, "_try_exchangerate_api", new_callable=AsyncMock) as mock_e,
        patch.object(svc, "_try_cached_rate", new_callable=AsyncMock) as mock_c,
        patch.object(svc, "_cache_rate", new_callable=AsyncMock),
    ):
        mock_f.return_value = success_result
        result = await svc.resolve_rate(base, quote, target_date)
    assert result.source == "fawazahmed0"
    assert result.rate == rate
    assert result.is_cached is False
    mock_f.assert_awaited_once()
    mock_e.assert_not_awaited()
    mock_c.assert_not_awaited()


@given(base=currencies, quote=currencies, target_date=target_dates, rate=rates)
@settings(max_examples=25, suppress_health_check=[HealthCheck.function_scoped_fixture])
async def test_waterfall_exchangerate_api_fallback(tortoise_db, base, quote, target_date, rate):
    svc = FXService()
    success_result = FXResult(
        rate=rate,
        source="exchangerate-api",
        rate_date=date.today(),
        is_cached=False,
        cache_date=None,
    )
    with (
        patch.object(svc, "_try_fawazahmed0", new_callable=AsyncMock) as mock_f,
        patch.object(svc, "_try_exchangerate_api", new_callable=AsyncMock) as mock_e,
        patch.object(svc, "_try_cached_rate", new_callable=AsyncMock) as mock_c,
        patch.object(svc, "_cache_rate", new_callable=AsyncMock),
    ):
        mock_f.return_value = None
        mock_e.return_value = success_result
        result = await svc.resolve_rate(base, quote, target_date)
    assert result.source == "exchangerate-api"
    assert result.rate == rate
    assert result.is_cached is False
    mock_f.assert_awaited_once()
    mock_e.assert_awaited_once()
    mock_c.assert_not_awaited()


@given(base=currencies, quote=currencies, target_date=target_dates, rate=rates)
@settings(max_examples=25, suppress_health_check=[HealthCheck.function_scoped_fixture])
async def test_waterfall_cache_fallback(tortoise_db, base, quote, target_date, rate):
    svc = FXService()
    cached_result = FXResult(
        rate=rate,
        source="cache",
        rate_date=target_date,
        is_cached=True,
        cache_date=target_date,
    )
    with (
        patch.object(svc, "_try_fawazahmed0", new_callable=AsyncMock) as mock_f,
        patch.object(svc, "_try_exchangerate_api", new_callable=AsyncMock) as mock_e,
        patch.object(svc, "_try_cached_rate", new_callable=AsyncMock) as mock_c,
    ):
        mock_f.return_value = None
        mock_e.return_value = None
        mock_c.return_value = cached_result
        result = await svc.resolve_rate(base, quote, target_date)
    assert result.source == "cache"
    assert result.rate == rate
    assert result.is_cached is True
    mock_f.assert_awaited_once()
    mock_e.assert_awaited_once()
    mock_c.assert_awaited_once()


@given(base=currencies, quote=currencies, target_date=target_dates)
@settings(max_examples=25, suppress_health_check=[HealthCheck.function_scoped_fixture])
async def test_waterfall_manual_fallback(tortoise_db, base, quote, target_date):
    svc = FXService()
    with (
        patch.object(svc, "_try_fawazahmed0", new_callable=AsyncMock) as mock_f,
        patch.object(svc, "_try_exchangerate_api", new_callable=AsyncMock) as mock_e,
        patch.object(svc, "_try_cached_rate", new_callable=AsyncMock) as mock_c,
    ):
        mock_f.return_value = None
        mock_e.return_value = None
        mock_c.return_value = None
        result = await svc.resolve_rate(base, quote, target_date)
    assert result.source == "manual"
    assert result.rate is None
    assert result.is_cached is False
    mock_f.assert_awaited_once()
    mock_e.assert_awaited_once()
    mock_c.assert_awaited_once()
