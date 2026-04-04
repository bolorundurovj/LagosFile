import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from tortoise import Tortoise

from lagosfile.models import IncomeEntry, Taxpayer
from lagosfile.services.filing_service import FilingService, calculate_bik_taxable_value


@pytest.fixture(autouse=True)
async def tortoise_db():
    await Tortoise.init(
        db_url="sqlite://:memory:",
        modules={"models": ["lagosfile.models"]},
    )
    await Tortoise.generate_schemas()
    yield
    await Tortoise.close_connections()


async def _get_or_create_taxpayer() -> Taxpayer:
    taxpayer, _ = await Taxpayer.get_or_create(
        tin="1234567890123",
        defaults={"full_name": "Test User"},
    )
    return taxpayer


@given(cost=st.floats(min_value=0.01, max_value=1e12, allow_nan=False, allow_infinity=False))
@settings(max_examples=25)
def test_property_3_bik_taxable_value(cost):
    result = calculate_bik_taxable_value(cost)
    assert result == cost * 0.05


@given(n=st.integers(min_value=1, max_value=10))
@settings(max_examples=25, suppress_health_check=[HealthCheck.function_scoped_fixture])
async def test_property_4_multiple_income_entries_persisted(tortoise_db, n):
    taxpayer = await _get_or_create_taxpayer()
    svc = FilingService()
    filing = await svc.create_draft(str(taxpayer.id), 2025)
    entries_data = [
        {
            "income_type": "employment",
            "description": f"Income source {i}",
            "gross_amount_ngn": float(1_000_000 * (i + 1)),
        }
        for i in range(n)
    ]
    await svc.save_step(str(filing.id), {"income_entries": entries_data})
    retrieved = await IncomeEntry.filter(filing_id=filing.id)
    assert len(retrieved) == n, f"Expected {n} income entries, got {len(retrieved)}"
