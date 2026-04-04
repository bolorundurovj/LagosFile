from __future__ import annotations

import datetime

import flet as ft

from lagosfile.ui.components.sidebar import Sidebar
from lagosfile.ui.components.topbar import TopBar
from lagosfile.utils.deadline import days_until_deadline

_STATUS_COLORS = {
    "Draft": ft.Colors.GREY_500,
    "Confirmed": ft.Colors.BLUE_700,
    "Submitted": ft.Colors.GREEN_700,
}


class DashboardPage(ft.BaseControl):
    def __init__(self, page: ft.Page) -> None:
        super().__init__()
        self.page = page
        self._filings: list = []
        self._lifetime_total: float = 0.0

    def build(self) -> ft.Control:
        sidebar = Sidebar(self.page, active_route="/dashboard")
        topbar = TopBar(self.page, title="Dashboard")
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
        controls: list[ft.Control] = []
        today = datetime.date.today()
        days_left = days_until_deadline(today, today.year)
        if days_left is not None:
            controls.append(self._deadline_banner(days_left))
        controls.extend(self._missing_filing_warnings())
        controls.append(self._start_filing_cta())
        controls.append(self._filing_history_section())
        controls.append(self._quick_access_cards())
        controls.append(self._lifetime_footer())
        return controls

    def _deadline_banner(self, days_left: int) -> ft.Control:
        return ft.Container(
            content=ft.Row(
                controls=[
                    ft.Icon(
                        ft.Icons.WARNING_AMBER_ROUNDED,
                        color=ft.Colors.ORANGE_800,
                        size=20,
                    ),
                    ft.Text(
                        f"Filing deadline in {days_left} day{'s' if days_left != 1 else ''} — March 31",
                        size=14,
                        color=ft.Colors.ORANGE_900,
                        weight=ft.FontWeight.W_500,
                    ),
                ],
                spacing=10,
            ),
            padding=ft.padding.symmetric(horizontal=16, vertical=12),
            border_radius=8,
            bgcolor=ft.Colors.ORANGE_50,
            border=ft.border.all(1, ft.Colors.ORANGE_200),
        )

    def _missing_filing_warnings(self) -> list[ft.Control]:
        warnings = []
        today = datetime.date.today()
        current_yoa = today.year
        prior_yoa = current_yoa - 1
        for yoa in [current_yoa, prior_yoa]:
            warnings.append(
                ft.Container(
                    content=ft.Row(
                        controls=[
                            ft.Icon(ft.Icons.INFO_OUTLINE, color=ft.Colors.BLUE_700, size=18),
                            ft.Text(
                                f"No confirmed filing found for YOA {yoa}.",
                                size=13,
                                color=ft.Colors.BLUE_900,
                            ),
                            ft.TextButton(
                                "Start Filing",
                                on_click=lambda e: self.page.go("/wizard"),
                            ),
                        ],
                        spacing=8,
                    ),
                    padding=ft.padding.symmetric(horizontal=14, vertical=10),
                    border_radius=8,
                    bgcolor=ft.Colors.BLUE_50,
                    border=ft.border.all(1, ft.Colors.BLUE_100),
                )
            )
        return warnings

    def _start_filing_cta(self) -> ft.Control:
        return ft.ElevatedButton(
            content=ft.Row(
                controls=[
                    ft.Icon(ft.Icons.ADD_CIRCLE_OUTLINE, color=ft.Colors.WHITE),
                    ft.Text(
                        "Start New Filing",
                        color=ft.Colors.WHITE,
                        size=14,
                        weight=ft.FontWeight.W_500,
                    ),
                ],
                spacing=8,
            ),
            style=ft.ButtonStyle(
                bgcolor=ft.Colors.BLUE_800,
                padding=ft.padding.symmetric(horizontal=20, vertical=14),
                shape=ft.RoundedRectangleBorder(radius=8),
            ),
            on_click=lambda e: self.page.go("/wizard"),
        )

    def _filing_history_section(self) -> ft.Control:
        header = ft.Row(
            controls=[
                ft.Text(
                    "YOA",
                    size=12,
                    weight=ft.FontWeight.BOLD,
                    color=ft.Colors.GREY_600,
                    expand=1,
                ),
                ft.Text(
                    "Reference",
                    size=12,
                    weight=ft.FontWeight.BOLD,
                    color=ft.Colors.GREY_600,
                    expand=2,
                ),
                ft.Text(
                    "Status",
                    size=12,
                    weight=ft.FontWeight.BOLD,
                    color=ft.Colors.GREY_600,
                    expand=1,
                ),
                ft.Text(
                    "Tax Payable",
                    size=12,
                    weight=ft.FontWeight.BOLD,
                    color=ft.Colors.GREY_600,
                    expand=2,
                ),
                ft.Text(
                    "Actions",
                    size=12,
                    weight=ft.FontWeight.BOLD,
                    color=ft.Colors.GREY_600,
                    expand=2,
                ),
            ],
        )
        empty_row = ft.Container(
            content=ft.Text(
                "No filings yet. Start your first filing above.",
                size=13,
                color=ft.Colors.GREY_500,
                italic=True,
            ),
            padding=ft.padding.symmetric(vertical=20),
            alignment=ft.alignment.center,
        )
        return ft.Container(
            content=ft.Column(
                controls=[
                    ft.Text("Recent Filings", size=16, weight=ft.FontWeight.W_600),
                    ft.Divider(height=1, color=ft.Colors.GREY_200),
                    header,
                    ft.Divider(height=1, color=ft.Colors.GREY_100),
                    empty_row,
                ],
                spacing=8,
            ),
            padding=ft.padding.all(20),
            border_radius=10,
            bgcolor=ft.Colors.WHITE,
            shadow=ft.BoxShadow(
                blur_radius=6,
                color=ft.Colors.with_opacity(0.06, ft.Colors.BLACK),
            ),
        )

    def _quick_access_cards(self) -> ft.Control:
        cards_data = [
            (
                "Tax Receipts",
                ft.Icons.RECEIPT_OUTLINED,
                ft.Colors.PURPLE_100,
                ft.Colors.PURPLE_800,
            ),
            (
                "Tax Calculator",
                ft.Icons.CALCULATE_OUTLINED,
                ft.Colors.GREEN_100,
                ft.Colors.GREEN_800,
            ),
            (
                "Compliance Status",
                ft.Icons.VERIFIED_OUTLINED,
                ft.Colors.BLUE_100,
                ft.Colors.BLUE_800,
            ),
            (
                "Help & Guides",
                ft.Icons.MENU_BOOK_OUTLINED,
                ft.Colors.ORANGE_100,
                ft.Colors.ORANGE_800,
            ),
        ]
        cards = [
            ft.Container(
                content=ft.Column(
                    controls=[
                        ft.Container(
                            content=ft.Icon(icon, color=icon_color, size=28),
                            width=52,
                            height=52,
                            border_radius=26,
                            bgcolor=bg_color,
                            alignment=ft.alignment.center,
                        ),
                        ft.Text(
                            label,
                            size=13,
                            weight=ft.FontWeight.W_500,
                            color=ft.Colors.GREY_800,
                        ),
                    ],
                    horizontal_alignment=ft.CrossAxisAlignment.CENTER,
                    spacing=10,
                ),
                padding=ft.padding.all(20),
                border_radius=10,
                bgcolor=ft.Colors.WHITE,
                shadow=ft.BoxShadow(
                    blur_radius=6,
                    color=ft.Colors.with_opacity(0.06, ft.Colors.BLACK),
                ),
                expand=1,
                ink=True,
                on_click=lambda e: None,
            )
            for label, icon, bg_color, icon_color in cards_data
        ]
        return ft.Column(
            controls=[
                ft.Text("Quick Access", size=16, weight=ft.FontWeight.W_600),
                ft.Row(controls=cards, spacing=12),
            ],
            spacing=12,
        )

    def _lifetime_footer(self) -> ft.Control:
        return ft.Container(
            content=ft.Row(
                controls=[
                    ft.Icon(
                        ft.Icons.ACCOUNT_BALANCE_OUTLINED,
                        color=ft.Colors.GREY_500,
                        size=18,
                    ),
                    ft.Text(
                        f"Lifetime total tax filed: ₦{self._lifetime_total:,.2f}",
                        size=13,
                        color=ft.Colors.GREY_600,
                    ),
                ],
                spacing=8,
            ),
            padding=ft.padding.symmetric(horizontal=16, vertical=12),
            border_radius=8,
            bgcolor=ft.Colors.GREY_50,
            border=ft.border.all(1, ft.Colors.GREY_200),
        )
