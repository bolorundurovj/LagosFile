"""
Wizard Step 3 — Deductions & Reliefs UI.

Renders relief cards for all NTA 2025 relief types, CRA abolition notice,
Rent Relief auto-calculation, WHT credit list, and real-time summary cards.

Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9
"""

from __future__ import annotations

import flet as ft


_CRA_NOTICE = (
    "The Consolidated Relief Allowance (CRA) has been abolished under the NTA 2025 "
    "and replaced with Rent Relief."
)

_RENT_RELIEF_NOTE = (
    "Homeowners cannot claim Rent Relief. LIRS may request a tenancy agreement "
    "as supporting documentation."
)

_RENT_RELIEF_CAP = 500_000.0  # ₦500,000 — sourced from Tax_Config in production


class DeductionsReliefsStep(ft.BaseControl):
    """Step 3 of the filing wizard — Deductions & Reliefs.

    Requirements: 7.1–7.9
    """

    def __init__(self, page: ft.Page) -> None:
        super().__init__()
        self.page = page
        self._wht_entries: list[dict] = []

        # Relief amount fields
        self._pension_field = ft.TextField(
            label="Pension Contributions (₦)", width=240, keyboard_type=ft.KeyboardType.NUMBER,
            on_change=self._on_relief_change,
        )
        self._nhis_field = ft.TextField(
            label="NHIS Contributions (₦)", width=240, keyboard_type=ft.KeyboardType.NUMBER,
            on_change=self._on_relief_change,
        )
        self._nhf_field = ft.TextField(
            label="NHF Contributions (₦)", width=240, keyboard_type=ft.KeyboardType.NUMBER,
            on_change=self._on_relief_change,
        )
        self._rent_field = ft.TextField(
            label="Annual Rent Paid (₦)", width=240, keyboard_type=ft.KeyboardType.NUMBER,
            on_change=self._on_rent_change,
        )
        self._rent_relief_display = ft.TextField(
            label="Rent Relief Allowance (₦, auto-calculated)",
            width=240,
            read_only=True,
            bgcolor=ft.Colors.GREY_100,
            value="₦0.00",
        )
        self._life_assurance_field = ft.TextField(
            label="Life Assurance Premiums (₦)", width=240, keyboard_type=ft.KeyboardType.NUMBER,
            on_change=self._on_relief_change,
        )
        self._other_field = ft.TextField(
            label="Other Approved Deductions (₦)", width=240, keyboard_type=ft.KeyboardType.NUMBER,
            on_change=self._on_relief_change,
        )
        self._other_desc_field = ft.TextField(label="Description of Other Deductions", width=340)

        # Summary displays
        self._total_deductions_text = ft.Text("₦0.00", size=20, weight=ft.FontWeight.BOLD, color=ft.Colors.BLUE_800)
        self._estimated_tax_text = ft.Text("₦0.00", size=20, weight=ft.FontWeight.BOLD, color=ft.Colors.GREEN_700)

    def build(self) -> ft.Control:
        return ft.Column(
            controls=[
                ft.Text(
                    "Step 3: Deductions & Reliefs",
                    size=20,
                    weight=ft.FontWeight.BOLD,
                    color=ft.Colors.GREY_800,
                ),
                ft.Text(
                    "Claim all eligible deductions and reliefs to reduce your chargeable income.",
                    size=13,
                    color=ft.Colors.GREY_600,
                ),
                # CRA abolition notice (Req 7.2)
                ft.Container(
                    content=ft.Row(
                        controls=[
                            ft.Icon(ft.Icons.INFO_OUTLINE, color=ft.Colors.ORANGE_700, size=16),
                            ft.Text(_CRA_NOTICE, size=12, color=ft.Colors.ORANGE_900, expand=True),
                        ],
                        spacing=8,
                    ),
                    padding=ft.padding.all(12),
                    border_radius=6,
                    bgcolor=ft.Colors.ORANGE_50,
                    border=ft.border.all(1, ft.Colors.ORANGE_200),
                ),
                ft.Divider(height=8, color=ft.Colors.TRANSPARENT),
                # Relief cards
                ft.Text("Relief Entries", size=15, weight=ft.FontWeight.W_600),
                self._relief_form(),
                ft.Divider(height=8),
                # WHT credits section (Req 7.6, 7.7)
                ft.Text("WHT Credits (WREN)", size=15, weight=ft.FontWeight.W_600),
                self._wht_section(),
                ft.Divider(height=8),
                # Document attachment (Req 7.8)
                self._document_zone(),
                ft.Divider(height=8),
                # Summary cards (Req 7.9)
                ft.Row(
                    controls=[
                        self._deduction_summary_card(),
                        self._estimated_tax_card(),
                    ],
                    spacing=16,
                ),
            ],
            spacing=12,
            scroll=ft.ScrollMode.AUTO,
        )

    def _relief_form(self) -> ft.Control:
        rent_relief_note = ft.Container(
            content=ft.Row(
                controls=[
                    ft.Icon(ft.Icons.INFO_OUTLINE, color=ft.Colors.GREY_500, size=14),
                    ft.Text(_RENT_RELIEF_NOTE, size=11, color=ft.Colors.GREY_600, expand=True),
                ],
                spacing=6,
            ),
            padding=ft.padding.symmetric(horizontal=10, vertical=6),
            border_radius=4,
            bgcolor=ft.Colors.GREY_50,
        )

        return ft.Container(
            content=ft.Column(
                controls=[
                    ft.Row(controls=[self._pension_field, self._nhis_field], spacing=16, wrap=True),
                    ft.Row(controls=[self._nhf_field, self._life_assurance_field], spacing=16, wrap=True),
                    ft.Divider(height=8),
                    ft.Text("Rent Relief (auto-calculated at 20% of annual rent, capped at ₦500,000)", size=13, weight=ft.FontWeight.W_500),
                    ft.Row(controls=[self._rent_field, self._rent_relief_display], spacing=16, wrap=True),
                    rent_relief_note,
                    ft.Divider(height=8),
                    ft.Row(controls=[self._other_field, self._other_desc_field], spacing=16, wrap=True),
                ],
                spacing=12,
            ),
            padding=ft.padding.all(16),
            border_radius=8,
            bgcolor=ft.Colors.WHITE,
            border=ft.border.all(1, ft.Colors.GREY_200),
        )

    def _wht_section(self) -> ft.Control:
        wht_ref = ft.TextField(label="WHT Certificate Reference *", width=220)
        wht_income_type = ft.TextField(label="Income Type", width=180)
        wht_date = ft.TextField(label="Date of Deduction", width=160, hint_text="YYYY-MM-DD")
        wht_amount = ft.TextField(label="Amount (₦) *", width=160, keyboard_type=ft.KeyboardType.NUMBER)

        wht_list = ft.Column(
            controls=[
                ft.Text(
                    "No WHT credits added yet.",
                    size=12,
                    color=ft.Colors.GREY_500,
                    italic=True,
                ) if not self._wht_entries else ft.Text(
                    f"{len(self._wht_entries)} WHT credit(s) added.",
                    size=12,
                    color=ft.Colors.GREY_700,
                )
            ],
            spacing=4,
        )

        return ft.Container(
            content=ft.Column(
                controls=[
                    ft.Row(
                        controls=[wht_ref, wht_income_type, wht_date, wht_amount],
                        spacing=12,
                        wrap=True,
                    ),
                    ft.ElevatedButton(
                        "Add WHT Credit",
                        icon=ft.Icons.ADD,
                        style=ft.ButtonStyle(bgcolor=ft.Colors.BLUE_50, color=ft.Colors.BLUE_800),
                        on_click=lambda e: None,
                    ),
                    wht_list,
                ],
                spacing=10,
            ),
            padding=ft.padding.all(16),
            border_radius=8,
            bgcolor=ft.Colors.WHITE,
            border=ft.border.all(1, ft.Colors.GREY_200),
        )

    def _document_zone(self) -> ft.Control:
        return ft.Container(
            content=ft.Row(
                controls=[
                    ft.Icon(ft.Icons.UPLOAD_FILE_OUTLINED, color=ft.Colors.GREY_500, size=22),
                    ft.Text(
                        "Attach relief documentation (PDF, JPG, PNG — max 100MB per file)",
                        size=12,
                        color=ft.Colors.GREY_600,
                    ),
                    ft.OutlinedButton("Browse", on_click=lambda e: None),
                ],
                spacing=12,
            ),
            padding=ft.padding.all(14),
            border_radius=8,
            border=ft.border.all(1, ft.Colors.GREY_300, style=ft.BorderStyle.DASHED),
            bgcolor=ft.Colors.GREY_50,
        )

    def _deduction_summary_card(self) -> ft.Control:
        return ft.Container(
            content=ft.Column(
                controls=[
                    ft.Text("Total Deductions & Reliefs", size=12, color=ft.Colors.GREY_600),
                    self._total_deductions_text,
                ],
                spacing=4,
            ),
            padding=ft.padding.all(16),
            border_radius=8,
            bgcolor=ft.Colors.BLUE_50,
            border=ft.border.all(1, ft.Colors.BLUE_100),
            expand=1,
        )

    def _estimated_tax_card(self) -> ft.Control:
        return ft.Container(
            content=ft.Column(
                controls=[
                    ft.Text("Estimated Tax Payable", size=12, color=ft.Colors.GREY_600),
                    self._estimated_tax_text,
                    ft.Text("(Updates in real time)", size=10, color=ft.Colors.GREY_400, italic=True),
                ],
                spacing=4,
            ),
            padding=ft.padding.all(16),
            border_radius=8,
            bgcolor=ft.Colors.GREEN_50,
            border=ft.border.all(1, ft.Colors.GREEN_100),
            expand=1,
        )

    def _on_rent_change(self, e) -> None:
        """Auto-calculate Rent Relief at 20% of annual rent, capped at ₦500,000 (Req 7.3)."""
        try:
            rent = float(self._rent_field.value or 0)
        except ValueError:
            rent = 0.0

        if rent == 0:
            self._rent_relief_display.value = "₦0.00"
            self._rent_relief_display.hint_text = "Rent Relief is not applicable — no rent expense entered."
        else:
            relief = min(rent * 0.20, _RENT_RELIEF_CAP)
            self._rent_relief_display.value = f"₦{relief:,.2f}"

        self._on_relief_change(e)

    def _on_relief_change(self, e) -> None:
        """Recalculate total deductions and update summary cards."""
        def _val(field: ft.TextField) -> float:
            try:
                return float(field.value or 0)
            except ValueError:
                return 0.0

        rent = _val(self._rent_field)
        rent_relief = min(rent * 0.20, _RENT_RELIEF_CAP) if rent > 0 else 0.0

        total = (
            _val(self._pension_field)
            + _val(self._nhis_field)
            + _val(self._nhf_field)
            + rent_relief
            + _val(self._life_assurance_field)
            + _val(self._other_field)
        )
        self._total_deductions_text.value = f"₦{total:,.2f}"

        # Persist to wizard draft
        app_state = self.page.data
        if app_state:
            app_state.wizard_data.relief_entries = [
                {"relief_type": "pension", "claimed_amount": _val(self._pension_field), "approved_amount": _val(self._pension_field)},
                {"relief_type": "nhis", "claimed_amount": _val(self._nhis_field), "approved_amount": _val(self._nhis_field)},
                {"relief_type": "nhf", "claimed_amount": _val(self._nhf_field), "approved_amount": _val(self._nhf_field)},
                {"relief_type": "rent_relief", "claimed_amount": rent_relief, "approved_amount": rent_relief},
                {"relief_type": "life_assurance", "claimed_amount": _val(self._life_assurance_field), "approved_amount": _val(self._life_assurance_field)},
                {"relief_type": "other", "claimed_amount": _val(self._other_field), "approved_amount": _val(self._other_field)},
            ]

        self.update()
