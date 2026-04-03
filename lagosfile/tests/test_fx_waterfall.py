import hypothesis.strategies as st
from hypothesis import given, settings, example
import pytest
from unittest.mock import AsyncMock, patch
from lagosfile.services.fx_service import FXService, FXResult
from lagosfile.models import FXCache
from datetime import datetime, date


class TestFXWaterfallOrdering:
    """Property test for FX waterfall ordering (Property 9)."""

@given(
    base=st.sampled_from(["USD", "EUR", "GBP"]),
    quote=st.sampled_from(["NGN", "USD", "EUR"]),
    year=st.integers(min_value=2020, max_value=2025),
    month=st.integers(min_value=1, max_value=12),
    day=st.integers(min_value=1, max_value=28),
)
@settings(max_examples=100)
@example(base="USD", quote="NGN", year=2023, month=1, day=1)
async def test_fx_waterfall_ordering(self, base: str, quote: str, year: int, month: int, day: int):
        """Test that FX waterfall follows correct resolution order."""
        fx_service = FXService()

        # Mock the three API sources to fail in sequence
        with patch.object(
            fx_service, "_try_fawazahmed0", new_callable=AsyncMock
        ) as mock_fawazahmed0:
            with patch.object(
                fx_service, "_try_exchangerate_api", new_callable=AsyncMock
            ) as mock_exchangerate:
                with patch.object(
                    fx_service, "_try_cached_rate", new_callable=AsyncMock
                ) as mock_cached:
                    # Configure mocks to return None (fail) in sequence
                    mock_fawazahmed0.return_value = FXResult(
                        rate=None, source="fawazahmed0", is_cached=False
                    )
                    mock_exchangerate.return_value = FXResult(
                        rate=None, source="exchangerate-api", is_cached=False
                    )
                    mock_cached.return_value = FXResult(
                        rate=435.50,
                        source="cache",
                        is_cached=True,
                        timestamp=datetime(2023, 1, 1),
                    )

                    # Call the service
                    result = await fx_service.resolve_rate(
                        base, quote, f"{year:04d}-{month:02d}-{day:02d}"
                    )

                    # Verify waterfall order was followed
                    mock_fawazahmed0.assert_awaited_once()
                    mock_exchangerate.assert_awaited_once()
                    mock_cached.assert_awaited_once()

                    # Verify result came from cache (last fallback)
                    assert result.rate == 435.50
                    assert result.source == "cache"
                    assert result.is_cached is True
                    assert result.timestamp == datetime(2023, 1, 1)

    @given(
        base=st.sampled_from(["USD", "EUR", "GBP"]),
        quote=st.sampled_from(["NGN", "USD", "EUR"]),
        year=st.integers(min_value=2020, max_value=2025),
        month=st.integers(min_value=1, max_value=12),
        day=st.integers(min_value=1, max_value=28),
    )
    @settings(max_examples=100)
    @example(base="USD", quote="NGN", year=2023, month=1, day=1)
    async def test_fx_waterfall_stops_at_first_success(
        self, base: str, quote: str, year: int, month: int, day: int
    ):
        """Test that waterfall stops at first successful source."""
        fx_service = FXService()

        # Mock the three API sources with first one succeeding
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
                        rate=435.20,
                        source="fawazahmed0",
                        is_cached=False,
                        timestamp=datetime(2023, 1, 1),
                    )
                    mock_exchangerate.return_value = FXResult(
                        rate=None, source="exchangerate-api", is_cached=False
                    )
                    mock_cached.return_value = FXResult(
                        rate=435.50,
                        source="cache",
                        is_cached=True,
                        timestamp=datetime(2023, 1, 1),
                    )

                    # Call the service
                    result = await fx_service.resolve_rate(
                        base, quote, f"{year:04d}-{month:02d}-{day:02d}"
                    )

                    # Verify only first source was called
                    mock_fawazahmed0.assert_awaited_once()
                    mock_exchangerate.assert_not_awaited()
                    mock_cached.assert_not_awaited()

                    # Verify result came from first successful source
                    assert result.rate == 435.20
                    assert result.source == "fawazahmed0"
                    assert result.is_cached is False
                    assert result.timestamp == date

    @given(
        base=st.sampled_from(["USD", "EUR", "GBP"]),
        quote=st.sampled_from(["NGN", "USD", "EUR"]),
        year=st.integers(min_value=2020, max_value=2025),
        month=st.integers(min_value=1, max_value=12),
        day=st.integers(min_value=1, max_value=28),
    )
    @settings(max_examples=100)
    @example(base="USD", quote="NGN", year=2023, month=1, day=1)
    async def test_fx_waterfall_manual_fallback(
        self, base: str, quote: str, year: int, month: int, day: int
    ):
        """Test that waterfall falls back to manual entry when all sources fail."""
        fx_service = FXService()

        # Mock all three sources to fail
        with patch.object(
            fx_service, "_try_fawazahmed0", new_callable=AsyncMock
        ) as mock_fawazahmed0:
            with patch.object(
                fx_service, "_try_exchangerate_api", new_callable=AsyncMock
            ) as mock_exchangerate:
                with patch.object(
                    fx_service, "_try_cached_rate", new_callable=AsyncMock
                ) as mock_cached:
                    # Configure all mocks to fail
                    mock_fawazahmed0.return_value = FXResult(
                        rate=None, source="fawazahmed0", is_cached=False
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

                    # Verify all sources were called
                    mock_fawazahmed0.assert_awaited_once()
                    mock_exchangerate.assert_awaited_once()
                    mock_cached.assert_awaited_once()

                    # Verify manual fallback result
                    assert result.rate is None
                    assert result.source == "manual"
                    assert result.is_cached is False
                    assert result.timestamp is None
