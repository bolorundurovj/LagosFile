"""
UI integration tests for LagosFile Flet components.

Tests verify that:
- Each component builds without error
- Required elements are present in the control tree
- Click handlers are wired (on_click is not None)
- State mutations work correctly (e.g. rent relief auto-calc)

Strategy: instantiate components with a MockPage, call build(), then
walk the returned control tree to assert structure and behaviour.
No running Flet app is required.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from unittest.mock import MagicMock

import pytest

# ---------------------------------------------------------------------------
# MockPage — minimal stand-in for ft.Page
# ---------------------------------------------------------------------------

class MockPage:
    """Minimal ft.Page mock for unit-testing Flet components."""

    def __init__(self, app_state=None):
        self.data = app_state
        self.route = "/dashboard"
        self._navigated_to: list[str] = []
        self.dialog = None

    def go(self, route: str) -> None:
        self.route = route
        self._navigated_to.append(route)

    def push_route(self, route: str) -> None:
        self.route = route
        self._navigated_to.append(route)

    def update(self) -> None:
        pass


# ---------------------------------------------------------------------------
# Minimal AppState / WizardDraft stubs (avoid DB imports)
# ---------------------------------------------------------------------------

@dataclass
class _WizardDraft:
    income_entries: list = field(default_factory=list)
    capital_allowances: list = field(default_factory=list)
    relief_entries: list = field(default_factory=list)
    current_step: int = 1


@dataclass
class _Taxpayer:
    full_name: str = "Ada Okonkwo"
    tin: str = "1234567890123"


@dataclass
class _AppState:
    taxpayer: Any = None
    active_filing: Any = None
    active_config: Any = None
    current_step: int = 1
    wizard_data: _WizardDraft = field(default_factory=_WizardDraft)


# ---------------------------------------------------------------------------
# Helper: walk a Flet control tree and collect all controls
# ---------------------------------------------------------------------------

def _collect_controls(control, result=None):
    """Recursively collect all controls in a Flet control tree."""
    if result is None:
        result = []
    if control is None:
        return result
    result.append(control)
    # List-type children
    for attr in ("controls", "actions", "cells", "rows", "columns", "tabs"):
        children = getattr(control, attr, None)
        if children:
            for child in children:
                if child is not None:
                    _collect_controls(child, result)
    # Single-control children
    for attr in ("content", "title", "label", "header", "leading", "trailing"):
        child = getattr(control, attr, None)
        if child is not None and hasattr(child, "__class__") and child is not control:
            _collect_controls(child, result)
    return result


def _find_texts(control) -> list[str]:
    """Return all Text.value strings in the control tree."""
    all_controls = _collect_controls(control)
    texts = []
    for c in all_controls:
        val = getattr(c, "value", None)
        if isinstance(val, str):
            texts.append(val)
        # ft.Text stores its string in .value; also check .data for labels
        lbl = getattr(c, "label", None)
        if isinstance(lbl, str):
            texts.append(lbl)
    return texts


def _get_button_label(c) -> str:
    """Extract a display label from any button-like control."""
    # ft.TextButton / ft.OutlinedButton / ft.ElevatedButton use .text
    text = getattr(c, "text", None)
    if isinstance(text, str):
        return text
    # ft.Button uses .content — may be a plain string or a Row/Text control
    content = getattr(c, "content", None)
    if isinstance(content, str):
        return content
    if content is not None:
        # Recurse into content to find Text values
        sub = _collect_controls(content)
        for s in sub:
            v = getattr(s, "value", None)
            if isinstance(v, str) and v:
                return v
    return ""


def _find_buttons_with_click(control) -> list:
    """Return all controls that have on_click set."""
    all_controls = _collect_controls(control)
    return [c for c in all_controls if getattr(c, "on_click", None) is not None]


# ===========================================================================
# Sidebar tests
# ===========================================================================

class TestSidebar:
    def _make(self, active_route="/dashboard"):
        from lagosfile.ui.components.sidebar import Sidebar, _NAV_ITEMS
        page = MockPage()
        sidebar = Sidebar(page, active_route=active_route)
        return sidebar, page, _NAV_ITEMS

    def test_build_returns_control(self):
        sidebar, _, _ = self._make()
        result = sidebar.build()
        assert result is not None

    def test_contains_logo_text(self):
        sidebar, _, _ = self._make()
        result = sidebar.build()
        texts = _find_texts(result)
        assert "LagosFile" in texts

    def test_all_nav_items_present(self):
        sidebar, _, nav_items = self._make()
        result = sidebar.build()
        texts = _find_texts(result)
        for label, _, _ in nav_items:
            assert label in texts, f"Nav item '{label}' not found in sidebar"

    def test_nav_items_have_click_handlers(self):
        sidebar, _, nav_items = self._make()
        result = sidebar.build()
        clickable = _find_buttons_with_click(result)
        assert len(clickable) >= len(nav_items), "Each nav item should have an on_click handler"

    def test_clicking_nav_item_navigates(self):
        sidebar, page, _ = self._make()
        result = sidebar.build()
        clickable = _find_buttons_with_click(result)
        # Simulate clicking the first nav item
        first = clickable[0]
        first.on_click(MagicMock())
        assert len(page._navigated_to) == 1

    def test_active_route_highlighted(self):
        sidebar, _, _ = self._make(active_route="/wizard")
        result = sidebar.build()
        # Build should not raise; active item styling is applied
        assert result is not None

    def test_support_card_present(self):
        sidebar, _, _ = self._make()
        result = sidebar.build()
        texts = _find_texts(result)
        assert any("help" in t.lower() or "lirs" in t.lower() or "advisor" in t.lower() for t in texts)


# ===========================================================================
# TopBar tests
# ===========================================================================

class TestTopBar:
    def _make(self, with_taxpayer=False):
        from lagosfile.ui.components.topbar import TopBar
        state = _AppState(taxpayer=_Taxpayer() if with_taxpayer else None)
        page = MockPage(app_state=state)
        topbar = TopBar(page, title="Test Page")
        return topbar, page

    def test_build_returns_control(self):
        topbar, _ = self._make()
        assert topbar.build() is not None

    def test_title_present(self):
        topbar, _ = self._make()
        result = topbar.build()
        texts = _find_texts(result)
        assert "Test Page" in texts

    def test_yoa_label_present(self):
        import datetime
        topbar, _ = self._make()
        result = topbar.build()
        texts = _find_texts(result)
        current_year = str(datetime.date.today().year)
        assert any(current_year in t for t in texts)

    def test_shows_placeholder_when_no_taxpayer(self):
        topbar, _ = self._make(with_taxpayer=False)
        result = topbar.build()
        texts = _find_texts(result)
        assert "—" in texts

    def test_shows_taxpayer_name_when_logged_in(self):
        topbar, _ = self._make(with_taxpayer=True)
        result = topbar.build()
        texts = _find_texts(result)
        assert "Ada Okonkwo" in texts

    def test_shows_masked_tin(self):
        topbar, _ = self._make(with_taxpayer=True)
        result = topbar.build()
        texts = _find_texts(result)
        # TIN should be masked — last 4 digits visible
        assert any("0123" in t for t in texts)

    def test_avatar_shows_initial(self):
        topbar, _ = self._make(with_taxpayer=True)
        result = topbar.build()
        texts = _find_texts(result)
        assert "A" in texts  # First initial of "Ada"


# ===========================================================================
# ExportModal tests
# ===========================================================================

class TestExportModal:
    def _make(self, with_filing=True):
        from lagosfile.ui.components.export_modal import ExportModal
        from lagosfile.services.export_engine import FilingExport, IncomeEntryExport
        page = MockPage()
        filing = None
        if with_filing:
            filing = FilingExport(
                taxpayer_name="Ada Okonkwo",
                tin="1234567890123",
                yoa=2025,
                filing_reference="LIRS/REF/2025/00001",
                status="Confirmed",
                total_income_ngn=5_000_000.0,
                chargeable_income=4_200_000.0,
                tax_payable=450_000.0,
                net_tax_payable=400_000.0,
                minimum_tax=50_000.0,
                final_tax_payable=400_000.0,
                income_entries=[
                    IncomeEntryExport(
                        income_type="employment",
                        description="Salary",
                        gross_amount_ngn=5_000_000.0,
                        foreign_currency=None,
                        foreign_amount=None,
                        income_date="2025-03-31",
                        fx_rate_fetched=None,
                        fx_rate_cbn_override=None,
                        fx_rate_used=None,
                        fx_rate_source=None,
                    )
                ],
            )
        modal = ExportModal(page, filing)
        return modal, page

    def test_build_returns_control(self):
        modal, _ = self._make()
        assert modal.build() is not None

    def test_title_present(self):
        modal, _ = self._make()
        result = modal.build()
        texts = _find_texts(result)
        assert any("export" in t.lower() for t in texts)

    def test_format_options_present(self):
        modal, _ = self._make()
        result = modal.build()
        texts = _find_texts(result)
        assert "PDF" in texts
        assert "CSV" in texts
        assert "JSON" in texts

    def test_security_badges_present(self):
        modal, _ = self._make()
        result = modal.build()
        texts = _find_texts(result)
        assert any("encrypted" in t.lower() for t in texts)
        assert any("lirs" in t.lower() or "compliant" in t.lower() for t in texts)

    def test_download_button_has_click_handler(self):
        modal, _ = self._make()
        result = modal.build()
        clickable = _find_buttons_with_click(result)
        labels = [_get_button_label(c) for c in clickable]
        assert any("download" in lbl.lower() for lbl in labels)

    def test_cancel_button_has_click_handler(self):
        modal, _ = self._make()
        result = modal.build()
        clickable = _find_buttons_with_click(result)
        labels = [_get_button_label(c) for c in clickable]
        assert any("cancel" in lbl.lower() for lbl in labels)

    def test_include_attachments_toggle_present(self):
        modal, _ = self._make()
        result = modal.build()
        all_controls = _collect_controls(result)
        # Switch control for include attachments
        switches = [c for c in all_controls if type(c).__name__ == "Switch"]
        assert len(switches) >= 1

    def test_no_filing_shows_error_on_download(self):
        modal, _ = self._make(with_filing=False)
        modal.build()
        modal._on_download(MagicMock())
        assert "no filing" in modal._status_text.value.lower()


# ===========================================================================
# IncomeSourcesStep tests
# ===========================================================================

class TestIncomeSourcesStep:
    def _make(self):
        from lagosfile.ui.pages.wizard_income import IncomeSourcesStep, _INCOME_TYPES
        state = _AppState()
        page = MockPage(app_state=state)
        step = IncomeSourcesStep(page)
        return step, page, _INCOME_TYPES

    def test_build_returns_control(self):
        step, _, _ = self._make()
        assert step.build() is not None

    def test_step_title_present(self):
        step, _, _ = self._make()
        result = step.build()
        texts = _find_texts(result)
        assert any("income" in t.lower() for t in texts)

    def test_all_income_types_present(self):
        step, _, income_types = self._make()
        result = step.build()
        texts = _find_texts(result)
        for label, _, _ in income_types:
            assert label in texts, f"Income type '{label}' not found"

    def test_add_buttons_present_for_each_type(self):
        step, _, income_types = self._make()
        result = step.build()
        clickable = _find_buttons_with_click(result)
        assert len(clickable) >= len(income_types)

    def test_foreign_income_section_present(self):
        step, _, _ = self._make()
        result = step.build()
        texts = _find_texts(result)
        assert any("foreign" in t.lower() for t in texts)

    def test_cbn_compliance_notice_present(self):
        step, _, _ = self._make()
        result = step.build()
        texts = _find_texts(result)
        assert any("cbn" in t.lower() or "section 20" in t.lower() for t in texts)

    def test_document_attachment_zone_present(self):
        step, _, _ = self._make()
        result = step.build()
        texts = _find_texts(result)
        assert any("document" in t.lower() or "attach" in t.lower() for t in texts)

    def test_add_income_entry_updates_wizard_data(self):
        step, page, _ = self._make()
        step._add_income_entry("Employment")
        assert len(page.data.wizard_data.income_entries) == 1
        assert page.data.wizard_data.income_entries[0]["income_type"] == "Employment"

    def test_add_multiple_entries(self):
        step, page, _ = self._make()
        step._add_income_entry("Employment")
        step._add_income_entry("Rental")
        assert len(page.data.wizard_data.income_entries) == 2


# ===========================================================================
# CapitalAllowancesStep tests
# ===========================================================================

class TestCapitalAllowancesStep:
    def _make(self):
        from lagosfile.ui.pages.wizard_allowances import CapitalAllowancesStep, _ASSET_TYPES
        state = _AppState()
        page = MockPage(app_state=state)
        step = CapitalAllowancesStep(page)
        return step, page, _ASSET_TYPES

    def test_build_returns_control(self):
        step, _, _ = self._make()
        assert step.build() is not None

    def test_step_title_present(self):
        step, _, _ = self._make()
        result = step.build()
        texts = _find_texts(result)
        assert any("capital" in t.lower() or "allowance" in t.lower() for t in texts)

    def test_all_asset_types_in_dropdown(self):
        step, _, asset_types = self._make()
        result = step.build()
        all_controls = _collect_controls(result)
        dropdowns = [c for c in all_controls if type(c).__name__ == "Dropdown"]
        assert len(dropdowns) >= 1
        # Check options
        dd = dropdowns[0]
        option_values = [o.key or o.text for o in (dd.options or [])]
        for asset_type in asset_types:
            assert asset_type in option_values, f"Asset type '{asset_type}' missing from dropdown"

    def test_summary_card_shows_zero_initially(self):
        step, _, _ = self._make()
        result = step.build()
        texts = _find_texts(result)
        assert "₦0.00" in texts

    def test_add_asset_button_has_click_handler(self):
        step, _, _ = self._make()
        result = step.build()
        clickable = _find_buttons_with_click(result)
        labels = [_get_button_label(c) for c in clickable]
        assert any("add" in lbl.lower() for lbl in labels)

    def test_add_asset_updates_wizard_data(self):
        step, page, _ = self._make()
        step._on_add_asset(MagicMock())
        assert len(page.data.wizard_data.capital_allowances) == 1

    def test_remove_entry_updates_wizard_data(self):
        step, page, _ = self._make()
        step._on_add_asset(MagicMock())
        step._on_add_asset(MagicMock())
        assert len(page.data.wizard_data.capital_allowances) == 2
        step._remove_entry(0)
        assert len(page.data.wizard_data.capital_allowances) == 1

    def test_recalculate_total_updates_display(self):
        step, _, _ = self._make()
        step._entries = [{"annual_allowance_amount": 200_000.0}]
        step._recalculate_total()
        assert "200,000.00" in step._total_allowance.value

    def test_document_zone_present(self):
        step, _, _ = self._make()
        result = step.build()
        texts = _find_texts(result)
        assert any("document" in t.lower() or "attach" in t.lower() for t in texts)


# ===========================================================================
# DeductionsReliefsStep tests
# ===========================================================================

class TestDeductionsReliefsStep:
    def _make(self):
        from lagosfile.ui.pages.wizard_deductions import DeductionsReliefsStep
        state = _AppState()
        page = MockPage(app_state=state)
        step = DeductionsReliefsStep(page)
        return step, page

    def test_build_returns_control(self):
        step, _ = self._make()
        assert step.build() is not None

    def test_step_title_present(self):
        step, _ = self._make()
        result = step.build()
        texts = _find_texts(result)
        assert any("deduction" in t.lower() or "relief" in t.lower() for t in texts)

    def test_cra_abolition_notice_present(self):
        step, _ = self._make()
        result = step.build()
        texts = _find_texts(result)
        assert any("cra" in t.lower() or "consolidated relief" in t.lower() for t in texts)

    def test_rent_relief_auto_calc_at_zero(self):
        step, _ = self._make()
        step._rent_field.value = "0"
        step._on_rent_change(MagicMock())
        assert step._rent_relief_display.value == "₦0.00"

    def test_rent_relief_auto_calc_below_cap(self):
        step, _ = self._make()
        step._rent_field.value = "1000000"  # ₦1M → 20% = ₦200k (below ₦500k cap)
        step._on_rent_change(MagicMock())
        assert "200,000.00" in step._rent_relief_display.value

    def test_rent_relief_capped_at_500k(self):
        step, _ = self._make()
        step._rent_field.value = "4000000"  # ₦4M → 20% = ₦800k → capped at ₦500k
        step._on_rent_change(MagicMock())
        assert "500,000.00" in step._rent_relief_display.value

    def test_total_deductions_updates_on_change(self):
        step, _ = self._make()
        step._pension_field.value = "300000"
        step._on_relief_change(MagicMock())
        assert "300,000.00" in step._total_deductions_text.value

    def test_wht_section_present(self):
        step, _ = self._make()
        result = step.build()
        texts = _find_texts(result)
        assert any("wht" in t.lower() or "withholding" in t.lower() for t in texts)

    def test_add_wht_button_has_click_handler(self):
        step, _ = self._make()
        result = step.build()
        clickable = _find_buttons_with_click(result)
        labels = [_get_button_label(c) for c in clickable]
        assert any("wht" in lbl.lower() or "add" in lbl.lower() for lbl in labels)

    def test_relief_entries_persisted_to_wizard_data(self):
        step, page = self._make()
        step._pension_field.value = "200000"
        step._on_relief_change(MagicMock())
        pension_entries = [
            e for e in page.data.wizard_data.relief_entries
            if e["relief_type"] == "pension"
        ]
        assert len(pension_entries) == 1
        assert pension_entries[0]["approved_amount"] == 200_000.0

    def test_summary_cards_present(self):
        step, _ = self._make()
        result = step.build()
        texts = _find_texts(result)
        assert any("total deduction" in t.lower() for t in texts)
        assert any("estimated tax" in t.lower() for t in texts)


# ===========================================================================
# FilingHistoryPage tests
# ===========================================================================

class TestFilingHistoryPage:
    def _make(self, with_taxpayer=True):
        from lagosfile.ui.pages.history import FilingHistoryPage
        state = _AppState(taxpayer=_Taxpayer() if with_taxpayer else None)
        page = MockPage(app_state=state)
        history = FilingHistoryPage(page)
        return history, page

    def test_build_returns_control(self):
        history, _ = self._make()
        assert history.build() is not None

    def test_metric_cards_present(self):
        history, _ = self._make()
        result = history.build()
        texts = _find_texts(result)
        assert any("total" in t.lower() for t in texts)
        assert any("submitted" in t.lower() for t in texts)
        assert any("confirmed" in t.lower() for t in texts)
        assert any("draft" in t.lower() for t in texts)

    def test_metric_cards_show_zero_initially(self):
        history, _ = self._make()
        result = history.build()
        texts = _find_texts(result)
        assert "0" in texts

    def test_filter_bar_present(self):
        history, _ = self._make()
        result = history.build()
        all_controls = _collect_controls(result)
        text_fields = [c for c in all_controls if type(c).__name__ == "TextField"]
        assert len(text_fields) >= 1  # YOA filter field

    def test_filter_by_status_dropdown_present(self):
        history, _ = self._make()
        result = history.build()
        all_controls = _collect_controls(result)
        dropdowns = [c for c in all_controls if type(c).__name__ == "Dropdown"]
        assert len(dropdowns) >= 1

    def test_apply_filters_button_has_click_handler(self):
        history, _ = self._make()
        result = history.build()
        clickable = _find_buttons_with_click(result)
        labels = [_get_button_label(c) for c in clickable]
        assert any("filter" in lbl.lower() or "apply" in lbl.lower() for lbl in labels)

    def test_empty_state_message_shown(self):
        history, _ = self._make()
        result = history.build()
        texts = _find_texts(result)
        assert any("no filing" in t.lower() or "start" in t.lower() for t in texts)

    def test_export_analysis_panel_present(self):
        history, _ = self._make()
        result = history.build()
        texts = _find_texts(result)
        assert any("export" in t.lower() for t in texts)

    def test_compliance_note_present(self):
        history, _ = self._make()
        result = history.build()
        texts = _find_texts(result)
        assert any("immutable" in t.lower() or "amendment" in t.lower() for t in texts)

    def test_filter_yoa_updates_state(self):
        history, _ = self._make()
        mock_event = MagicMock()
        mock_event.control.value = "2025"
        # Simulate the on_change lambda
        result = history.build()
        all_controls = _collect_controls(result)
        text_fields = [c for c in all_controls if type(c).__name__ == "TextField"]
        yoa_field = next((f for f in text_fields if "yoa" in (getattr(f, "label", "") or "").lower()), None)
        assert yoa_field is not None
        yoa_field.on_change(mock_event)
        assert history._filter_yoa == "2025"

    def test_pagination_controls_present(self):
        history, _ = self._make()
        # Add a mock filing to trigger pagination rendering
        history._filings = [MagicMock(
            status="Confirmed",
            year_of_assessment=2025,
            filing_reference="LIRS/REF/2025/00001",
            final_tax_payable=400_000.0,
            id="test-id",
        )]
        result = history.build()
        texts = _find_texts(result)
        assert any("page" in t.lower() for t in texts)


# ===========================================================================
# ConfigurationPage tests
# ===========================================================================

class TestConfigurationPage:
    def _make(self):
        from lagosfile.ui.pages.config import ConfigurationPage
        from lagosfile.services.config_engine import NTA_2025_CONFIG
        state = _AppState(active_config=NTA_2025_CONFIG)
        page = MockPage(app_state=state)
        config_page = ConfigurationPage(page)
        config_page._config = NTA_2025_CONFIG
        config_page._version_label.value = NTA_2025_CONFIG.version_label
        return config_page, page

    def test_build_returns_control(self):
        config_page, _ = self._make()
        assert config_page.build() is not None

    def test_version_label_present(self):
        config_page, _ = self._make()
        result = config_page.build()
        texts = _find_texts(result)
        assert any("nta" in t.lower() or "2025" in t for t in texts)

    def test_tax_bands_section_present(self):
        config_page, _ = self._make()
        result = config_page.build()
        texts = _find_texts(result)
        assert any("band" in t.lower() for t in texts)

    def test_relief_caps_section_present(self):
        config_page, _ = self._make()
        result = config_page.build()
        texts = _find_texts(result)
        assert any("rent relief" in t.lower() or "relief cap" in t.lower() for t in texts)

    def test_cgt_thresholds_section_present(self):
        config_page, _ = self._make()
        result = config_page.build()
        texts = _find_texts(result)
        assert any("cgt" in t.lower() for t in texts)

    def test_minimum_tax_section_present(self):
        config_page, _ = self._make()
        result = config_page.build()
        texts = _find_texts(result)
        assert any("minimum tax" in t.lower() for t in texts)

    def test_save_button_has_click_handler(self):
        config_page, _ = self._make()
        result = config_page.build()
        clickable = _find_buttons_with_click(result)
        labels = [_get_button_label(c) for c in clickable]
        assert any("save" in lbl.lower() for lbl in labels)

    def test_export_button_has_click_handler(self):
        config_page, _ = self._make()
        result = config_page.build()
        clickable = _find_buttons_with_click(result)
        labels = [_get_button_label(c) for c in clickable]
        assert any("export" in lbl.lower() for lbl in labels)

    def test_import_button_has_click_handler(self):
        config_page, _ = self._make()
        result = config_page.build()
        clickable = _find_buttons_with_click(result)
        labels = [_get_button_label(c) for c in clickable]
        assert any("import" in lbl.lower() for lbl in labels)

    def test_nta_sections_referenced(self):
        config_page, _ = self._make()
        result = config_page.build()
        texts = _find_texts(result)
        assert any("nta" in t.lower() or "schedule" in t.lower() or "section" in t.lower() for t in texts)


# ===========================================================================
# LIRSIntegrationPage tests
# ===========================================================================

class TestLIRSIntegrationPage:
    def _make(self, with_filing=False):
        from lagosfile.ui.pages.lirs_integration import LIRSIntegrationPage
        filing = None
        if with_filing:
            filing = MagicMock()
            filing.year_of_assessment = 2025
            filing.filing_reference = "LIRS/REF/2025/00001"
            filing.final_tax_payable = 400_000.0
            filing.total_income_ngn = 5_000_000.0
            filing.chargeable_income = 4_200_000.0
            filing.tax_payable = 450_000.0
            filing.wht_credit = 50_000.0
            filing.net_tax_payable = 400_000.0
            filing.minimum_tax = 50_000.0
        state = _AppState(active_filing=filing)
        page = MockPage(app_state=state)
        lirs_page = LIRSIntegrationPage(page)
        return lirs_page, page

    def test_build_returns_control(self):
        lirs_page, _ = self._make()
        assert lirs_page.build() is not None

    def test_file_with_lirs_button_present(self):
        lirs_page, _ = self._make()
        result = lirs_page.build()
        clickable = _find_buttons_with_click(result)
        labels = [_get_button_label(c) for c in clickable]
        assert any("lirs" in lbl.lower() or "file" in lbl.lower() for lbl in labels)

    def test_mark_submitted_button_present(self):
        lirs_page, _ = self._make()
        result = lirs_page.build()
        clickable = _find_buttons_with_click(result)
        labels = [_get_button_label(c) for c in clickable]
        assert any("submitted" in lbl.lower() or "mark" in lbl.lower() for lbl in labels)

    def test_portal_account_link_present(self):
        lirs_page, _ = self._make()
        result = lirs_page.build()
        texts = _find_texts(result)
        assert any("etax" in t.lower() or "portal" in t.lower() or "account" in t.lower() for t in texts)

    def test_no_fallback_banner_initially(self):
        lirs_page, _ = self._make()
        result = lirs_page.build()
        texts = _find_texts(result)
        # Fallback banner should NOT appear before any automation attempt
        assert not any("automatic form filling" in t.lower() for t in texts)

    def test_fallback_banner_shown_after_failure(self):
        from lagosfile.services.lirs_service import AutomationResult
        lirs_page, _ = self._make()
        lirs_page._automation_result = AutomationResult(success=False, fallback_active=True)
        result = lirs_page.build()
        texts = _find_texts(result)
        assert any("unavailable" in t.lower() or "reference panel" in t.lower() for t in texts)

    def test_reference_panel_shown_when_fallback_active(self):
        lirs_page, _ = self._make(with_filing=True)
        lirs_page._reference_panel_visible = True
        result = lirs_page.build()
        texts = _find_texts(result)
        assert any("reference panel" in t.lower() or "form a" in t.lower() for t in texts)

    def test_file_with_lirs_click_triggers_automation(self):
        from unittest.mock import patch
        from lagosfile.services.lirs_service import AutomationResult
        lirs_page, _ = self._make()
        with patch.object(
            lirs_page._lirs_service,
            "file_with_lirs",
            return_value=AutomationResult(success=False, fallback_active=True),
        ):
            lirs_page._on_file_with_lirs(MagicMock())
        assert lirs_page._automation_result is not None
        assert lirs_page._automation_result.fallback_active is True
        assert lirs_page._reference_panel_visible is True

    def test_filing_details_shown_when_filing_present(self):
        lirs_page, _ = self._make(with_filing=True)
        result = lirs_page.build()
        texts = _find_texts(result)
        assert any("2025" in t for t in texts)
        assert any("LIRS/REF" in t for t in texts)




