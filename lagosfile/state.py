from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from lagosfile.models import Filing, Taxpayer
    from lagosfile.services.config_engine import TaxConfig
    from lagosfile.services.filing_service import FilingService


@dataclass
class WizardDraft:
    income_entries: list[dict] = field(default_factory=list)
    capital_allowances: list[dict] = field(default_factory=list)
    relief_entries: list[dict] = field(default_factory=list)
    current_step: int = 1


@dataclass
class AppState:
    taxpayer: Taxpayer | None
    active_filing: Filing | None
    active_config: TaxConfig
    current_step: int
    wizard_data: WizardDraft


_STEP_DATA_KEYS = {
    1: "income_entries",
    2: "capital_allowances",
    3: "relief_entries",
}
MAX_STEP = 4
MIN_STEP = 1


async def advance_step(app_state: AppState, filing_service: FilingService) -> None:
    if app_state.active_filing is None:
        raise ValueError("No active filing to advance.")
    step = app_state.current_step
    key = _STEP_DATA_KEYS.get(step)
    if key is not None:
        step_data = {key: getattr(app_state.wizard_data, key)}
        await filing_service.save_step(str(app_state.active_filing.id), step_data)
    if app_state.current_step < MAX_STEP:
        app_state.current_step += 1


def go_back(app_state: AppState) -> None:
    if app_state.current_step > MIN_STEP:
        app_state.current_step -= 1
