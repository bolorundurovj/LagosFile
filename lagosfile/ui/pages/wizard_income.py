"""
Wizard Step 1 — Income Sources UI.

Renders income category cards for all NTA 2025 income types, a Foreign
Income section with FX rate resolution, and document attachment zones.

Requirements: 4.1, 4.2, 4.3, 5.1, 5.2, 5.3, 5.4, 5.8
"""

from __future__ import annotations

import flet as ft


# All supported Nigerian income types (Req 4.1)
_INCOME_TYPES = [
    ("Employment", ft.Icons.WORK_OUTLINE, "Salary, bonuses, benefits-in-kind"),
    ("Business/Trade", ft.Icons.STORE_OUTLINED, "Self-employment, sole trader income"),
    ("Rental", ft.Icons.HOME_OUTLINED, "Rental income from property"),
    ("Dividend", ft.Icons.TRENDING_UP, "Dividend income from investments"),
    (
        "Interest",
        ft.Icons.SAVINGS_OUTLINED,
        "Interest income, FX differences on securities",
    ),
    ("Capital Gains", ft.Icons.SHOW_CHART, "Gains from disposal of assets"),
    ("Digital Assets", ft.Icons.CURRENCY_BITCOIN, "Digital/virtual asset gains"),
    ("Royalties", ft.Icons.MUSIC_NOTE_OUTLINED, "Royalty income"),
    ("Prizes/Winnings", ft.Icons.EMOJI_EVENTS_OUTLINED, "Prizes, honoraria, grants"),
    ("Other", ft.Icons.MORE_HORIZ, "Other income (free-text)"),
]

_CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CHF", "CNY", "Other"]

_FX_COMPLIANCE_NOTICE = (
    "Section 20(4) NTA 2025 requires conversion at the CBN official rate. "
    "The rate fetched above is a market-rate proxy. Enter the CBN official rate "
    "in the override field for full compliance. Check the CBN website for the official rate."
)


