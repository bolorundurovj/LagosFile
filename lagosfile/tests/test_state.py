"""
Unit tests for AppState and WizardDraft state management.

Covers:
- advance_step increments current_step
- advance_step does not exceed step 4
- go_back decrements current_step
- go_back does not go below step 1
- WizardDraft data is preserved on back navigation

Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8
"""

from unittest.mock import AsyncMock, MagicMock

import pytest
from tortoise import Tortoise

from lagosfile.models import Filing, Taxpayer
from lagosfile.services.config_engine import NTA_2025_CONFIG
from lagosfile.state import (
    MAX_STEP,
    MIN_STEP,
    AppState,
    WizardDraft,
    advance_step,
    go_back,
)

# ---------------------------------------------------------------------------
# DB fixture (needed for Filing ORM objects)
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
    return await Taxpayer.create(full_name="Test User", tin="1234567890123")


@pytest.fixture
async def filing(taxpayer) -> Filing:
    return await Filing.create(
        taxpayer_id=taxpayer.id,
        year_of_assessment=2025,
        status="Draft",
        tax_config_version="",
    )


def _make_app_state(filing, step: int = 1) -> AppState:
    """Build a minimal AppState for testing."""
    return AppState(
        taxpayer=None,
        active_filing=filing,
        active_config=NTA_2025_CONFIG,
        current_step=step,
        wizard_data=WizardDraft(),
    )


def _stub_filing_service() -> MagicMock:
    """Return a FilingService stub whose save_step is a no-op AsyncMock."""
    svc = MagicMock()
    svc.save_step = AsyncMock(return_value=None)
    return svc


# ---------------------------------------------------------------------------
# WizardDraft defaults
# ---------------------------------------------------------------------------


def test_wizard_draft_default_step():
    draft = WizardDraft()
    assert draft.current_step == 1


def test_wizard_draft_default_lists_are_empty():
    draft = WizardDraft()
    assert draft.income_entries == []
    assert draft.capital_allowances == []
    assert draft.relief_entries == []


# ---------------------------------------------------------------------------
# advance_step — increments current_step
# ---------------------------------------------------------------------------


async def test_advance_step_increments_from_1_to_2(filing):
    app_state = _make_app_state(filing, step=1)
    svc = _stub_filing_service()

    await advance_step(app_state, svc)

    assert app_state.current_step == 2


async def test_advance_step_increments_from_2_to_3(filing):
    app_state = _make_app_state(filing, step=2)
    svc = _stub_filing_service()

    await advance_step(app_state, svc)

    assert app_state.current_step == 3


async def test_advance_step_increments_from_3_to_4(filing):
    app_state = _make_app_state(filing, step=3)
    svc = _stub_filing_service()

    await advance_step(app_state, svc)

    assert app_state.current_step == 4


# ---------------------------------------------------------------------------
# advance_step — does not exceed MAX_STEP (4)
# ---------------------------------------------------------------------------


async def test_advance_step_does_not_exceed_max(filing):
    app_state = _make_app_state(filing, step=MAX_STEP)
    svc = _stub_filing_service()

    await advance_step(app_state, svc)

    assert app_state.current_step == MAX_STEP


async def test_advance_step_at_max_stays_at_max(filing):
    """Calling advance_step multiple times at step 4 stays at 4."""
    app_state = _make_app_state(filing, step=MAX_STEP)
    svc = _stub_filing_service()

    await advance_step(app_state, svc)
    await advance_step(app_state, svc)

    assert app_state.current_step == MAX_STEP


# ---------------------------------------------------------------------------
# advance_step — calls save_step with correct step data
# ---------------------------------------------------------------------------


async def test_advance_step_1_calls_save_step_with_income_entries(filing):
    app_state = _make_app_state(filing, step=1)
    app_state.wizard_data.income_entries = [{"income_type": "employment", "gross_amount_ngn": 1_000_000.0}]
    svc = _stub_filing_service()

    await advance_step(app_state, svc)

    svc.save_step.assert_awaited_once_with(
        str(filing.id),
        {"income_entries": app_state.wizard_data.income_entries},
    )


async def test_advance_step_2_calls_save_step_with_capital_allowances(filing):
    app_state = _make_app_state(filing, step=2)
    app_state.wizard_data.capital_allowances = [{"asset_type": "Computer/Laptop", "asset_cost": 500_000.0}]
    svc = _stub_filing_service()

    await advance_step(app_state, svc)

    svc.save_step.assert_awaited_once_with(
        str(filing.id),
        {"capital_allowances": app_state.wizard_data.capital_allowances},
    )


