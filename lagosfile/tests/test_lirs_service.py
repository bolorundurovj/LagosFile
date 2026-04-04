"""
Unit tests for LIRSService and mark_submitted.

Requirements: 12.1, 12.4, 12.5, 12.7, 12.8
"""

import pytest
from unittest.mock import MagicMock, patch
from tortoise import Tortoise

from lagosfile.models import Filing, Taxpayer
from lagosfile.services.filing_service import FilingService
from lagosfile.services.lirs_service import AutomationResult, LIRSService


# ---------------------------------------------------------------------------
# DB fixture
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
async def tortoise_db():
    await Tortoise.init(
        db_url="sqlite://:memory:",
        modules={"models": ["lagosfile.models"]},
    )
    await Tortoise.generate_schemas()
    yield
    await Tortoise.close_connections()


@pytest.fixture
async def taxpayer():
    return await Taxpayer.create(full_name="Test User", tin="1234567890123")


# ---------------------------------------------------------------------------
# LIRSService.file_with_lirs — fallback on exception
# ---------------------------------------------------------------------------

def test_file_with_lirs_returns_fallback_on_playwright_exception():
    """When Playwright raises, fallback_active must be True."""
    svc = LIRSService()

    with patch("lagosfile.services.lirs_service.webbrowser.open") as mock_open:
        with patch.dict("sys.modules", {"playwright.sync_api": MagicMock(
            sync_playwright=MagicMock(side_effect=Exception("Playwright not installed"))
        )}):
            result = svc.file_with_lirs({"total_income_ngn": 5_000_000.0})

    assert result.success is False
    assert result.fallback_active is True
    assert result.error_message is not None


def test_file_with_lirs_opens_browser_on_failure():
    """On failure, the system browser must be opened with the LIRS portal URL."""
    svc = LIRSService()

    with patch("lagosfile.services.lirs_service.webbrowser.open") as mock_open:
        with patch.dict("sys.modules", {"playwright.sync_api": MagicMock(
            sync_playwright=MagicMock(side_effect=RuntimeError("no browser"))
        )}):
            svc.file_with_lirs({})

    mock_open.assert_called_once_with("https://etax.lirs.gov.ng")


def test_file_with_lirs_fallback_when_import_fails():
    """If playwright is not installed (ImportError), fallback activates."""
    svc = LIRSService()

    with patch("lagosfile.services.lirs_service.webbrowser.open"):
        with patch.dict("sys.modules", {"playwright": None, "playwright.sync_api": None}):
            result = svc.file_with_lirs({"final_tax_payable": 100_000.0})

    assert result.success is False
    assert result.fallback_active is True


# ---------------------------------------------------------------------------
# LIRSService.get_reference_panel_data
# ---------------------------------------------------------------------------

def test_get_reference_panel_data_contains_required_fields():
    """Reference panel must include all Form A section names."""
    svc = LIRSService()
    filing_data = {
        "total_income_ngn": 5_000_000.0,
        "chargeable_income": 4_200_000.0,
        "tax_payable": 450_000.0,
        "wht_credit": 50_000.0,
        "net_tax_payable": 400_000.0,
        "minimum_tax": 50_000.0,
        "final_tax_payable": 400_000.0,
        "filing_reference": "LIRS/REF/2025/00001",
        "year_of_assessment": 2025,
        "taxpayer_name": "Ada Okonkwo",
        "tin": "1234567890123",
    }

    panel = svc.get_reference_panel_data(filing_data)

    assert panel["Total Income (NGN)"] == 5_000_000.0
    assert panel["Final Tax Payable"] == 400_000.0
    assert panel["Filing Reference"] == "LIRS/REF/2025/00001"
    assert panel["TIN"] == "1234567890123"


def test_get_reference_panel_data_handles_missing_fields():
    """Missing fields should map to None, not raise."""
    svc = LIRSService()
    panel = svc.get_reference_panel_data({})

    assert panel["Total Income (NGN)"] is None
    assert panel["Final Tax Payable"] is None


# ---------------------------------------------------------------------------
# FilingService.mark_submitted
# ---------------------------------------------------------------------------

async def test_mark_submitted_sets_status(taxpayer):
    svc = FilingService()
    filing = await svc.create_draft(str(taxpayer.id), 2025)
    confirmed = await svc.confirm(str(filing.id))

    submitted = await svc.mark_submitted(str(confirmed.id))

    assert submitted.status == "Submitted"


async def test_mark_submitted_persists_to_db(taxpayer):
    svc = FilingService()
    filing = await svc.create_draft(str(taxpayer.id), 2025)
    confirmed = await svc.confirm(str(filing.id))
    await svc.mark_submitted(str(confirmed.id))

    fetched = await Filing.get(id=confirmed.id)
    assert fetched.status == "Submitted"


async def test_mark_submitted_raises_for_draft(taxpayer):
    svc = FilingService()
    filing = await svc.create_draft(str(taxpayer.id), 2025)

    with pytest.raises(ValueError, match="Confirmed"):
        await svc.mark_submitted(str(filing.id))


async def test_mark_submitted_raises_for_already_submitted(taxpayer):
    svc = FilingService()
    filing = await svc.create_draft(str(taxpayer.id), 2025)
    confirmed = await svc.confirm(str(filing.id))
    await svc.mark_submitted(str(confirmed.id))

    with pytest.raises(ValueError, match="Confirmed"):
        await svc.mark_submitted(str(confirmed.id))