class IncomeSourcesStep(ft.Container):
    """Step 1 of the filing wizard — Income Sources.

    Requirements: 4.1, 4.2, 4.3, 5.1, 5.2, 5.3, 5.4, 5.8
    """

    def __init__(self, page: ft.Page) -> None:
        super().__init__()
        self._page = page
        self.expand = True
        self._entries: list[dict] = []
        self.content = self.build()

    def build(self) -> ft.Control:
        return ft.Column(
            controls=[
                ft.Text(
                    "Step 1: Income Sources",
                    size=20,
                    weight=ft.FontWeight.BOLD,
                    color=ft.Colors.GREY_800,
                ),
                ft.Text(
                    "Add all income sources for the Year of Assessment. "
                    "You can add multiple entries per category.",
                    size=13,
                    color=ft.Colors.GREY_600,
                ),
                ft.Divider(height=16, color=ft.Colors.TRANSPARENT),
                # Nigerian income categories
                ft.Text("Nigerian Income", size=15, weight=ft.FontWeight.W_600),
                ft.GridView(
                    controls=[
                        self._income_category_card(label, icon, hint)
                        for label, icon, hint in _INCOME_TYPES
                    ],
                    runs_count=2,
                    max_extent=320,
                    child_aspect_ratio=3.5,
                    spacing=10,
                    run_spacing=10,
                ),
                ft.Divider(height=16),
                # Foreign income section (Req 5.1)
                ft.Text("Foreign Currency Income", size=15, weight=ft.FontWeight.W_600),
                ft.Text(
                    "Flag any income received in a foreign currency for automatic CBN-rate conversion.",
                    size=12,
                    color=ft.Colors.GREY_600,
                ),
                self._foreign_income_form(),
                ft.Divider(height=16, color=ft.Colors.TRANSPARENT),
                # Document attachment zone
                ft.Text("Supporting Documents", size=15, weight=ft.FontWeight.W_600),
                self._document_attachment_zone(),
            ],
            spacing=12,
            scroll=ft.ScrollMode.AUTO,
        )

    def _income_category_card(self, label: str, icon: str, hint: str) -> ft.Control:
        return ft.Container(
            content=ft.Row(
                controls=[
                    ft.Icon(icon, color=ft.Colors.BLUE_700, size=22),
                    ft.Column(
                        controls=[
                            ft.Text(label, size=13, weight=ft.FontWeight.W_500),
                            ft.Text(hint, size=10, color=ft.Colors.GREY_500),
                        ],
                        spacing=2,
                        expand=True,
                    ),
                    ft.IconButton(
                        ft.Icons.ADD_CIRCLE_OUTLINE,
                        icon_color=ft.Colors.BLUE_700,
                        tooltip=f"Add {label} entry",
                        on_click=lambda e, lbl=label: self._add_income_entry(lbl),
                    ),
                ],
                spacing=10,
                vertical_alignment=ft.CrossAxisAlignment.CENTER,
            ),
            padding=ft.Padding.symmetric(horizontal=14, vertical=10),
            border_radius=8,
            bgcolor=ft.Colors.WHITE,
            border=ft.Border.all(1, ft.Colors.GREY_200),
            ink=True,
        )

    def _foreign_income_form(self) -> ft.Control:
        currency_dropdown = ft.Dropdown(
            label="Source Currency",
            options=[ft.dropdown.Option(c) for c in _CURRENCIES],
            width=160,
        )
        amount_field = ft.TextField(
            label="Amount in Foreign Currency",
            width=200,
            keyboard_type=ft.KeyboardType.NUMBER,
        )
        date_field = ft.TextField(label="Date of Receipt (YYYY-MM-DD)", width=200)
        fetched_rate_field = ft.TextField(
            label="Fetched Rate (auto)",
            width=160,
            read_only=True,
            hint_text="Fetched automatically",
            bgcolor=ft.Colors.GREY_100,
        )
        cbn_override_field = ft.TextField(
            label="CBN Override Rate",
            width=160,
            keyboard_type=ft.KeyboardType.NUMBER,
            hint_text="Enter CBN official rate",
        )

        compliance_notice = ft.Container(
            content=ft.Row(
                controls=[
                    ft.Icon(ft.Icons.INFO_OUTLINE, color=ft.Colors.BLUE_700, size=16),
                    ft.Text(
                        _FX_COMPLIANCE_NOTICE,
                        size=11,
                        color=ft.Colors.BLUE_900,
                        expand=True,
                    ),
                ],
                spacing=8,
                vertical_alignment=ft.CrossAxisAlignment.START,
            ),
            padding=ft.Padding.all(12),
            border_radius=6,
            bgcolor=ft.Colors.BLUE_50,
            border=ft.Border.all(1, ft.Colors.BLUE_100),
        )

        foreign_tax_field = ft.TextField(
            label="Foreign Tax Paid (₦ equivalent, optional)",
            width=240,
            keyboard_type=ft.KeyboardType.NUMBER,
        )
        foreign_tax_note = ft.Text(
            "Foreign tax paid is recorded for reference only in v1. "
            "Formal treaty relief requires a tax advisor.",
            size=11,
            color=ft.Colors.GREY_500,
            italic=True,
        )

        return ft.Container(
            content=ft.Column(
                controls=[
                    ft.Row(
                        controls=[currency_dropdown, amount_field, date_field],
                        spacing=12,
                        wrap=True,
                    ),
                    ft.Row(
                        controls=[fetched_rate_field, cbn_override_field],
                        spacing=12,
                    ),
                    compliance_notice,
                    foreign_tax_field,
                    foreign_tax_note,
                    ft.Button(
                        "Add Foreign Income Entry",
                        icon=ft.Icons.ADD,
                        style=ft.ButtonStyle(
                            bgcolor=ft.Colors.BLUE_50, color=ft.Colors.BLUE_800
                        ),
                        on_click=lambda e: None,
                    ),
                ],
                spacing=12,
            ),
            padding=ft.Padding.all(16),
            border_radius=8,
            bgcolor=ft.Colors.GREY_50,
            border=ft.Border.all(1, ft.Colors.GREY_200),
        )

    def _document_attachment_zone(self) -> ft.Control:
        return ft.Container(
            content=ft.Column(
                controls=[
                    ft.Row(
                        controls=[
                            ft.Icon(
                                ft.Icons.UPLOAD_FILE_OUTLINED,
                                color=ft.Colors.GREY_500,
                                size=28,
                            ),
                            ft.Column(
                                controls=[
                                    ft.Text(
                                        "Attach supporting documents",
                                        size=13,
                                        color=ft.Colors.GREY_700,
                                    ),
                                    ft.Text(
                                        "PDF, JPG, PNG — max 100MB per file",
                                        size=11,
                                        color=ft.Colors.GREY_500,
                                    ),
                                ],
                                spacing=2,
                            ),
                        ],
                        spacing=12,
                    ),
                    ft.OutlinedButton(
                        "Browse Files",
                        icon=ft.Icons.FOLDER_OPEN_OUTLINED,
                        on_click=lambda e: None,
                    ),
                ],
                spacing=10,
            ),
            padding=ft.Padding.all(20),
            border_radius=8,
            border=ft.Border.all(1, ft.Colors.GREY_300),
            bgcolor=ft.Colors.GREY_50,
        )

    def _add_income_entry(self, income_type: str) -> None:
        """Open a dialog or expand a form to add an income entry."""
        # In a full implementation, this would open an entry form dialog
        # For the skeleton, we just track the intent
        app_state = self._page.data
        if app_state:
            app_state.wizard_data.income_entries.append(
                {
                    "income_type": income_type,
                    "gross_amount_ngn": 0.0,
                    "description": "",
                }
            )






