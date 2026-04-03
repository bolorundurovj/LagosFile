"""
AppState and WizardDraft — lightweight in-memory state management for LagosFile.

WizardDraft accumulates step data in memory between wizard steps.
It is flushed to TortoiseORM models via FilingService.save_step() on every
step transition.

AppState is a singleton passed through the Flet page's `data` attribute.

Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from lagosfile.models import Filing, Taxpayer
    from lagosfile.services.config_engine import TaxConfig
    from lagosfile.services.filing_service import FilingService


# ---------------------------------------------------------------------------
# WizardDraft
# ---------------------------------------------------------------------------

@dataclass
class WizardDraft:
    """In-memory accumulator for wizard step data.

    Each list holds the raw dict payloads for the corresponding wizard step.
    The draft is flushed to ORM models on every step transition via
    FilingService.save_step().

    Fields:
        income_entries:     Step 1 — income source entries.
        capital_allowances: Step 2 — capital allowance entries.
        relief_entries:     Step 3 — deduction/relief entries.
        current_step:       The wizard step the user is currently on (1–4).
    """

    income_entries: list[dict] = field(default_factory=list)
    capital_allowances: list[dict] = field(default_factory=list)
    relief_entries: list[dict] = field(default_factory=list)
    current_step: int = 1


# ---------------------------------------------------------------------------
# AppState
# ---------------------------------------------------------------------------

@dataclass
class AppState:
    """Application-wide state singleton.

    Populated from the decrypted DB after PIN entry and passed through the
    Flet page's `data` attribute so all UI components share the same instance.

    Fields:
        taxpayer:       The logged-in Taxpayer ORM record, or None before login.
        active_filing:  The Filing currently being edited, or None.
        active_config:  The active TaxConfig dataclass (loaded at startup).
        current_step:   The wizard step the user is currently on (1–4).
        wizard_data:    The in-memory WizardDraft accumulator.
    """

    taxpayer: Optional["Taxpayer"]
    active_filing: Optional["Filing"]
    active_config: "TaxConfig"
    current_step: int
    wizard_data: WizardDraft


# ---------------------------------------------------------------------------
# Step-transition helpers
# ---------------------------------------------------------------------------

_STEP_DATA_KEYS = {
    1: "income_entries",
    2: "capital_allowances",
    3: "relief_entries",
}

MAX_STEP = 4
MIN_STEP = 1


async def advance_step(app_state: AppState, filing_service: "FilingService") -> None:
    """Flush the current step's WizardDraft data to ORM and advance current_step.

    - Calls filing_service.save_step() with the data for the current step.
    - Increments app_state.current_step (capped at MAX_STEP = 4).
    - Does NOT advance past step 4.

    Requirements: 3.4, 3.5

    Args:
        app_state:      The shared AppState instance.
        filing_service: The FilingService used to persist step data.
    """
    if app_state.active_filing is None:
        raise ValueError("No active filing to advance.")

    step = app_state.current_step

    # Build the step_data payload for the current step
    key = _STEP_DATA_KEYS.get(step)
    if key is not None:
        step_data = {key: getattr(app_state.wizard_data, key)}
        await filing_service.save_step(
            str(app_state.active_filing.id), step_data
        )

    # Advance step, capped at MAX_STEP
    if app_state.current_step < MAX_STEP:
        app_state.current_step += 1


def go_back(app_state: AppState) -> None:
    """Decrement current_step without losing WizardDraft data.

    - Decrements app_state.current_step (floored at MIN_STEP = 1).
    - WizardDraft data is preserved so the user can review/edit prior steps.
    - Has no effect when already on step 1.

    Requirements: 3.6, 3.7

    Args:
        app_state: The shared AppState instance.
    """
    if app_state.current_step > MIN_STEP:
        app_state.current_step -= 1
