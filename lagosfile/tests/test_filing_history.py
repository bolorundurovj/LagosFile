"""
Unit tests for FilingService — filing history query and pagination.

Covers:
- list_filings returns paginated results
- list_filings filters by YOA
- list_filings filters by status
- list_filings returns correct metric counts
- get_filing_detail returns filing with related entries

Requirements: 10.1, 10.2, 10.3, 10.6
"""

import pytest
from datetime import date
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
# DB + Taxpayer fixtures
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


@pytest.fixture
async def taxpayer() -> Taxpayer:
    return await Taxpayer.create(full_name="Chidi Okeke", tin="9876543210123")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _make_confirmed(svc: FilingService, taxpayer: Taxpayer, yoa: int) -> Filing:
    """Create and confirm a filing for the given taxpayer and YOA."""
    filing = await svc.create_draft(str(taxpayer.id), yoa)
    return await svc.confirm(str(filing.id))


# ---------------------------------------------------------------------------
# list_filings — pagination
# ---------------------------------------------------------------------------


async def test_list_filings_returns_all_when_within_page(taxpayer):
    svc = FilingService()
    for yoa in [2023, 2024, 2025]:
        await svc.create_draft(str(taxpayer.id), yoa)

    result = await svc.list_filings(str(taxpayer.id), page=1, page_size=10)

    assert result["total"] == 3
    assert len(result["filings"]) == 3
    assert result["page"] == 1
    assert result["page_size"] == 10


async def test_list_filings_paginates_correctly(taxpayer):
    svc = FilingService()
    for yoa in range(2020, 2026):  # 6 filings
        await svc.create_draft(str(taxpayer.id), yoa)

    page1 = await svc.list_filings(str(taxpayer.id), page=1, page_size=4)
    page2 = await svc.list_filings(str(taxpayer.id), page=2, page_size=4)

    assert len(page1["filings"]) == 4
    assert len(page2["filings"]) == 2
    assert page1["total"] == 6
    assert page2["total"] == 6


async def test_list_filings_empty_for_unknown_taxpayer():
    svc = FilingService()
    import uuid
    result = await svc.list_filings(str(uuid.uuid4()), page=1, page_size=10)

    assert result["total"] == 0
    assert result["filings"] == []


async def test_list_filings_returns_correct_page_metadata(taxpayer):
    svc = FilingService()
    await svc.create_draft(str(taxpayer.id), 2025)

    result = await svc.list_filings(str(taxpayer.id), page=3, page_size=5)

    assert result["page"] == 3
    assert result["page_size"] == 5


# ---------------------------------------------------------------------------
# list_filings — filter by YOA
# ---------------------------------------------------------------------------


async def test_list_filings_filter_by_yoa(taxpayer):
    svc = FilingService()
    await svc.create_draft(str(taxpayer.id), 2024)
    await svc.create_draft(str(taxpayer.id), 2025)
    await svc.create_draft(str(taxpayer.id), 2025)

    result = await svc.list_filings(
        str(taxpayer.id), page=1, page_size=10, filters={"yoa": 2025}
    )

    assert result["total"] == 2
    assert all(f.year_of_assessment == 2025 for f in result["filings"])


async def test_list_filings_filter_by_yoa_no_match(taxpayer):
    svc = FilingService()
    await svc.create_draft(str(taxpayer.id), 2024)

    result = await svc.list_filings(
        str(taxpayer.id), page=1, page_size=10, filters={"yoa": 2099}
    )

    assert result["total"] == 0
    assert result["filings"] == []


# ---------------------------------------------------------------------------
# list_filings — filter by status
# ---------------------------------------------------------------------------


async def test_list_filings_filter_by_status_draft(taxpayer):
    svc = FilingService()
    await svc.create_draft(str(taxpayer.id), 2024)
    await svc.create_draft(str(taxpayer.id), 2025)
    confirmed_filing = await svc.create_draft(str(taxpayer.id), 2023)
    await svc.confirm(str(confirmed_filing.id))

    result = await svc.list_filings(
        str(taxpayer.id), page=1, page_size=10, filters={"status": "Draft"}
    )

    assert result["total"] == 2
    assert all(f.status == "Draft" for f in result["filings"])


async def test_list_filings_filter_by_status_confirmed(taxpayer):
    svc = FilingService()
    await svc.create_draft(str(taxpayer.id), 2024)
    f1 = await svc.create_draft(str(taxpayer.id), 2025)
    await svc.confirm(str(f1.id))
    f2 = await svc.create_draft(str(taxpayer.id), 2023)
    await svc.confirm(str(f2.id))

    result = await svc.list_filings(
        str(taxpayer.id), page=1, page_size=10, filters={"status": "Confirmed"}
    )

    assert result["total"] == 2
    assert all(f.status == "Confirmed" for f in result["filings"])


