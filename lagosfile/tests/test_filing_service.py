"""
Unit tests for FilingService — draft lifecycle.

Covers: create_draft, confirm, duplicate, amend.

Requirements: 3.1, 3.4, 3.5, 10.4, 10.5, 10.8
"""

import re
from datetime import date

import pytest
from tortoise import Tortoise

from lagosfile.models import (
    CapitalAllowance,
    Filing,
    IncomeEntry,
    ReliefEntry,
    Taxpayer,
)
from lagosfile.services.filing_service import FilingService

# ---------------------------------------------------------------------------
# DB + Taxpayer fixture
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
async def tortoise_db():
    """Fresh in-memory DB per test, with a default Taxpayer available."""
    await Tortoise.init(
        db_url="sqlite://:memory:",
        modules={"models": ["lagosfile.models"]},
    )
    await Tortoise.generate_schemas()
    yield
    await Tortoise.close_connections()


@pytest.fixture
async def taxpayer() -> Taxpayer:
    """Create and return a Taxpayer record for use in tests."""
    return await Taxpayer.create(
        full_name="Ada Okonkwo",
        tin="1234567890123",
    )


# ---------------------------------------------------------------------------
# create_draft
# ---------------------------------------------------------------------------


async def test_create_draft_returns_filing(taxpayer):
    svc = FilingService()
    filing = await svc.create_draft(str(taxpayer.id), 2025)

    assert filing.id is not None
    assert filing.status == "Draft"
    assert filing.year_of_assessment == 2025


async def test_create_draft_status_is_draft(taxpayer):
    svc = FilingService()
    filing = await svc.create_draft(str(taxpayer.id), 2024)
    assert filing.status == "Draft"


async def test_create_draft_persisted_to_db(taxpayer):
    svc = FilingService()
    filing = await svc.create_draft(str(taxpayer.id), 2025)

    fetched = await Filing.get(id=filing.id)
    assert fetched.status == "Draft"
    assert fetched.year_of_assessment == 2025


# ---------------------------------------------------------------------------
# save_step
# ---------------------------------------------------------------------------


async def test_save_step_income_entries(taxpayer):
    svc = FilingService()
    filing = await svc.create_draft(str(taxpayer.id), 2025)

    step_data = {
        "income_entries": [
            {
                "income_type": "employment",
                "description": "Salary",
                "gross_amount_ngn": 5_000_000.0,
            }
        ]
    }
    await svc.save_step(str(filing.id), step_data)

    entries = await IncomeEntry.filter(filing_id=filing.id)
    assert len(entries) == 1
    assert entries[0].income_type == "employment"
    assert entries[0].gross_amount_ngn == 5_000_000.0


async def test_save_step_replaces_existing_income_entries(taxpayer):
    svc = FilingService()
    filing = await svc.create_draft(str(taxpayer.id), 2025)

    await svc.save_step(
        str(filing.id),
        {"income_entries": [{"income_type": "business", "gross_amount_ngn": 1_000_000.0}]},
    )
    await svc.save_step(
        str(filing.id),
        {
            "income_entries": [
                {"income_type": "rental", "gross_amount_ngn": 2_000_000.0},
                {"income_type": "dividend", "gross_amount_ngn": 500_000.0},
            ]
        },
    )

    entries = await IncomeEntry.filter(filing_id=filing.id)
    assert len(entries) == 2


async def test_save_step_capital_allowances(taxpayer):
    svc = FilingService()
    filing = await svc.create_draft(str(taxpayer.id), 2025)

    step_data = {
        "capital_allowances": [
            {
                "asset_description": "MacBook Pro",
                "asset_type": "Computer/Laptop",
                "asset_cost": 800_000.0,
                "acquisition_date": date(2024, 3, 1),
                "tax_written_down_value": 600_000.0,
                "annual_allowance_rate": 0.25,
                "annual_allowance_amount": 200_000.0,
            }
        ]
    }
    await svc.save_step(str(filing.id), step_data)

    allowances = await CapitalAllowance.filter(filing_id=filing.id)
    assert len(allowances) == 1
    assert allowances[0].asset_description == "MacBook Pro"


