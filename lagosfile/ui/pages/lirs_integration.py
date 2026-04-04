"""
LIRS Integration UI helpers.

Provides the "File with LIRS" button, Reference Panel (docked), fallback
banner, and "Mark as Submitted" button for confirmed filings.

Requirements: 12.1, 12.2, 12.4, 12.5, 12.7, 12.8
"""

from __future__ import annotations

import flet as ft

from lagosfile.ui.components.sidebar import Sidebar
from lagosfile.ui.components.topbar import TopBar
from lagosfile.services.lirs_service import LIRSService, AutomationResult
from lagosfile.services.filing_service import FilingService


_FALLBACK_BANNER = (
    "Automatic form filling is currently unavailable. "
    "Use the reference panel alongside the portal to complete your filing."
)

_LIRS_PORTAL_URL = "https://etax.lirs.gov.ng"
_LIRS_ACCOUNT_URL = "https://etax.lirs.gov.ng/register"


class LIRSIntegrationPage(ft.Container):
    """LIRS portal integration page for confirmed filings.

    Requirements: 12.1, 12.2, 12.4, 12.5, 12.7, 12.8
    """

    def __init__(self, page: ft.Page) -> None:
        super().__init__()
        self._page = page
        self.expand = True
        self._lirs_service = LIRSService()
        self._filing_service = FilingService()
        self._automation_result: AutomationResult | None = None
        self._loading = ft.ProgressRing(visible=False, width=24, height=24)
        self._status_text = ft.Text("", size=13)
        self._reference_panel_visible = False
        self.content = self.build()

    def build(self) -> ft.Control:
        sidebar = Sidebar(self._page, active_route="/history")
        topbar = TopBar(self._page, title="File with LIRS")

        content = ft.Column(
            controls=[
                topbar,
                ft.Container(
                    content=ft.Column(
                        controls=self._build_body(),
                        spacing=16,
                        scroll=ft.ScrollMode.AUTO,
                    ),
                    padding=ft.Padding.all(24),
                    expand=True,
                ),
            ],
            expand=True,
            spacing=0,
        )

        return ft.Row(
            controls=[sidebar, content],
            expand=True,
            spacing=0,
        )

    def _build_body(self) -> list[ft.Control]:
        controls: list[ft.Control] = []

        # Fallback banner (shown when automation fails) (Req 12.5)
        if self._automation_result and not self._automation_result.success:
            controls.append(self._fallback_banner())

        # Filing info card
        controls.append(self._filing_info_card())

        # File with LIRS button (Req 12.1)
        controls.append(self._file_with_lirs_section())

        # Reference Panel (docked, shown when fallback active) (Req 12.4)
        if self._reference_panel_visible:
            controls.append(self._reference_panel())

        # Mark as Submitted button (Req 12.8)
        controls.append(self._mark_submitted_section())

        controls.append(self._status_text)

        return controls

    def _fallback_banner(self) -> ft.Control:
        return ft.Container(
            content=ft.Row(
                controls=[
                    ft.Icon(
                        ft.Icons.WARNING_AMBER_ROUNDED,
                        color=ft.Colors.ORANGE_800,
                        size=20,
                    ),
                    ft.Text(
                        _FALLBACK_BANNER,
                        size=13,
                        color=ft.Colors.ORANGE_900,
                        expand=True,
                    ),
                ],
                spacing=10,
            ),
            padding=ft.Padding.symmetric(horizontal=16, vertical=12),
            border_radius=8,
            bgcolor=ft.Colors.ORANGE_50,
            border=ft.Border.all(1, ft.Colors.ORANGE_200),
        )

    def _filing_info_card(self) -> ft.Control:
        app_state = self._page.data
        filing = app_state.active_filing if app_state else None

        yoa = getattr(filing, "year_of_assessment", "—") if filing else "—"
        ref = getattr(filing, "filing_reference", "—") if filing else "—"
        tax = getattr(filing, "final_tax_payable", None) if filing else None

        return ft.Container(
            content=ft.Column(
                controls=[
                    ft.Text("Filing Details", size=14, weight=ft.FontWeight.W_600),
                    ft.Row(
                        controls=[
                            ft.Text(
                                "Year of Assessment:",
                                size=12,
                                color=ft.Colors.GREY_600,
                                expand=1,
                            ),
                            ft.Text(
                                str(yoa), size=12, weight=ft.FontWeight.W_500, expand=2
                            ),
                        ]
                    ),
                    ft.Row(
                        controls=[
                            ft.Text(
                                "Filing Reference:",
                                size=12,
                                color=ft.Colors.GREY_600,
                                expand=1,
                            ),
                            ft.Text(
                                str(ref), size=12, weight=ft.FontWeight.W_500, expand=2
                            ),
                        ]
                    ),
                    ft.Row(
                        controls=[
                            ft.Text(
                                "Final Tax Payable:",
                                size=12,
                                color=ft.Colors.GREY_600,
                                expand=1,
                            ),
                            ft.Text(
                                f"₦{tax:,.2f}" if tax is not None else "—",
                                size=12,
                                weight=ft.FontWeight.W_500,
                                expand=2,
                            ),
                        ]
                    ),
                ],
                spacing=8,
            ),
            padding=ft.Padding.all(16),
            border_radius=10,
            bgcolor=ft.Colors.WHITE,
            border=ft.Border.all(1, ft.Colors.GREY_200),
        )

    def _file_with_lirs_section(self) -> ft.Control:
        return ft.Container(
            content=ft.Column(
                controls=[
                    ft.Text(
                        "Submit to LIRS e-Tax Portal",
                        size=14,
                        weight=ft.FontWeight.W_600,
                    ),
                    ft.Text(
                        "This will attempt to pre-fill Form A on the LIRS portal using Playwright automation. "
                        "If automation fails, a Reference Panel will appear alongside the portal.",
                        size=12,
                        color=ft.Colors.GREY_600,
                    ),
                    # Link to create portal account (Req 12.2)
                    ft.Row(
                        controls=[
                            ft.Text(
                                "Don't have a portal account?",
                                size=12,
                                color=ft.Colors.GREY_600,
                            ),
                            ft.TextButton(
                                "Create one at etax.lirs.gov.ng",
                                url=_LIRS_ACCOUNT_URL,
                            ),
                        ],
                        spacing=4,
                    ),
                    ft.Row(
                        controls=[
                            ft.Button(
                                "File with LIRS",
                                icon=ft.Icons.SEND_OUTLINED,
                                style=ft.ButtonStyle(
                                    bgcolor=ft.Colors.BLUE_800, color=ft.Colors.WHITE
                                ),
                                on_click=self._on_file_with_lirs,
                            ),
                            self._loading,
                        ],
                        spacing=12,
                    ),
                ],
                spacing=10,
            ),
            padding=ft.Padding.all(16),
            border_radius=10,
            bgcolor=ft.Colors.WHITE,
            border=ft.Border.all(1, ft.Colors.GREY_200),
        )

    def _reference_panel(self) -> ft.Control:
        """Docked Reference Panel showing all computed values labelled to Form A sections."""
        app_state = self._page.data
        filing = app_state.active_filing if app_state else None

        filing_data = {}
        if filing:
            filing_data = {
                "total_income_ngn": getattr(filing, "total_income_ngn", None),
                "chargeable_income": getattr(filing, "chargeable_income", None),
                "tax_payable": getattr(filing, "tax_payable", None),
                "wht_credit": getattr(filing, "wht_credit", None),
                "net_tax_payable": getattr(filing, "net_tax_payable", None),
                "minimum_tax": getattr(filing, "minimum_tax", None),
                "final_tax_payable": getattr(filing, "final_tax_payable", None),
                "filing_reference": getattr(filing, "filing_reference", None),
                "year_of_assessment": getattr(filing, "year_of_assessment", None),
            }

        ref_data = self._lirs_service.get_reference_panel_data(filing_data)

        rows = [
            ft.Row(
                controls=[
                    ft.Text(label, size=12, color=ft.Colors.GREY_600, expand=2),
                    ft.Text(
                        f"₦{value:,.2f}"
                        if isinstance(value, (int, float)) and value is not None
                        else str(value or "—"),
                        size=12,
                        weight=ft.FontWeight.W_500,
                        expand=1,
                        text_align=ft.TextAlign.RIGHT,
                    ),
                ],
            )
            for label, value in ref_data.items()
        ]

        return ft.Container(
            content=ft.Column(
                controls=[
                    ft.Row(
                        controls=[
                            ft.Icon(
                                ft.Icons.TABLE_VIEW_OUTLINED,
                                color=ft.Colors.BLUE_700,
                                size=18,
                            ),
                            ft.Text(
                                "Reference Panel — Form A Values",
                                size=14,
                                weight=ft.FontWeight.W_600,
                                color=ft.Colors.BLUE_900,
                            ),
                            ft.Container(expand=True),
                            ft.TextButton(
                                "Open LIRS Portal",
                                url=_LIRS_PORTAL_URL,
                                icon=ft.Icons.OPEN_IN_NEW,
                            ),
                        ],
                        spacing=8,
                    ),
                    ft.Divider(height=8),
                    *rows,
                    ft.Text(
                        "Use these values to manually complete Form A on the LIRS portal.",
                        size=11,
                        color=ft.Colors.GREY_500,
                        italic=True,
                    ),
                ],
                spacing=8,
            ),
            padding=ft.Padding.all(16),
            border_radius=10,
            bgcolor=ft.Colors.BLUE_50,
            border=ft.Border.all(1, ft.Colors.BLUE_200),
        )

    def _mark_submitted_section(self) -> ft.Control:
        return ft.Container(
            content=ft.Column(
                controls=[
                    ft.Text("Mark as Submitted", size=14, weight=ft.FontWeight.W_600),
                    ft.Text(
                        "Once you have completed filing on the LIRS portal, mark this filing as Submitted.",
                        size=12,
                        color=ft.Colors.GREY_600,
                    ),
                    ft.Button(
                        "Mark as Submitted",
                        icon=ft.Icons.CHECK_CIRCLE_OUTLINE,
                        style=ft.ButtonStyle(
                            bgcolor=ft.Colors.GREEN_700, color=ft.Colors.WHITE
                        ),
                        on_click=self._on_mark_submitted,
                    ),
                ],
                spacing=10,
            ),
            padding=ft.Padding.all(16),
            border_radius=10,
            bgcolor=ft.Colors.WHITE,
            border=ft.Border.all(1, ft.Colors.GREY_200),
        )

    def _on_file_with_lirs(self, e) -> None:
        """Attempt Playwright automation; fall back to Reference Panel on failure."""
        app_state = self._page.data
        filing = app_state.active_filing if app_state else None

        self._loading.visible = True
        self._page.update()

        filing_data = {}
        if filing:
            filing_data = {
                "total_income_ngn": getattr(filing, "total_income_ngn", None),
                "chargeable_income": getattr(filing, "chargeable_income", None),
                "final_tax_payable": getattr(filing, "final_tax_payable", None),
                "filing_reference": getattr(filing, "filing_reference", None),
                "year_of_assessment": getattr(filing, "year_of_assessment", None),
            }

        result = self._lirs_service.file_with_lirs(filing_data)
        self._automation_result = result

        if not result.success:
            # Activate Reference Panel (Req 12.4, 12.7)
            self._reference_panel_visible = True
            self._status_text.value = _FALLBACK_BANNER
            self._status_text.color = ft.Colors.ORANGE_800
        else:
            self._status_text.value = "Automation completed successfully."
            self._status_text.color = ft.Colors.GREEN_700

        self._loading.visible = False
        self._page.update()

    async def _on_mark_submitted(self, e) -> None:
        """Mark the active filing as Submitted."""
        app_state = self._page.data
        if not app_state or not app_state.active_filing:
            return
        try:
            await self._filing_service.mark_submitted(str(app_state.active_filing.id))
            app_state.active_filing.status = "Submitted"
            self._status_text.value = "Filing marked as Submitted."
            self._status_text.color = ft.Colors.GREEN_700
        except Exception as exc:
            self._status_text.value = f"Error: {exc}"
            self._status_text.color = ft.Colors.RED_400
        self._page.update()






