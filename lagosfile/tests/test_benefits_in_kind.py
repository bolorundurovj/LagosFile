"""
Property-based tests for benefits-in-kind and income entry persistence.

Properties 3 and 4.

Requirements: 4.2, 4.3
"""

# Feature: lagos-file, Property 3: Benefits-in-kind taxable value
# Feature: lagos-file, Property 4: Multiple income entries are all persisted

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from tortoise import Tortoise

from lagosfile.models import IncomeEntry, Taxpayer
from lagosfile.services.filing_service import FilingService, calculate_bik_taxable_value

# ---------------------------------------------------------------------------
# DB fixture — one fresh in-memory DB per test function
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
# Helper
# ---------------------------------------------------------------------------


async def _get_or_create_taxpayer() -> Taxpayer:
    taxpayer, _ = await Taxpayer.get_or_create(
        tin="1234567890123",
        defaults={"full_name": "Test User"},
    )
    return taxpayer


# ---------------------------------------------------------------------------
# Property 3: Benefits-in-kind taxable value
# Validates: Requirements 4.2
# ---------------------------------------------------------------------------


@given(cost=st.floats(min_value=0.01, max_value=1e12, allow_nan=False, allow_infinity=False))
@settings(max_examples=25)
def test_property_3_bik_taxable_value(cost):
    """
    For any positive cost value, the taxable value of a benefit-in-kind
    should equal exactly 5% of that cost.

    **Validates: Requirements 4.2**
    """
    result = calculate_bik_taxable_value(cost)
    assert result == cost * 0.05


# ---------------------------------------------------------------------------
# Property 4: Multiple income entries are all persisted
# Validates: Requirements 4.3
# ---------------------------------------------------------------------------


@given(n=st.integers(min_value=1, max_value=10))
@settings(max_examples=25, suppress_health_check=[HealthCheck.function_scoped_fixture])
async def test_property_4_multiple_income_entries_persisted(tortoise_db, n):
    """
    For any N income entries of the same type added to a filing, all N entries
    should be retrievable from the filing record.

    **Validates: Requirements 4.3**
    """
    taxpayer = await _get_or_create_taxpayer()
    svc = FilingService()

    filing = await svc.create_draft(str(taxpayer.id), 2025)

    # Add N income entries of the same type
    entries_data = [
        {
            "income_type": "employment",
            "description": f"Income source {i}",
            "gross_amount_ngn": float(1_000_000 * (i + 1)),
        }
        for i in range(n)
    ]
    await svc.save_step(str(filing.id), {"income_entries": entries_data})

    # Retrieve all entries for this filing
    retrieved = await IncomeEntry.filter(filing_id=filing.id)

    assert len(retrieved) == n, f"Expected {n} income entries, got {len(retrieved)}"