async def test_save_step_relief_entries(taxpayer):
    svc = FilingService()
    filing = await svc.create_draft(str(taxpayer.id), 2025)

    step_data = {
        "relief_entries": [
            {
                "relief_type": "pension",
                "claimed_amount": 300_000.0,
                "approved_amount": 300_000.0,
            }
        ]
    }
    await svc.save_step(str(filing.id), step_data)

    reliefs = await ReliefEntry.filter(filing_id=filing.id)
    assert len(reliefs) == 1
    assert reliefs[0].relief_type == "pension"


async def test_save_step_returns_filing(taxpayer):
    svc = FilingService()
    filing = await svc.create_draft(str(taxpayer.id), 2025)
    result = await svc.save_step(str(filing.id), {})
    assert str(result.id) == str(filing.id)


# ---------------------------------------------------------------------------
# confirm
# ---------------------------------------------------------------------------


async def test_confirm_sets_status_confirmed(taxpayer):
    svc = FilingService()
    filing = await svc.create_draft(str(taxpayer.id), 2025)
    confirmed = await svc.confirm(str(filing.id))
    assert confirmed.status == "Confirmed"


async def test_confirm_sets_confirmed_at(taxpayer):
    svc = FilingService()
    filing = await svc.create_draft(str(taxpayer.id), 2025)
    confirmed = await svc.confirm(str(filing.id))
    assert confirmed.confirmed_at is not None


async def test_confirm_generates_valid_reference(taxpayer):
    svc = FilingService()
    filing = await svc.create_draft(str(taxpayer.id), 2025)
    confirmed = await svc.confirm(str(filing.id))

    assert confirmed.filing_reference is not None
    pattern = r"^LIRS/REF/\d{4}/\d{5}$"
    assert re.match(pattern, confirmed.filing_reference), (
        f"Reference '{confirmed.filing_reference}' does not match LIRS/REF/YYYY/NNNNN"
    )


async def test_confirm_reference_contains_correct_yoa(taxpayer):
    svc = FilingService()
    filing = await svc.create_draft(str(taxpayer.id), 2025)
    confirmed = await svc.confirm(str(filing.id))
    assert "/2025/" in confirmed.filing_reference


async def test_confirm_sequential_numbering(taxpayer):
    """Second confirmed filing for the same YOA gets sequential number 2."""
    svc = FilingService()

    f1 = await svc.create_draft(str(taxpayer.id), 2025)
    c1 = await svc.confirm(str(f1.id))

    f2 = await svc.create_draft(str(taxpayer.id), 2025)
    c2 = await svc.confirm(str(f2.id))

    assert c1.filing_reference.endswith("00001")
    assert c2.filing_reference.endswith("00002")


async def test_confirm_raises_if_not_draft(taxpayer):
    svc = FilingService()
    filing = await svc.create_draft(str(taxpayer.id), 2025)
    await svc.confirm(str(filing.id))

    with pytest.raises(ValueError, match="Draft"):
        await svc.confirm(str(filing.id))


async def test_confirm_snapshots_tax_config_version(taxpayer):
    svc = FilingService()
    filing = await svc.create_draft(str(taxpayer.id), 2025)
    confirmed = await svc.confirm(str(filing.id))
    assert confirmed.tax_config_version != ""


# ---------------------------------------------------------------------------
# duplicate
# ---------------------------------------------------------------------------


async def test_duplicate_creates_yoa_plus_one(taxpayer):
    svc = FilingService()
    filing = await svc.create_draft(str(taxpayer.id), 2025)
    await svc.confirm(str(filing.id))

    new_filing = await svc.duplicate(str(filing.id))
    assert new_filing.year_of_assessment == 2026


async def test_duplicate_creates_draft_status(taxpayer):
    svc = FilingService()
    filing = await svc.create_draft(str(taxpayer.id), 2025)
    await svc.confirm(str(filing.id))

    new_filing = await svc.duplicate(str(filing.id))
    assert new_filing.status == "Draft"