async def test_list_filings_filter_by_yoa_and_status(taxpayer):
    svc = FilingService()
    f1 = await svc.create_draft(str(taxpayer.id), 2025)
    await svc.confirm(str(f1.id))
    await svc.create_draft(str(taxpayer.id), 2025)  # Draft for same YOA
    await svc.create_draft(str(taxpayer.id), 2024)  # Different YOA

    result = await svc.list_filings(
        str(taxpayer.id),
        page=1,
        page_size=10,
        filters={"yoa": 2025, "status": "Confirmed"},
    )

    assert result["total"] == 1
    assert result["filings"][0].year_of_assessment == 2025
    assert result["filings"][0].status == "Confirmed"


# ---------------------------------------------------------------------------
# list_filings — metric counts
# ---------------------------------------------------------------------------


async def test_list_filings_metric_counts(taxpayer):
    svc = FilingService()

    # 2 Drafts
    await svc.create_draft(str(taxpayer.id), 2024)
    await svc.create_draft(str(taxpayer.id), 2025)

    # 1 Confirmed
    f_confirmed = await svc.create_draft(str(taxpayer.id), 2023)
    await svc.confirm(str(f_confirmed.id))

    # 1 Submitted (confirm then manually set to Submitted)
    f_submitted = await svc.create_draft(str(taxpayer.id), 2022)
    confirmed_sub = await svc.confirm(str(f_submitted.id))
    confirmed_sub.status = "Submitted"
    await confirmed_sub.save()

    result = await svc.list_filings(str(taxpayer.id), page=1, page_size=10)

    metrics = result["metrics"]
    assert metrics["total"] == 4
    assert metrics["drafts"] == 2
    assert metrics["confirmed"] == 1
    assert metrics["submitted"] == 1


async def test_list_filings_metrics_unaffected_by_filters(taxpayer):
    """Metrics always reflect the full taxpayer scope, not the filtered page."""
    svc = FilingService()
    await svc.create_draft(str(taxpayer.id), 2024)
    await svc.create_draft(str(taxpayer.id), 2025)

    # Filter to only 2025, but metrics should still show total=2
    result = await svc.list_filings(
        str(taxpayer.id), page=1, page_size=10, filters={"yoa": 2025}
    )

    assert result["total"] == 1          # filtered count
    assert result["metrics"]["total"] == 2  # unfiltered total


# ---------------------------------------------------------------------------
# get_filing_detail — prefetched relations
# ---------------------------------------------------------------------------


async def test_get_filing_detail_returns_filing(taxpayer):
    svc = FilingService()
    filing = await svc.create_draft(str(taxpayer.id), 2025)

    detail = await svc.get_filing_detail(str(filing.id))

    assert str(detail.id) == str(filing.id)
    assert detail.year_of_assessment == 2025


async def test_get_filing_detail_prefetches_income_entries(taxpayer):
    svc = FilingService()
    filing = await svc.create_draft(str(taxpayer.id), 2025)
    await IncomeEntry.create(
        filing=filing, income_type="employment", gross_amount_ngn=5_000_000.0
    )
    await IncomeEntry.create(
        filing=filing, income_type="rental", gross_amount_ngn=1_200_000.0
    )

    detail = await svc.get_filing_detail(str(filing.id))

    entries = list(detail.income_entries)
    assert len(entries) == 2
    types = {e.income_type for e in entries}
    assert types == {"employment", "rental"}


async def test_get_filing_detail_prefetches_capital_allowances(taxpayer):
    svc = FilingService()
    filing = await svc.create_draft(str(taxpayer.id), 2025)
    await CapitalAllowance.create(
        filing=filing,
        asset_description="Laptop",
        asset_type="Computer/Laptop",
        asset_cost=600_000.0,
        acquisition_date=date(2024, 1, 10),
        tax_written_down_value=450_000.0,
        annual_allowance_rate=0.25,
        annual_allowance_amount=150_000.0,
    )

    detail = await svc.get_filing_detail(str(filing.id))

    allowances = list(detail.capital_allowances)
    assert len(allowances) == 1
    assert allowances[0].asset_description == "Laptop"


async def test_get_filing_detail_prefetches_relief_entries(taxpayer):
    svc = FilingService()
    filing = await svc.create_draft(str(taxpayer.id), 2025)
    await ReliefEntry.create(
        filing=filing,
        relief_type="pension",
        claimed_amount=300_000.0,
        approved_amount=300_000.0,
    )

    detail = await svc.get_filing_detail(str(filing.id))

    reliefs = list(detail.relief_entries)
    assert len(reliefs) == 1
    assert reliefs[0].relief_type == "pension"


async def test_get_filing_detail_empty_relations(taxpayer):
    """A filing with no entries should return empty prefetched lists."""
    svc = FilingService()
    filing = await svc.create_draft(str(taxpayer.id), 2025)

    detail = await svc.get_filing_detail(str(filing.id))

    assert list(detail.income_entries) == []
    assert list(detail.capital_allowances) == []
    assert list(detail.relief_entries) == []
