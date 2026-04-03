"""
Wizard Step 4 — Review & Confirm UI.

Calls ComputationEngine.compute() and renders the full tax breakdown,
tax band utilization bar, foreign income summary, minimum tax comparison,
CGT exemption status, and incomplete filing warnings.

Requirements: 9.1–9.9
"""

from __future__ import annotations

import flet as ft

from lagosfile.services.computation_engine import ComputationEngine, FilingData
from dataclasses import dataclass


@dataclass
class IncomeEntry:
    income_type: str
    gross_amount_ngn: float
    is_foreign: bool = False
    foreign_currency: str | None = None
    foreign_amount: float | None = None
    fx_rate_used: float | None = None
    fx_rate_cbn_override: float | None = None
    fx_rate_source: str | None = None
    cgt_proceeds: float | None = None
    cgt_gain: float | None = None


@dataclass
class CapitalAllowance:
    annual_allowance_amount: float
    asset_cost: float = 0.0
    annual_allowance_rate: float = 0.0


@dataclass
class ReliefEntry:
    relief_type: str
    approved_amount: float
    claimed_amount: float = 0.0


def _fmt(val: float | None) -> str:
    if val is None:
        return "—"
    return f"₦{val:,.2f}"


class ReviewConfirmStep(ft.BaseControl):
    """Step 4 of the filing wizard — Review & Confirm.

    Requirements: 9.1–9.9
    """

    def __init__(self, page: ft.Page) -> None:
        super().__init__()
        self.page = page
        self._result = None
        self._warnings: list[str] = []

    def build(self) -> ft.Control:
        self._compute()

        controls: list[ft.Control] = [
            ft.Text(
                "Step 4: Review & Confirm",
                size=20,
                weight=ft.FontWeight.BOLD,
                color=ft.Colors.GREY_800,
            ),
            ft.Text(
                "Review your full tax computation before confirming. "
                "Once confirmed, this filing becomes an immutable record.",
                size=13,
                color=ft.Colors.GREY_600,
            ),
            ft.Divider(height=12, color=ft.Colors.TRANSPARENT),
        ]

        # Incomplete filing warnings (Req 9.6)
        if self._warnings:
            controls.append(self._warnings_card())

        if self._result:
            # Full tax breakdown (Req 9.1)
            controls.append(self._breakdown_card())
            # Tax band utilization bar (Req 9.7)
            controls.append(self._band_utilization_bar())
            # Foreign income summary (Req 9.2, 9.3)
            controls.append(self._foreign_income_summary())
            # Minimum tax comparison (Req 9.5)
            controls.append(self._minimum_tax_comparison())
            # CGT exemption status (Req 9.4)
            if self._result.cgt_exempt_amount > 0:
                controls.append(self._cgt_exemption_card())
        else:
            controls.append(
                ft.Container(
                    content=ft.Text(
                        "No computation data available. Please complete the previous steps.",
                        size=13,
                        color=ft.Colors.GREY_500,
                        italic=True,
                    ),
                    padding=ft.padding.all(20),
                )
            )

        # Minimum tax notice (Req 8.8)
        controls.append(self._minimum_tax_notice())

        # Action buttons (Req 9.8, 9.9)
        controls.append(self._action_buttons())

        return ft.Column(
            controls=controls,
            spacing=16,
            scroll=ft.ScrollMode.AUTO,
        )

    def _compute(self) -> None:
        """Run ComputationEngine with current wizard data."""
        app_state = self.page.data
        if app_state is None:
            return

        try:
            wizard = app_state.wizard_data
            config = app_state.active_config

            income_entries = [
                IncomeEntry(
                    income_type=e.get("income_type", "other"),
                    gross_amount_ngn=float(e.get("gross_amount_ngn", 0)),
                    is_foreign=e.get("is_foreign", False),
                    foreign_currency=e.get("foreign_currency"),
                    foreign_amount=e.get("foreign_amount"),
                    fx_rate_used=e.get("fx_rate_used"),
                    fx_rate_cbn_override=e.get("fx_rate_cbn_override"),
                    fx_rate_source=e.get("fx_rate_source"),
                    cgt_proceeds=e.get("cgt_proceeds"),
                    cgt_gain=e.get("cgt_gain"),
                )
                for e in wizard.income_entries
            ]

            capital_allowances = [
                CapitalAllowance(
                    annual_allowance_amount=float(a.get("annual_allowance_amount", 0)),
                    asset_cost=float(a.get("asset_cost", 0)),
                    annual_allowance_rate=float(a.get("annual_allowance_rate", 0)),
                )
                for a in wizard.capital_allowances
            ]

            relief_entries = [
                ReliefEntry(
                    relief_type=r.get("relief_type", "other"),
                    approved_amount=float(r.get("approved_amount", 0)),
                )
                for r in wizard.relief_entries
            ]

            filing_data = FilingData(
                income_entries=income_entries,
                capital_allowances=capital_allowances,
                relief_entries=relief_entries,
            )

            engine = ComputationEngine()
            self._result = engine.compute(filing_data, config)

        except Exception as exc:
            self._warnings.append(f"Computation error: {exc}")

    def _breakdown_card(self) -> ft.Control:
        r = self._result
        rows = [
            ("Total Gross Income", _fmt(r.total_gross_income)),
            ("Less: Capital Allowances", f"({_fmt(r.prorated_capital_allowances)})"),
            ("Less: Deductions & Reliefs", f"({_fmt(r.total_deductions)})"),
            ("= Chargeable Income", _fmt(r.chargeable_income)),
            ("Tax on Chargeable Income (Graduated)", _fmt(r.graduated_tax)),
            ("Less: WHT Credits", f"({_fmt(r.wht_credits)})"),
            ("= Net Tax Payable", _fmt(r.net_tax_payable)),
            ("Minimum Tax (1% of Gross Income)", _fmt(r.minimum_tax)),
            ("Final Tax Payable", _fmt(r.final_tax_payable)),
        ]

        data_rows = [
            ft.DataRow(
                cells=[
                    ft.DataCell(ft.Text(label, size=12, weight=ft.FontWeight.BOLD if "Final" in label or "Chargeable" in label else ft.FontWeight.NORMAL)),
                    ft.DataCell(ft.Text(value, size=12, text_align=ft.TextAlign.RIGHT, weight=ft.FontWeight.BOLD if "Final" in label else ft.FontWeight.NORMAL)),
                ],
                color=ft.Colors.BLUE_50 if "Final" in label else None,
            )
            for label, value in rows
        ]

        # Add band breakdown rows
        for i, band_result in enumerate(r.band_breakdown):
            band = band_result.band
            # band is a TaxBand dataclass with .lower, .upper, .rate
            upper_str = f"₦{band.upper:,.0f}" if band.upper is not None else "∞"
            label = f"  Band ₦{band.lower:,.0f}–{upper_str} @ {band.rate*100:.0f}%"
            data_rows.insert(
                4 + i,
                ft.DataRow(
                    cells=[
                        ft.DataCell(ft.Text(label, size=11, color=ft.Colors.GREY_600)),
                        ft.DataCell(ft.Text(_fmt(band_result.tax_amount), size=11, color=ft.Colors.GREY_600, text_align=ft.TextAlign.RIGHT)),
                    ]
                )
            )

        return ft.Container(
            content=ft.Column(
                controls=[
                    ft.Text("Tax Computation Breakdown", size=15, weight=ft.FontWeight.W_600),
                    ft.DataTable(
                        columns=[
                            ft.DataColumn(ft.Text("Description", size=12, weight=ft.FontWeight.BOLD)),
                            ft.DataColumn(ft.Text("Amount", size=12, weight=ft.FontWeight.BOLD), numeric=True),
                        ],
                        rows=data_rows,
                        border=ft.border.all(1, ft.Colors.GREY_200),
                        border_radius=8,
                        heading_row_color=ft.Colors.GREY_50,
                    ),
                ],
                spacing=10,
            ),
            padding=ft.padding.all(20),
            border_radius=10,
            bgcolor=ft.Colors.WHITE,
            border=ft.border.all(1, ft.Colors.GREY_200),
        )

    def _band_utilization_bar(self) -> ft.Control:
        r = self._result
        if not r or r.chargeable_income == 0:
            return ft.Container()

        band_colors = [
            ft.Colors.GREEN_400,
            ft.Colors.BLUE_400,
            ft.Colors.ORANGE_400,
            ft.Colors.RED_400,
            ft.Colors.PURPLE_400,
            ft.Colors.PINK_400,
        ]

        bar_segments = []
        for i, br in enumerate(r.band_breakdown):
            if br.taxable_amount > 0:
                proportion = br.taxable_amount / r.chargeable_income
                bar_segments.append(
                    ft.Container(
                        width=proportion * 400,
                        height=20,
                        bgcolor=band_colors[i % len(band_colors)],
                        tooltip=f"Band {i+1}: {_fmt(br.taxable_amount)} @ {br.band['rate']*100:.0f}%",
                    )
                )

        return ft.Container(
            content=ft.Column(
                controls=[
                    ft.Text("Tax Band Utilization", size=14, weight=ft.FontWeight.W_600),
                    ft.Row(controls=bar_segments, spacing=2),
                    ft.Text(
                        f"Chargeable Income: {_fmt(r.chargeable_income)}",
                        size=11,
                        color=ft.Colors.GREY_500,
                    ),
                ],
                spacing=8,
            ),
            padding=ft.padding.all(16),
            border_radius=8,
            bgcolor=ft.Colors.WHITE,
            border=ft.border.all(1, ft.Colors.GREY_200),
        )

    def _foreign_income_summary(self) -> ft.Control:
        app_state = self.page.data
        if not app_state:
            return ft.Container()

        foreign_entries = [
            e for e in app_state.wizard_data.income_entries
            if e.get("is_foreign") or e.get("foreign_currency")
        ]
        if not foreign_entries:
            return ft.Container()

        rows = [
            ft.DataRow(cells=[
                ft.DataCell(ft.Text(e.get("income_type", ""), size=12)),
                ft.DataCell(ft.Text(e.get("foreign_currency", ""), size=12)),
                ft.DataCell(ft.Text(f"{e.get('foreign_amount', 0):,.2f}", size=12)),
                ft.DataCell(ft.Text(str(e.get("fx_rate_used", "—")), size=12)),
                ft.DataCell(ft.Text(e.get("fx_rate_source", "—"), size=12)),
                ft.DataCell(ft.Text(_fmt(e.get("gross_amount_ngn")), size=12)),
            ])
            for e in foreign_entries
        ]

        return ft.Container(
            content=ft.Column(
                controls=[
                    ft.Text("Foreign Income Summary", size=14, weight=ft.FontWeight.W_600),
                    ft.DataTable(
                        columns=[
                            ft.DataColumn(ft.Text("Type", size=11)),
                            ft.DataColumn(ft.Text("Currency", size=11)),
                            ft.DataColumn(ft.Text("Foreign Amount", size=11), numeric=True),
                            ft.DataColumn(ft.Text("FX Rate Used", size=11), numeric=True),
                            ft.DataColumn(ft.Text("Rate Source", size=11)),
                            ft.DataColumn(ft.Text("NGN Equivalent", size=11), numeric=True),
                        ],
                        rows=rows,
                        border=ft.border.all(1, ft.Colors.GREY_200),
                        border_radius=8,
                    ),
                ],
                spacing=8,
            ),
            padding=ft.padding.all(16),
            border_radius=8,
            bgcolor=ft.Colors.WHITE,
            border=ft.border.all(1, ft.Colors.GREY_200),
        )

    def _minimum_tax_comparison(self) -> ft.Control:
        r = self._result
        graduated_higher = r.net_tax_payable >= r.minimum_tax

        return ft.Container(
            content=ft.Column(
                controls=[
                    ft.Text("Minimum Tax Comparison", size=14, weight=ft.FontWeight.W_600),
                    ft.Row(
                        controls=[
                            ft.Container(
                                content=ft.Column(
                                    controls=[
                                        ft.Text("Graduated Tax", size=12, color=ft.Colors.GREY_600),
                                        ft.Text(_fmt(r.net_tax_payable), size=16, weight=ft.FontWeight.BOLD,
                                                color=ft.Colors.BLUE_800 if graduated_higher else ft.Colors.GREY_600),
                                        ft.Text("← Higher" if graduated_higher else "", size=11, color=ft.Colors.GREEN_700),
                                    ],
                                    spacing=4,
                                ),
                                padding=ft.padding.all(14),
                                border_radius=8,
                                bgcolor=ft.Colors.BLUE_50 if graduated_higher else ft.Colors.GREY_50,
                                border=ft.border.all(2 if graduated_higher else 1,
                                                     ft.Colors.BLUE_400 if graduated_higher else ft.Colors.GREY_200),
                                expand=1,
                            ),
                            ft.Container(
                                content=ft.Column(
                                    controls=[
                                        ft.Text("1% Minimum Tax", size=12, color=ft.Colors.GREY_600),
                                        ft.Text(_fmt(r.minimum_tax), size=16, weight=ft.FontWeight.BOLD,
                                                color=ft.Colors.ORANGE_800 if not graduated_higher else ft.Colors.GREY_600),
                                        ft.Text("← Higher" if not graduated_higher else "", size=11, color=ft.Colors.GREEN_700),
                                    ],
                                    spacing=4,
                                ),
                                padding=ft.padding.all(14),
                                border_radius=8,
                                bgcolor=ft.Colors.ORANGE_50 if not graduated_higher else ft.Colors.GREY_50,
                                border=ft.border.all(2 if not graduated_higher else 1,
                                                     ft.Colors.ORANGE_400 if not graduated_higher else ft.Colors.GREY_200),
                                expand=1,
                            ),
                        ],
                        spacing=12,
                    ),
                    ft.Text(
                        f"Final Tax Payable: {_fmt(r.final_tax_payable)}",
                        size=14,
                        weight=ft.FontWeight.BOLD,
                        color=ft.Colors.GREY_800,
                    ),
                ],
                spacing=10,
            ),
            padding=ft.padding.all(16),
            border_radius=8,
            bgcolor=ft.Colors.WHITE,
            border=ft.border.all(1, ft.Colors.GREY_200),
        )

    def _cgt_exemption_card(self) -> ft.Control:
        r = self._result
        return ft.Container(
            content=ft.Row(
                controls=[
                    ft.Icon(ft.Icons.CHECK_CIRCLE_OUTLINE, color=ft.Colors.GREEN_700, size=20),
                    ft.Column(
                        controls=[
                            ft.Text("CGT Exemption Applied", size=13, weight=ft.FontWeight.W_600, color=ft.Colors.GREEN_800),
                            ft.Text(
                                f"Exempt amount: {_fmt(r.cgt_exempt_amount)} — "
                                "Proceeds < ₦150M AND gain ≤ ₦10M within 12 months.",
                                size=12,
                                color=ft.Colors.GREEN_700,
                            ),
                        ],
                        spacing=2,
                    ),
                ],
                spacing=10,
            ),
            padding=ft.padding.all(14),
            border_radius=8,
            bgcolor=ft.Colors.GREEN_50,
            border=ft.border.all(1, ft.Colors.GREEN_200),
        )

    def _minimum_tax_notice(self) -> ft.Control:
        return ft.Container(
            content=ft.Row(
                controls=[
                    ft.Icon(ft.Icons.WARNING_AMBER_OUTLINED, color=ft.Colors.ORANGE_700, size=16),
                    ft.Text(
                        "Note: The applicability of the 1% minimum tax rule to individuals under NTA 2025 "
                        "is unconfirmed. This computation applies the rule as configured. Verify with LIRS or a tax advisor.",
                        size=11,
                        color=ft.Colors.ORANGE_900,
                        expand=True,
                    ),
                ],
                spacing=8,
            ),
            padding=ft.padding.all(12),
            border_radius=6,
            bgcolor=ft.Colors.ORANGE_50,
            border=ft.border.all(1, ft.Colors.ORANGE_200),
        )

    def _warnings_card(self) -> ft.Control:
        return ft.Container(
            content=ft.Column(
                controls=[
                    ft.Row(
                        controls=[
                            ft.Icon(ft.Icons.ERROR_OUTLINE, color=ft.Colors.RED_700, size=18),
                            ft.Text("Incomplete Filing", size=14, weight=ft.FontWeight.W_600, color=ft.Colors.RED_800),
                        ],
                        spacing=8,
                    ),
                    *[ft.Text(f"• {w}", size=12, color=ft.Colors.RED_700) for w in self._warnings],
                ],
                spacing=6,
            ),
            padding=ft.padding.all(14),
            border_radius=8,
            bgcolor=ft.Colors.RED_50,
            border=ft.border.all(1, ft.Colors.RED_200),
        )

    def _action_buttons(self) -> ft.Control:
        return ft.Row(
            controls=[
                ft.OutlinedButton(
                    "Save for Later",
                    icon=ft.Icons.SAVE_OUTLINED,
                    on_click=self._on_save_later,
                ),
                ft.Container(expand=True),
                ft.ElevatedButton(
                    "Confirm Filing",
                    icon=ft.Icons.LOCK_OUTLINED,
                    style=ft.ButtonStyle(
                        bgcolor=ft.Colors.GREEN_700,
                        color=ft.Colors.WHITE,
                    ),
                    on_click=self._on_confirm,
                ),
            ],
        )

    async def _on_confirm(self, e) -> None:
        """Lock the filing as an immutable Confirmed record."""
        app_state = self.page.data
        if app_state is None or app_state.active_filing is None:
            return
        try:
            from lagosfile.services.filing_service import FilingService
            svc = FilingService()
            await svc.confirm(str(app_state.active_filing.id))
            self.page.go("/history")
        except Exception as exc:
            self._warnings.append(f"Confirm failed: {exc}")
            self.update()

    async def _on_save_later(self, e) -> None:
        """Save current state as a Draft without confirming."""
        app_state = self.page.data
        if app_state is None or app_state.active_filing is None:
            return
        self.page.go("/dashboard")