async def test_duplicate_copies_income_entries(taxpayer):
    svc = FilingService()
    filing = await svc.create_draft(str(taxpayer.id), 2025)
    await svc.save_step(
        str(filing.id),
        {
            "income_entries": [
                {"income_type": "employment", "gross_amount_ngn": 6_000_000.0},
                {"income_type": "rental", "gross_amount_ngn": 1_200_000.0},
            ]
        },
    )
    await svc.confirm(str(filing.id))

    new_filing = await svc.duplicate(str(filing.id))
    new_entries = await IncomeEntry.filter(filing_id=new_filing.id)
    assert len(new_entries) == 2


async def test_duplicate_copies_capital_allowances(taxpayer):
    svc = FilingService()
    filing = await svc.create_draft(str(taxpayer.id), 2025)
    await svc.save_step(
        str(filing.id),
        {
            "capital_allowances": [
                {
                    "asset_description": "Laptop",
                    "asset_type": "Computer/Laptop",
                    "asset_cost": 500_000.0,
                    "acquisition_date": date(2024, 1, 15),
                    "tax_written_down_value": 375_000.0,
                    "annual_allowance_rate": 0.25,
                    "annual_allowance_amount": 125_000.0,
                }
            ]
        },
    )
    await svc.confirm(str(filing.id))

    new_filing = await svc.duplicate(str(filing.id))
    new_allowances = await CapitalAllowance.filter(filing_id=new_filing.id)
    assert len(new_allowances) == 1
    assert new_allowances[0].tax_written_down_value == 375_000.0


async def test_duplicate_does_not_copy_relief_entries(taxpayer):
    svc = FilingService()
    filing = await svc.create_draft(str(taxpayer.id), 2025)
    await svc.save_step(
        str(filing.id),
        {
            "relief_entries": [
                {
                    "relief_type": "pension",
                    "claimed_amount": 200_000.0,
                    "approved_amount": 200_000.0,
                }
            ]
        },
    )
    await svc.confirm(str(filing.id))

    new_filing = await svc.duplicate(str(filing.id))
    new_reliefs = await ReliefEntry.filter(filing_id=new_filing.id)
    assert len(new_reliefs) == 0


async def test_duplicate_raises_if_not_confirmed(taxpayer):
    svc = FilingService()
    filing = await svc.create_draft(str(taxpayer.id), 2025)

    with pytest.raises(ValueError, match="Confirmed"):
        await svc.duplicate(str(filing.id))


# ---------------------------------------------------------------------------
# amend
# ---------------------------------------------------------------------------


async def test_amend_creates_new_draft(taxpayer):
    svc = FilingService()
    filing = await svc.create_draft(str(taxpayer.id), 2025)
    await svc.confirm(str(filing.id))

    amendment = await svc.amend(str(filing.id))
    assert amendment.status == "Draft"


async def test_amend_links_to_original(taxpayer):
    svc = FilingService()
    filing = await svc.create_draft(str(taxpayer.id), 2025)
    await svc.confirm(str(filing.id))

    amendment = await svc.amend(str(filing.id))
    assert str(amendment.parent_filing_id) == str(filing.id)


async def test_amend_same_yoa(taxpayer):
    svc = FilingService()
    filing = await svc.create_draft(str(taxpayer.id), 2025)
    await svc.confirm(str(filing.id))

    amendment = await svc.amend(str(filing.id))
    assert amendment.year_of_assessment == 2025


async def test_amend_original_unchanged(taxpayer):
    """Original confirmed filing must remain unchanged after amendment."""
    svc = FilingService()
    filing = await svc.create_draft(str(taxpayer.id), 2025)
    confirmed = await svc.confirm(str(filing.id))
    original_ref = confirmed.filing_reference
    original_status = confirmed.status

    await svc.amend(str(filing.id))

    # Re-fetch original from DB
    original = await Filing.get(id=filing.id)
    assert original.status == original_status
    assert original.filing_reference == original_ref


async def test_amend_raises_if_not_confirmed(taxpayer):
    svc = FilingService()
    filing = await svc.create_draft(str(taxpayer.id), 2025)

    with pytest.raises(ValueError, match="Confirmed"):
        await svc.amend(str(filing.id))
