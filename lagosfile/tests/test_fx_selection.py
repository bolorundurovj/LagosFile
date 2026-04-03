import hypothesis.strategies as st
from hypothesis import given, settings, example
import pytest
from unittest.mock import AsyncMock, patch
from lagosfile.services.filing_service import FilingService
from lagosfile.models import Filing, IncomeEntry
from datetime import datetime


class TestFXRateSelection:
    """Property test for FX rate selection — CBN override takes precedence (Property 10)."""

    @given(
        income_type=st.sampled_from(
            [
                "Employment",
                "Business",
                "Rental",
                "Dividend",
                "Interest",
                "Capital Gains",
                "Digital Assets",
                "Royalties",
                "Prizes",
                "Other",
            ]
        ),
        description=st.text(min_size=1, max_size=255),
        foreign_currency=st.sampled_from(["USD", "EUR", "GBP"]),
        foreign_amount=st.floats(min_value=0.01, max_value=1000000.0),
        year=st.integers(min_value=2020, max_value=2025),
        month=st.integers(min_value=1, max_value=12),
        day=st.integers(min_value=1, max_value=28),
        fetched_fx_rate=st.floats(min_value=1.0, max_value=1000.0),
        cbn_override_rate=st.floats(min_value=1.0, max_value=1000.0),
        benefits_in_kind=st.floats(min_value=0.0, max_value=100000.0),
    )
    @settings(max_examples=100)
    @example(
        income_type="Employment",
        description="Salary",
        foreign_currency="USD",
        foreign_amount=50000.0,
        year=2023,
        month=1,
        day=1,
        fetched_fx_rate=435.20,
        cbn_override_rate=440.50,
        benefits_in_kind=2500.0,
    )
    async def test_cbn_override_takes_precedence(
        self,
        income_type: str,
        description: str,
        foreign_currency: str,
        foreign_amount: float,
        year: int,
        month: int,
        day: int,
        fetched_fx_rate: float,
        cbn_override_rate: float,
        benefits_in_kind: float,
    ):
        """Test that CBN override rate takes precedence over fetched FX rates."""
        filing_service = FilingService()

        # Create a filing
        filing = Filing(taxpayer_id=1, yoa=2023, status="Draft")
        await filing.save()

        # Mock FXService to return the fetched rate
        with patch.object(
            FilingService, "_save_income_entries", new_callable=AsyncMock
        ) as mock_save_entries:
            mock_save_entries.return_value = None

            # Create entry data with both fetched rate and CBN override
            entry_data = {
                "income_type": income_type,
                "description": description,
                "foreign_currency": foreign_currency,
                "foreign_amount": foreign_amount,
                "date": f"{year:04d}-{month:02d}-{day:02d}",
                "fetched_fx_rate": fetched_fx_rate,
                "cbn_override_rate": cbn_override_rate,
                "benefits_in_kind": benefits_in_kind,
            }

            # Save the entry
            await filing_service.save_step(filing.id, {"income_entries": [entry_data]})

            # Verify the entry was saved with CBN override rate
            mock_save_entries.assert_awaited_once()

            # Check that the entry uses CBN override rate
            saved_entries = await filing.income_entries.all()
            assert len(saved_entries) == 1

            entry = saved_entries[0]
            assert entry.cbn_override_rate == cbn_override_rate
            assert entry.rate_source == "CBN Override"
            assert entry.gross_amount_ngn == foreign_amount * cbn_override_rate

    @given(
        income_type=st.sampled_from(
            [
                "Employment",
                "Business",
                "Rental",
                "Dividend",
                "Interest",
                "Capital Gains",
                "Digital Assets",
                "Royalties",
                "Prizes",
                "Other",
            ]
        ),
        description=st.text(min_size=1, max_size=255),
        foreign_currency=st.sampled_from(["USD", "EUR", "GBP"]),
        foreign_amount=st.floats(min_value=0.01, max_value=1000000.0),
        year=st.integers(min_value=2020, max_value=2025),
        month=st.integers(min_value=1, max_value=12),
        day=st.integers(min_value=1, max_value=28),
        fetched_fx_rate=st.floats(min_value=1.0, max_value=1000.0),
        benefits_in_kind=st.floats(min_value=0.0, max_value=100000.0),
    )
    @settings(max_examples=100)
    @example(
        income_type="Employment",
        description="Salary",
        foreign_currency="USD",
        foreign_amount=50000.0,
        year=2023,
        month=1,
        day=1,
        fetched_fx_rate=435.20,
        benefits_in_kind=2500.0,
    )
    async def test_no_cbn_override_uses_fetched_rate(
        self,
        income_type: str,
        description: str,
        foreign_currency: str,
        foreign_amount: float,
        year: int,
        month: int,
        day: int,
        fetched_fx_rate: float,
        benefits_in_kind: float,
    ):
        """Test that when no CBN override is set, the fetched FX rate is used."""
        filing_service = FilingService()

        # Create a filing
        filing = Filing(taxpayer_id=1, yoa=2023, status="Draft")
        await filing.save()

        # Mock FXService to return the fetched rate
        with patch.object(
            FilingService, "_save_income_entries", new_callable=AsyncMock
        ) as mock_save_entries:
            mock_save_entries.return_value = None

            # Create entry data with only fetched rate (no CBN override)
            entry_data = {
                "income_type": income_type,
                "description": description,
                "foreign_currency": foreign_currency,
                "foreign_amount": foreign_amount,
                "date": date,
                "fetched_fx_rate": fetched_fx_rate,
                "cbn_override_rate": None,
                "benefits_in_kind": benefits_in_kind,
            }

            # Save the entry
            await filing_service.save_step(filing.id, {"income_entries": [entry_data]})

            # Verify the entry was saved with fetched rate
            mock_save_entries.assert_awaited_once()

            # Check that the entry uses fetched rate
            saved_entries = await filing.income_entries.all()
            assert len(saved_entries) == 1

            entry = saved_entries[0]
            assert entry.cbn_override_rate is None
            assert entry.rate_source == "fawazahmed0"  # or whatever the source was
            assert entry.gross_amount_ngn == foreign_amount * fetched_fx_rate

    @given(
        income_type=st.sampled_from(
            [
                "Employment",
                "Business",
                "Rental",
                "Dividend",
                "Interest",
                "Capital Gains",
                "Digital Assets",
                "Royalties",
                "Prizes",
                "Other",
            ]
        ),
        description=st.text(min_size=1, max_size=255),
        foreign_amount=st.floats(min_value=0.01, max_value=1000000.0),
        date=st.dates(min_value=datetime(2020, 1, 1), max_value=datetime(2025, 12, 31)),
        benefits_in_kind=st.floats(min_value=0.0, max_value=100000.0),
    )
    @settings(max_examples=100)
    async def test_no_foreign_currency_uses_gross_amount_directly(
        self,
        income_type: str,
        description: str,
        foreign_amount: float,
        date: datetime,
        benefits_in_kind: float,
    ):
        """Test that when no foreign currency is specified, the gross amount is used directly."""
        filing_service = FilingService()

        # Create a filing
        filing = Filing(taxpayer_id=1, yoa=2023, status="Draft")
        await filing.save()

        # Mock FXService to return the fetched rate
        with patch.object(
            FilingService, "_save_income_entries", new_callable=AsyncMock
        ) as mock_save_entries:
            mock_save_entries.return_value = None

            # Create entry data with no foreign currency
            entry_data = {
                "income_type": income_type,
                "description": description,
                "gross_amount_ngn": foreign_amount,  # Use gross amount directly
                "foreign_currency": None,
                "foreign_amount": None,
                "date": date,
                "fetched_fx_rate": None,
                "cbn_override_rate": None,
                "benefits_in_kind": benefits_in_kind,
            }

            # Save the entry
            await filing_service.save_step(filing.id, {"income_entries": [entry_data]})

            # Verify the entry was saved with gross amount directly
            mock_save_entries.assert_awaited_once()

            # Check that the entry uses the provided gross amount
            saved_entries = await filing.income_entries.all()
            assert len(saved_entries) == 1

            entry = saved_entries[0]
            assert entry.foreign_currency is None
            assert entry.foreign_amount is None
            assert entry.fetched_fx_rate is None
            assert entry.cbn_override_rate is None
            assert entry.gross_amount_ngn == foreign_amount
