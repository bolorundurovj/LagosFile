from __future__ import annotations

import flet as ft

_ASSET_TYPES = [
    "Computer/Laptop",
    "Router/Networking Equipment",
    "Monitor",
    "Keyboard/Peripherals",
    "Camera/Recording Equipment",
    "Software Licence",
    "Other",
]


class CapitalAllowancesStep(ft.BaseControl):
    def __init__(self, page: ft.Page) -> None:
        super().__init__()
        self.page = page
        self._entries: list[dict] = []
        self._total_allowance = ft.Text("₦0.00", size=22, weight=ft.FontWeight.BOLD, color=ft.Colors.BLUE_800)

    def build(self) -> ft.Control:
        return ft.Column(
            controls=[
                ft.Text(
                    "Step 2: Capital Allowances",
                    size=20,
                    weight=ft.FontWeight.BOLD,
                    color=ft.Colors.GREY_800,
                ),
                ft.Text(
                    "Enter professional assets eligible for straight-line annual allowances under NTA 2025. "
                    "No initial allowance is available.",
                    size=13,
                    color=ft.Colors.GREY_600,
                ),
                ft.Divider(height=16, color=ft.Colors.TRANSPARENT),
                self._summary_card(),
                ft.Divider(height=8, color=ft.Colors.TRANSPARENT),
                self._asset_entry_form(),
                ft.Divider(height=8, color=ft.Colors.TRANSPARENT),
                self._asset_table(),
                ft.Divider(height=16, color=ft.Colors.TRANSPARENT),
                self._document_attachment_zone(),
            ],
            spacing=12,
            scroll=ft.ScrollMode.AUTO,
        )

    def _summary_card(self) -> ft.Control:
        return ft.Container(
            content=ft.Row(
                controls=[
                    ft.Column(
                        controls=[
                            ft.Text(
                                "Total Capital Allowance Claimable",
                                size=13,
                                color=ft.Colors.GREY_600,
                            ),
                            self._total_allowance,
                            ft.Text(
                                "Updates in real time as entries are added.",
                                size=11,
                                color=ft.Colors.GREY_400,
                                italic=True,
                            ),
                        ],
                        spacing=4,
                        expand=True,
                    ),
                    ft.Icon(ft.Icons.CALCULATE_OUTLINED, color=ft.Colors.BLUE_300, size=40),
                ],
                alignment=ft.MainAxisAlignment.SPACE_BETWEEN,
                vertical_alignment=ft.CrossAxisAlignment.CENTER,
            ),
            padding=ft.padding.all(20),
            border_radius=10,
            bgcolor=ft.Colors.BLUE_50,
            border=ft.border.all(1, ft.Colors.BLUE_100),
        )

    def _asset_entry_form(self) -> ft.Control:
        asset_type_dd = ft.Dropdown(
            label="Asset Type *",
            options=[ft.dropdown.Option(t) for t in _ASSET_TYPES],
            width=220,
        )
        description_field = ft.TextField(label="Asset Description *", width=260)
        cost_field = ft.TextField(
            label="Cost (₦) *",
            width=180,
            keyboard_type=ft.KeyboardType.NUMBER,
        )
        date_field = ft.TextField(label="Date of Acquisition *", width=180, hint_text="YYYY-MM-DD")
        wdv_field = ft.TextField(
            label="Tax Written-Down Value (₦)",
            width=200,
            hint_text="Auto-populated from prior year",
            bgcolor=ft.Colors.GREY_50,
        )
        allowance_display = ft.TextField(
            label="Annual Allowance (₦)",
            width=180,
            read_only=True,
            bgcolor=ft.Colors.GREY_100,
            hint_text="Auto-calculated",
        )
        return ft.Container(
            content=ft.Column(
                controls=[
                    ft.Text("Add Asset", size=14, weight=ft.FontWeight.W_600),
                    ft.Row(
                        controls=[asset_type_dd, description_field],
                        spacing=12,
                        wrap=True,
                    ),
                    ft.Row(
                        controls=[cost_field, date_field, wdv_field, allowance_display],
                        spacing=12,
                        wrap=True,
                    ),
                    ft.ElevatedButton(
                        "Add Asset to Schedule",
                        icon=ft.Icons.ADD,
                        style=ft.ButtonStyle(bgcolor=ft.Colors.BLUE_800, color=ft.Colors.WHITE),
                        on_click=self._on_add_asset,
                    ),
                ],
                spacing=12,
            ),
            padding=ft.padding.all(16),
            border_radius=8,
            bgcolor=ft.Colors.WHITE,
            border=ft.border.all(1, ft.Colors.GREY_200),
        )

    def _asset_table(self) -> ft.Control:
        columns = [
            ft.DataColumn(ft.Text("Asset Type", size=12, weight=ft.FontWeight.BOLD)),
            ft.DataColumn(ft.Text("Description", size=12, weight=ft.FontWeight.BOLD)),
            ft.DataColumn(ft.Text("Cost (₦)", size=12, weight=ft.FontWeight.BOLD), numeric=True),
            ft.DataColumn(
                ft.Text("Annual Allowance (₦)", size=12, weight=ft.FontWeight.BOLD),
                numeric=True,
            ),
            ft.DataColumn(ft.Text("WDV (₦)", size=12, weight=ft.FontWeight.BOLD), numeric=True),
            ft.DataColumn(ft.Text("Actions", size=12, weight=ft.FontWeight.BOLD)),
        ]
        rows = [
            ft.DataRow(
                cells=[
                    ft.DataCell(ft.Text(e.get("asset_type", ""), size=12)),
                    ft.DataCell(ft.Text(e.get("asset_description", ""), size=12)),
                    ft.DataCell(ft.Text(f"₦{e.get('asset_cost', 0):,.2f}", size=12)),
                    ft.DataCell(ft.Text(f"₦{e.get('annual_allowance_amount', 0):,.2f}", size=12)),
                    ft.DataCell(ft.Text(f"₦{e.get('tax_written_down_value', 0):,.2f}", size=12)),
                    ft.DataCell(
                        ft.IconButton(
                            ft.Icons.DELETE_OUTLINE,
                            icon_color=ft.Colors.RED_400,
                            tooltip="Remove",
                            on_click=lambda ev, idx=i: self._remove_entry(idx),
                        )
                    ),
                ]
            )
            for i, e in enumerate(self._entries)
        ]
        if not rows:
            return ft.Container(
                content=ft.Text(
                    "No assets added yet. Use the form above to add assets.",
                    size=13,
                    color=ft.Colors.GREY_500,
                    italic=True,
                ),
                padding=ft.padding.symmetric(vertical=16),
                alignment=ft.alignment.center,
            )
        return ft.DataTable(
            columns=columns,
            rows=rows,
            border=ft.border.all(1, ft.Colors.GREY_200),
            border_radius=8,
            heading_row_color=ft.Colors.GREY_50,
        )

    def _document_attachment_zone(self) -> ft.Control:
        return ft.Container(
            content=ft.Column(
                controls=[
                    ft.Text("Supporting Documents", size=14, weight=ft.FontWeight.W_600),
                    ft.Row(
                        controls=[
                            ft.Icon(
                                ft.Icons.UPLOAD_FILE_OUTLINED,
                                color=ft.Colors.GREY_500,
                                size=24,
                            ),
                            ft.Text(
                                "Attach purchase receipts or invoices (PDF, JPG, PNG — max 100MB per file)",
                                size=12,
                                color=ft.Colors.GREY_600,
                            ),
                        ],
                        spacing=10,
                    ),
                    ft.OutlinedButton(
                        "Browse Files",
                        icon=ft.Icons.FOLDER_OPEN_OUTLINED,
                        on_click=lambda e: None,
                    ),
                ],
                spacing=10,
            ),
            padding=ft.padding.all(16),
            border_radius=8,
            border=ft.border.all(1, ft.Colors.GREY_300, style=ft.BorderStyle.DASHED),
            bgcolor=ft.Colors.GREY_50,
        )

    def _on_add_asset(self, e) -> None:
        entry = {
            "asset_type": "Computer/Laptop",
            "asset_description": "New asset",
            "asset_cost": 0.0,
            "annual_allowance_rate": 0.25,
            "annual_allowance_amount": 0.0,
            "tax_written_down_value": 0.0,
        }
        self._entries.append(entry)
        app_state = self.page.data
        if app_state:
            app_state.wizard_data.capital_allowances = self._entries
        self._recalculate_total()
        self.update()

    def _remove_entry(self, idx: int) -> None:
        if 0 <= idx < len(self._entries):
            self._entries.pop(idx)
            app_state = self.page.data
            if app_state:
                app_state.wizard_data.capital_allowances = self._entries
            self._recalculate_total()
            self.update()

    def _recalculate_total(self) -> None:
        total = sum(e.get("annual_allowance_amount", 0.0) for e in self._entries)
        self._total_allowance.value = f"₦{total:,.2f}"
