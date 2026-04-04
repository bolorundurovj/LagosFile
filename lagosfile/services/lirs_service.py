"""
LIRS Portal Integration Service.

Attempts Playwright automation to pre-fill Form A on etax.lirs.gov.ng.
Falls back to Reference Panel mode on any failure.

Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8
"""

from __future__ import annotations

import webbrowser
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from lagosfile.constants import Constants

LIRS_PORTAL_URL = "https://etax.lirs.gov.ng"


@dataclass
class AutomationResult:
    """Result returned by LIRSService.file_with_lirs()."""
    success: bool
    fallback_active: bool = False
    error_message: Optional[str] = None


class LIRSService:
    """Handles LIRS e-Tax portal integration via Playwright automation."""

    def file_with_lirs(self, filing_data: dict) -> AutomationResult:
        """Attempt to pre-fill Form A on the LIRS e-Tax portal.

        Launches a Chromium browser, navigates to etax.lirs.gov.ng, waits up
        to 2 minutes for the user to log in, then pre-fills Form A fields.

        On ANY exception, falls back to Reference Panel mode:
        - Opens the portal in the system default browser
        - Logs the failure to ~/LagosFile/errors.log
        - Returns AutomationResult(success=False, fallback_active=True)

        Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7
        """
        try:
            from playwright.sync_api import sync_playwright  # type: ignore[import]

            with sync_playwright() as p:
                browser = p.chromium.launch(headless=False)
                page = browser.new_page()
                page.goto(LIRS_PORTAL_URL)

                # Wait for user to log in — up to 2 minutes
                page.wait_for_selector("#form-a-section", timeout=120_000)

                # Pre-fill Form A fields
                self._fill_form_a(page, filing_data)

                browser.close()
                return AutomationResult(success=True)

        except Exception as exc:
            error_msg = f"{type(exc).__name__}: {exc}"
            self._log_error("LIRS automation failed", error_msg)
            webbrowser.open(LIRS_PORTAL_URL)
            return AutomationResult(
                success=False,
                fallback_active=True,
                error_message=error_msg,
            )

    def _fill_form_a(self, page, filing_data: dict) -> None:
        """Pre-fill Form A fields from filing_data computed values."""
        field_map = {
            "#total-income": filing_data.get("total_income_ngn"),
            "#chargeable-income": filing_data.get("chargeable_income"),
            "#tax-payable": filing_data.get("final_tax_payable"),
        }
        for selector, value in field_map.items():
            if value is not None:
                try:
                    page.fill(selector, f"{value:,.2f}")
                except Exception:
                    pass  # Best-effort; don't abort on individual field failures

    def get_reference_panel_data(self, filing_data: dict) -> dict:
        """Return a dict mapping Form A section names to computed values.

        Used to populate the Reference Panel when automation is unavailable.

        Requirements: 12.4, 12.5
        """
        return {
            "Total Income (NGN)": filing_data.get("total_income_ngn"),
            "Chargeable Income": filing_data.get("chargeable_income"),
            "Tax Payable (Graduated)": filing_data.get("tax_payable"),
            "WHT Credits": filing_data.get("wht_credit"),
            "Net Tax Payable": filing_data.get("net_tax_payable"),
            "Minimum Tax (1%)": filing_data.get("minimum_tax"),
            "Final Tax Payable": filing_data.get("final_tax_payable"),
            "Filing Reference": filing_data.get("filing_reference"),
            "Year of Assessment": filing_data.get("year_of_assessment"),
            "Taxpayer Name": filing_data.get("taxpayer_name"),
            "TIN": filing_data.get("tin"),
        }

    def _log_error(self, context: str, message: str) -> None:
        """Append an error entry to ~/LagosFile/errors.log."""
        try:
            Constants.ensure_dirs()
            timestamp = datetime.now(timezone.utc).isoformat()
            entry = f"[{timestamp}] {context}: {message}\n"
            Constants.ERROR_LOG.open("a", encoding="utf-8").write(entry)
        except Exception:
            pass  # Never fail the caller due to logging errors