async def test_advance_step_3_calls_save_step_with_relief_entries(filing):
    app_state = _make_app_state(filing, step=3)
    app_state.wizard_data.relief_entries = [
        {
            "relief_type": "pension",
            "claimed_amount": 200_000.0,
            "approved_amount": 200_000.0,
        }
    ]
    svc = _stub_filing_service()

    await advance_step(app_state, svc)

    svc.save_step.assert_awaited_once_with(
        str(filing.id),
        {"relief_entries": app_state.wizard_data.relief_entries},
    )


async def test_advance_step_4_does_not_call_save_step(filing):
    """Step 4 is the review step — no data to flush, save_step not called."""
    app_state = _make_app_state(filing, step=MAX_STEP)
    svc = _stub_filing_service()

    await advance_step(app_state, svc)

    svc.save_step.assert_not_awaited()


# ---------------------------------------------------------------------------
# advance_step — raises if no active filing
# ---------------------------------------------------------------------------


async def test_advance_step_raises_without_active_filing():
    app_state = AppState(
        taxpayer=None,
        active_filing=None,
        active_config=NTA_2025_CONFIG,
        current_step=1,
        wizard_data=WizardDraft(),
    )
    svc = _stub_filing_service()

    with pytest.raises(ValueError, match="No active filing"):
        await advance_step(app_state, svc)


# ---------------------------------------------------------------------------
# go_back — decrements current_step
# ---------------------------------------------------------------------------


def test_go_back_decrements_from_4_to_3(filing):
    app_state = _make_app_state(filing, step=4)
    go_back(app_state)
    assert app_state.current_step == 3


def test_go_back_decrements_from_3_to_2(filing):
    app_state = _make_app_state(filing, step=3)
    go_back(app_state)
    assert app_state.current_step == 2


def test_go_back_decrements_from_2_to_1(filing):
    app_state = _make_app_state(filing, step=2)
    go_back(app_state)
    assert app_state.current_step == 1


# ---------------------------------------------------------------------------
# go_back — does not go below MIN_STEP (1)
# ---------------------------------------------------------------------------


def test_go_back_does_not_go_below_min(filing):
    app_state = _make_app_state(filing, step=MIN_STEP)
    go_back(app_state)
    assert app_state.current_step == MIN_STEP


def test_go_back_at_min_stays_at_min(filing):
    """Calling go_back multiple times at step 1 stays at 1."""
    app_state = _make_app_state(filing, step=MIN_STEP)
    go_back(app_state)
    go_back(app_state)
    assert app_state.current_step == MIN_STEP


# ---------------------------------------------------------------------------
# WizardDraft data is preserved on back navigation
# ---------------------------------------------------------------------------


def test_go_back_preserves_income_entries(filing):
    app_state = _make_app_state(filing, step=2)
    app_state.wizard_data.income_entries = [{"income_type": "employment", "gross_amount_ngn": 5_000_000.0}]

    go_back(app_state)

    assert app_state.wizard_data.income_entries == [{"income_type": "employment", "gross_amount_ngn": 5_000_000.0}]


def test_go_back_preserves_capital_allowances(filing):
    app_state = _make_app_state(filing, step=3)
    app_state.wizard_data.capital_allowances = [{"asset_type": "Computer/Laptop", "asset_cost": 800_000.0}]

    go_back(app_state)

    assert app_state.wizard_data.capital_allowances == [{"asset_type": "Computer/Laptop", "asset_cost": 800_000.0}]


def test_go_back_preserves_relief_entries(filing):
    app_state = _make_app_state(filing, step=4)
    app_state.wizard_data.relief_entries = [
        {"relief_type": "nhis", "claimed_amount": 50_000.0, "approved_amount": 50_000.0}
    ]

    go_back(app_state)

    assert app_state.wizard_data.relief_entries == [
        {"relief_type": "nhis", "claimed_amount": 50_000.0, "approved_amount": 50_000.0}
    ]


def test_go_back_preserves_all_wizard_data(filing):
    """All three lists are preserved after going back."""
    app_state = _make_app_state(filing, step=4)
    app_state.wizard_data.income_entries = [{"income_type": "rental", "gross_amount_ngn": 1_200_000.0}]
    app_state.wizard_data.capital_allowances = [{"asset_type": "Monitor", "asset_cost": 200_000.0}]
    app_state.wizard_data.relief_entries = [
        {
            "relief_type": "pension",
            "claimed_amount": 300_000.0,
            "approved_amount": 300_000.0,
        }
    ]

    go_back(app_state)
    go_back(app_state)
    go_back(app_state)

    assert len(app_state.wizard_data.income_entries) == 1
    assert len(app_state.wizard_data.capital_allowances) == 1
    assert len(app_state.wizard_data.relief_entries) == 1
    assert app_state.current_step == MIN_STEP
