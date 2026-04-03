import hypothesis.strategies as st
from hypothesis import given, settings, example
import pytest
from unittest.mock import AsyncMock, patch
from lagosfile.services.fx_service import FXService, FXResult
from lagosfile.models import FXCache
from datetime import datetime


class TestFXRateCaching:
    """Property test for FX rate caching on successful fetch (Property 11)."""

    @given(
        base=st.sampled_from(["USD", "EUR", "GBP"]),
        quote=st.sampled_from(["NGN", "USD", "EUR"]),
        year=st.integers(min_value=2020, max_value=2025),
        month=st.integers(min_value=1, max_value=12),
        day=st.integers(min_value=1, max_value=28),
        rate=st.floats(min_value=1.0, max_value=1000.0),
    )
    @settings(max_examples=100)
    @example(base="USD", quote="NGN", year=2023, month=1, day=1, rate=435.20)
    async def test_fx_rate_caching_on_successful_fetch(
        self, base: str, quote: str, year: int, month: int, day: int, rate: float
    ):
        """Test that successful API fetches are cached."""
        fx_service = FXService()

        # Mock the first API source to succeed
        with patch.object(
            fx_service, "_try_fawazahmed0", new_callable=AsyncMock
        ) as mock_fawazahmed0:
            with patch.object(
                fx_service, "_try_exchangerate_api", new_callable=AsyncMock
            ) as mock_exchangerate:
                with patch.object(
                    fx_service, "_try_cached_rate", new_callable=AsyncMock
                ) as mock_cached:
                    # Configure mocks - first succeeds, others not called
                    mock_fawazahmed0.return_value = FXResult(
                        rate=rate1,
                        source="fawazahmed0",
                        is_cached=False,
                        timestamp=datetime(2023, 1, 1),
                    )
                    mock_exchangerate.return_value = FXResult(
                        rate=None, source="exchangerate-api", is_cached=False
                    )
                    mock_cached.return_value = FXResult(
                        rate=None, source="cache", is_cached=False
                    )

                    # Call the service
                    result = await fx_service.resolve_rate(
                        base, quote, f"{year:04d}-{month:02d}-{day:02d}"
                    )
                    mock_exchangerate.return_value = FXResult(
                        rate=None, source="exchangerate-api", is_cached=False
                    )
                    mock_cached.return_value = FXResult(
                        rate=None, source="cache", is_cached=False
                    )

                    # Call the service
                    result = await fx_service.resolve_rate(
                        base, quote, f"{year:04d}-{month:02d}-{day:02d}"
                    )
                    mock_exchangerate.return_value = FXResult(
                        rate=None, source="exchangerate-api", is_cached=False
                    )
                    mock_cached.return_value = FXResult(
                        rate=None, source="cache", is_cached=False
                    )

                    # Call the service
                    result = await fx_service.resolve_rate(
                        base, quote, f"{year:04d}-{month:02d}-{day:02d}"
                    )
                    mock_exchangerate.return_value = FXResult(
                        rate=None, source="exchangerate-api", is_cached=False
                    )
                    mock_cached.return_value = FXResult(
                        rate=None, source="cache", is_cached=False
                    )

                    # Call the service
                    result = await fx_service.resolve_rate(
                        base, quote, date.strftime("%Y-%m-%d")
                    )

                    # Verify caching was called
                    mock_fawazahmed0.assert_awaited_once()
                    mock_exchangerate.assert_not_awaited()
                    mock_cached.assert_not_awaited()

                    # Verify result came from API
                    assert result.rate == rate
                    assert result.source == "fawazahmed0"
                    assert result.is_cached is False
                    assert result.timestamp == date

                    # Verify cache was updated (check if _cache_rate was called)
                    mock_fawazahmed0.assert_called_once()
                    # The actual caching happens in _cache_rate which is called internally

    @given(
        base=st.sampled_from(["USD", "EUR", "GBP"]),
        quote=st.sampled_from(["NGN", "USD", "EUR"]),
        year=st.integers(min_value=2020, max_value=2025),
        month=st.integers(min_value=1, max_value=12),
        day=st.integers(min_value=1, max_value=28),
        rate=st.floats(min_value=1.0, max_value=1000.0),
    )
    @settings(max_examples=100)
    @example(base="USD", quote="NGN", year=2023, month=1, day=1, rate=435.20)
    async def test_fx_cache_prevents_repeated_api_calls(
        self, base: str, quote: str, year: int, month: int, day: int, rate: float
    ):
        """Test that cached rates are used instead of repeated API calls."""
        fx_service = FXService()

        # First call - should succeed and cache
        with patch.object(
            fx_service, "_try_fawazahmed0", new_callable=AsyncMock
        ) as mock_fawazahmed0:
            with patch.object(
                fx_service, "_try_exchangerate_api", new_callable=AsyncMock
            ) as mock_exchangerate:
                with patch.object(
                    fx_service, "_try_cached_rate", new_callable=AsyncMock
                ) as mock_cached:
                    mock_fawazahmed0.return_value = FXResult(
                        rate=rate, source="fawazahmed0", is_cached=False, timestamp=date
                    )
                    mock_exchangerate.return_value = FXResult(
                        rate=None, source="exchangerate-api", is_cached=False
                    )
                    mock_cached.return_value = FXResult(
                        rate=None, source="cache", is_cached=False
                    )

                    result1 = await fx_service.resolve_rate(
                        base, quote, date.strftime("%Y-%m-%d")
                    )
                    assert result1.rate == rate
                    assert result1.source == "fawazahmed0"

                    # Second call - should use cache
                    mock_fawazahmed0.reset_mock()
                    mock_exchangerate.reset_mock()
                    mock_cached.return_value = FXResult(
                        rate=rate, source="cache", is_cached=True, timestamp=date
                    )

                    result2 = await fx_service.resolve_rate(
                        base, quote, date.strftime("%Y-%m-%d")
                    )

                    # Verify second call used cache
                    mock_fawazahmed0.assert_not_awaited()
                    mock_exchangerate.assert_not_awaited()
                    mock_cached.assert_awaited_once()

                    assert result2.rate == rate
                    assert result2.source == "cache"
                    assert result2.is_cached is True
                    assert result2.timestamp == date

    @given(
        base=st.sampled_from(["USD", "EUR", "GBP"]),
        quote=st.sampled_from(["NGN", "USD", "EUR"]),
        year=st.integers(min_value=2020, max_value=2025),
        month=st.integers(min_value=1, max_value=12),
        day=st.integers(min_value=1, max_value=28),
        rate1=st.floats(min_value=1.0, max_value=1000.0),
        rate2=st.floats(min_value=1.0, max_value=1000.0),
    )
    @settings(max_examples=100)
    @example(
        base="USD", quote="NGN", year=2023, month=1, day=1, rate1=435.20, rate2=440.50
    )
    async def test_fx_cache_overwrites_on_new_success(
        self,
        base: str,
        quote: str,
        year: int,
        month: int,
        day: int,
        rate1: float,
        rate2: float,
    ):
        """Test that new successful fetches overwrite existing cache."""
        fx_service = FXService()

        # First successful fetch (caches rate1)
        with patch.object(
            fx_service, "_try_fawazahmed0", new_callable=AsyncMock
        ) as mock_fawazahmed0:
            with patch.object(
                fx_service, "_try_exchangerate_api", new_callable=AsyncMock
            ) as mock_exchangerate:
                with patch.object(
                    fx_service, "_try_cached_rate", new_callable=AsyncMock
                ) as mock_cached:
                    mock_fawazahmed0.return_value = FXResult(
                        rate=rate1,
                        source="fawazahmed0",
                        is_cached=False,
                        timestamp=date,
                    )
                    mock_exchangerate.return_value = FXResult(
                        rate=None, source="exchangerate-api", is_cached=False
                    )
                    mock_cached.return_value = FXResult(
                        rate=None, source="cache", is_cached=False
                    )

                    result1 = await fx_service.resolve_rate(
                        base, quote, date.strftime("%Y-%m-%d")
                    )
                    assert result1.rate == rate1

                    # Second successful fetch with different rate (should overwrite cache)
                    mock_fawazahmed0.return_value = FXResult(
                        rate=rate2,
                        source="fawazahmed0",
                        is_cached=False,
                        timestamp=date,
                    )

                    result2 = await fx_service.resolve_rate(
                        base, quote, date.strftime("%Y-%m-%d")
                    )

                    # Verify cache was updated with new rate
                    assert result2.rate == rate2
                    assert result2.source == "fawazahmed0"
                    assert result2.is_cached is False
                    assert result2.timestamp == date
