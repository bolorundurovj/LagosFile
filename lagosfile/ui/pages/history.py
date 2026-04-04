from __future__ import annotations

import flet as ft

from lagosfile.services.filing_service import FilingService
from lagosfile.ui.components.sidebar import Sidebar
from lagosfile.ui.components.topbar import TopBar

_STATUS_COLORS = {
    "Draft": ft.Colors.GREY_500,
    "Confirmed": ft.Colors.BLUE_700,
    "Submitted": ft.Colors.GREEN_700,
}


class FilingHistoryPage(ft.BaseControl):
    def __init__(self, page: ft.Page) -> None:
        super().__init__()
        self.page = page
        self._filing_service = FilingService()
        self._filings: list = []
        self._metrics = {"total": 0, "submitted": 0, "confirmed": 0, "drafts": 0}
        self._current_page = 1
        self._page_size = 20
        self._filter_yoa: str = ""
        self._filter_status: str = ""

    def build(self) -> ft.Control:
        sidebar = Sidebar(self.page, active_route="/history")
        topbar = TopBar(self.page, title="Filing History")
        content = ft.Column(
            controls=[
                topbar,
                ft.Container(
                    content=ft.Column(
                        controls=self._build_body(),
                        spacing=16,
                        scroll=ft.ScrollMode.AUTO,
                    ),
                    padding=ft.padding.all(24),
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
        return [
            self._metric_cards(),
            self._filter_bar(),
            self._filing_table(),
            self._export_analysis_panel(),
            self._compliance_note(),
        ]

    def _metric_cards(self) -> ft.Control:
        cards_data = [
            (
                "Total Filings",
                str(self._metrics["total"]),
                ft.Icons.FOLDER_OUTLINED,
                ft.Colors.BLUE_100,
                ft.Colors.BLUE_800,
            ),
            (
                "Submitted",
                str(self._metrics["submitted"]),
                ft.Icons.SEND_OUTLINED,
                ft.Colors.GREEN_100,
                ft.Colors.GREEN_800,
            ),
            (
                "Confirmed",
                str(self._metrics["confirmed"]),
                ft.Icons.VERIFIED_OUTLINED,
                ft.Colors.PURPLE_100,
                ft.Colors.PURPLE_800,
            ),
            (
                "Drafts",
                str(self._metrics["drafts"]),
                ft.Icons.EDIT_OUTLINED,
                ft.Colors.ORANGE_100,
                ft.Colors.ORANGE_800,
            ),
        ]
        cards = [
            ft.Container(
                content=ft.Column(
                    controls=[
                        ft.Container(
                            content=ft.Icon(icon, color=icon_color, size=24),
                            width=44,
                            height=44,
                            border_radius=22,
                            bgcolor=bg_color,
                            alignment=ft.alignment.center,
                        ),
                        ft.Text(
                            count,
                            size=28,
                            weight=ft.FontWeight.BOLD,
                            color=ft.Colors.GREY_800,
                        ),
                        ft.Text(label, size=12, color=ft.Colors.GREY_600),
                    ],
                    horizontal_alignment=ft.CrossAxisAlignment.CENTER,
                    spacing=6,
                ),
                padding=ft.padding.all(20),
                border_radius=10,
                bgcolor=ft.Colors.WHITE,
                shadow=ft.BoxShadow(blur_radius=6, color=ft.Colors.with_opacity(0.06, ft.Colors.BLACK)),
                expand=1,
            )
            for label, count, icon, bg_color, icon_color in cards_data
        ]
        return ft.Row(controls=cards, spacing=12)

    def _filter_bar(self) -> ft.Control:
        yoa_field = ft.TextField(
            label="Filter by YOA",
            width=140,
            on_change=lambda e: setattr(self, "_filter_yoa", e.control.value),
        )
        status_dd = ft.Dropdown(
            label="Filter by Status",
            width=180,
            options=[
                ft.dropdown.Option(""),
                ft.dropdown.Option("Draft"),
                ft.dropdown.Option("Confirmed"),
                ft.dropdown.Option("Submitted"),
            ],
            on_change=lambda e: setattr(self, "_filter_status", e.control.value or ""),
        )
        apply_btn = ft.ElevatedButton(
            "Apply Filters",
            icon=ft.Icons.FILTER_LIST,
            on_click=self._apply_filters,
        )
        return ft.Row(
            controls=[yoa_field, status_dd, apply_btn],
            spacing=12,
            vertical_alignment=ft.CrossAxisAlignment.END,
        )

    def _filing_table(self) -> ft.Control:
        columns = [
            ft.DataColumn(ft.Text("YOA", size=12, weight=ft.FontWeight.BOLD)),
            ft.DataColumn(ft.Text("Reference", size=12, weight=ft.FontWeight.BOLD)),
            ft.DataColumn(ft.Text("Status", size=12, weight=ft.FontWeight.BOLD)),
            ft.DataColumn(ft.Text("Tax Payable", size=12, weight=ft.FontWeight.BOLD), numeric=True),
            ft.DataColumn(ft.Text("Actions", size=12, weight=ft.FontWeight.BOLD)),
        ]
        if not self._filings:
            return ft.Container(
                content=ft.Column(
                    controls=[
                        ft.DataTable(columns=columns, rows=[]),
                        ft.Container(
                            content=ft.Text(
                                "No filings found. Start your first filing from the Dashboard.",
                                size=13,
                                color=ft.Colors.GREY_500,
                                italic=True,
                            ),
                            padding=ft.padding.symmetric(vertical=24),
                            alignment=ft.alignment.center,
                        ),
                    ],
                    spacing=0,
                ),
                border_radius=10,
                bgcolor=ft.Colors.WHITE,
                border=ft.border.all(1, ft.Colors.GREY_200),
                padding=ft.padding.all(16),
            )
        rows = [self._filing_row(f) for f in self._filings]
        return ft.Container(
            content=ft.Column(
                controls=[
                    ft.DataTable(
                        columns=columns,
                        rows=rows,
                        border=ft.border.all(1, ft.Colors.GREY_200),
                        border_radius=8,
                        heading_row_color=ft.Colors.GREY_50,
                    ),
                    self._pagination_controls(),
                ],
                spacing=12,
            ),
            padding=ft.padding.all(16),
            border_radius=10,
            bgcolor=ft.Colors.WHITE,
            border=ft.border.all(1, ft.Colors.GREY_200),
        )

    def _filing_row(self, filing) -> ft.DataRow:
        status = getattr(filing, "status", "Draft")
        status_color = _STATUS_COLORS.get(status, ft.Colors.GREY_500)
        tax_payable = getattr(filing, "final_tax_payable", None)
        yoa = getattr(filing, "year_of_assessment", "—")
        ref = getattr(filing, "filing_reference", "—") or "—"
        actions = []
        if status in ("Confirmed", "Submitted"):
            actions.append(
                ft.IconButton(
                    ft.Icons.VISIBILITY_OUTLINED,
                    tooltip="View",
                    icon_size=18,
                    on_click=lambda e, f=filing: self._view_filing(f),
                )
            )
            actions.append(
                ft.IconButton(
                    ft.Icons.COPY_OUTLINED,
                    tooltip="Duplicate",
                    icon_size=18,
                    on_click=lambda e, f=filing: self._duplicate_filing(f),
                )
            )
            actions.append(
                ft.IconButton(
                    ft.Icons.PICTURE_AS_PDF_OUTLINED,
                    tooltip="Export PDF",
                    icon_size=18,
                    on_click=lambda e, f=filing: self._export_pdf(f),
                )
            )
            actions.append(
                ft.IconButton(
                    ft.Icons.TABLE_CHART_OUTLINED,
                    tooltip="Export CSV",
                    icon_size=18,
                    on_click=lambda e, f=filing: self._export_csv(f),
                )
            )
        else:
            actions.append(
                ft.IconButton(
                    ft.Icons.EDIT_OUTLINED,
                    tooltip="Edit Draft",
                    icon_size=18,
                    on_click=lambda e, f=filing: self._edit_draft(f),
                )
            )
            actions.append(
                ft.IconButton(
                    ft.Icons.DELETE_OUTLINE,
                    tooltip="Delete Draft",
                    icon_size=18,
                    icon_color=ft.Colors.RED_400,
                    on_click=lambda e, f=filing: self._delete_draft(f),
                )
            )
        return ft.DataRow(
            cells=[
                ft.DataCell(ft.Text(str(yoa), size=12)),
                ft.DataCell(ft.Text(ref, size=12)),
                ft.DataCell(
                    ft.Container(
                        content=ft.Text(status, size=11, color=ft.Colors.WHITE),
                        bgcolor=status_color,
                        border_radius=4,
                        padding=ft.padding.symmetric(horizontal=8, vertical=3),
                    )
                ),
                ft.DataCell(
                    ft.Text(
                        f"₦{tax_payable:,.2f}" if tax_payable is not None else "—",
                        size=12,
                    )
                ),
                ft.DataCell(ft.Row(controls=actions, spacing=0)),
            ]
        )

    def _pagination_controls(self) -> ft.Control:
        return ft.Row(
            controls=[
                ft.IconButton(
                    ft.Icons.CHEVRON_LEFT,
                    disabled=self._current_page <= 1,
                    on_click=lambda e: self._change_page(-1),
                ),
                ft.Text(f"Page {self._current_page}", size=13),
                ft.IconButton(
                    ft.Icons.CHEVRON_RIGHT,
                    on_click=lambda e: self._change_page(1),
                ),
            ],
            alignment=ft.MainAxisAlignment.CENTER,
        )

    def _export_analysis_panel(self) -> ft.Control:
        return ft.Container(
            content=ft.Column(
                controls=[
                    ft.Text("Export Analysis", size=14, weight=ft.FontWeight.W_600),
                    ft.Text(
                        "Select a confirmed filing from the table above to export as PDF, CSV, or JSON.",
                        size=12,
                        color=ft.Colors.GREY_600,
                    ),
                ],
                spacing=6,
            ),
            padding=ft.padding.all(16),
            border_radius=8,
            bgcolor=ft.Colors.WHITE,
            border=ft.border.all(1, ft.Colors.GREY_200),
        )

    def _compliance_note(self) -> ft.Control:
        return ft.Container(
            content=ft.Row(
                controls=[
                    ft.Icon(ft.Icons.SHIELD_OUTLINED, color=ft.Colors.BLUE_700, size=16),
                    ft.Text(
                        "All confirmed filings are immutable records. Amendments create new linked filings.",
                        size=12,
                        color=ft.Colors.BLUE_900,
                    ),
                ],
                spacing=8,
            ),
            padding=ft.padding.symmetric(horizontal=14, vertical=10),
            border_radius=6,
            bgcolor=ft.Colors.BLUE_50,
            border=ft.border.all(1, ft.Colors.BLUE_100),
        )

    async def _apply_filters(self, e) -> None:
        app_state = self.page.data
        if not app_state or not app_state.taxpayer:
            return
        filters = {}
        if self._filter_yoa:
            try:
                filters["yoa"] = int(self._filter_yoa)
            except ValueError:
                pass
        if self._filter_status:
            filters["status"] = self._filter_status
        try:
            result = await self._filing_service.list_filings(
                str(app_state.taxpayer.id),
                page=self._current_page,
                page_size=self._page_size,
                filters=filters,
            )
            self._filings = result["filings"]
            self._metrics = result["metrics"]
        except Exception:
            pass
        self.update()

    def _change_page(self, delta: int) -> None:
        self._current_page = max(1, self._current_page + delta)
        self.update()

    def _view_filing(self, filing) -> None:
        self.page.go(f"/history/{filing.id}")

    async def _duplicate_filing(self, filing) -> None:
        try:
            await self._filing_service.duplicate(str(filing.id))
            self.update()
        except Exception:
            pass

    def _export_pdf(self, filing) -> None:
        pass

    def _export_csv(self, filing) -> None:
        pass

    def _edit_draft(self, filing) -> None:
        app_state = self.page.data
        if app_state:
            app_state.active_filing = filing
        self.page.go(f"/wizard/{filing.id}")

    def _delete_draft(self, filing) -> None:
        pass
