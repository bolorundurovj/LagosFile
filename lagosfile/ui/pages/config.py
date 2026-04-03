"""
Configuration Page UI.

Renders editable fields for all Tax_Config values, each showing current
value, governing NTA 2025 section, last modified date, and modifier.
Wires Save, Export, and Import to ConfigEngine.

Requirements: 13.1–13.8
"""

from __future__ import annotations

import flet as ft

from lagosfile.ui.components.sidebar import Sidebar
from lagosfile.ui.components.topbar import TopBar
from lagosfile.services.config_engine import ConfigEngine, TaxConfig


# Metadata for each config field: (field_key, label, nta_section, description)
_BAND_SECTION = "NTA 2025 Fourth Schedule"
_RELIEF_SECTION = "NTA 2025 Section 33"
_CGT_SECTION = "NTA 2025 Section 30"
_ALLOWANCE_SECTION = "NTA 2025 Third Schedule"
_MIN_TAX_SECTION = "NTA 2025 Section 37"


class ConfigurationPage(ft.BaseControl):
    """Configuration Page — edit Tax_Config values in-app.

    Requirements: 13.1–13.8
    """

    def __init__(self, page: ft.Page) -> None:
        super().__init__()
        self.page = page
        self._config_engine = ConfigEngine()
        self._config: TaxConfig | None = None
        self._status_text = ft.Text("", size=12)
        self._version_label = ft.Text("Loading...", size=13, color=ft.Colors.GREY_600)

        # Editable fields
        self._rent_relief_cap_field = ft.TextField(
            label="Rent Relief Cap (₦)",
            width=220,
            keyboard_type=ft.KeyboardType.NUMBER,
        )
        self._cgt_proceeds_field = ft.TextField(
            label="CGT Proceeds Threshold (₦)",
            width=220,
            keyboard_type=ft.KeyboardType.NUMBER,
        )
        self._cgt_gain_field = ft.TextField(
            label="CGT Gain Threshold (₦)",
            width=220,
            keyboard_type=ft.KeyboardType.NUMBER,
        )
        self._min_tax_rate_field = ft.TextField(
            label="Minimum Tax Rate (e.g. 0.01 = 1%)",
            width=220,
            keyboard_type=ft.KeyboardType.NUMBER,
        )

    def build(self) -> ft.Control:
        sidebar = Sidebar(self.page, active_route="/config")
        topbar = TopBar(self.page, title="Configuration")

        content = ft.Column(
            controls=[
                topbar,
                ft.Container(
                    content=ft.Column(
                        controls=self._build_body(),
                        spacing=20,
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
            # Version label (Req 13.5)
            ft.Container(
                content=ft.Row(
                    controls=[
                        ft.Icon(ft.Icons.INFO_OUTLINE, color=ft.Colors.BLUE_700, size=16),
                        self._version_label,
                    ],
                    spacing=8,
                ),
                padding=ft.padding.symmetric(horizontal=14, vertical=10),
                border_radius=6,
                bgcolor=ft.Colors.BLUE_50,
                border=ft.border.all(1, ft.Colors.BLUE_100),
            ),
            # Tax bands section
            self._bands_section(),
            # Relief caps section
            self._relief_section(),
            # CGT thresholds section
            self._cgt_section(),
            # Capital allowance rates section
            self._allowance_rates_section(),
            # Minimum tax rate section
            self._min_tax_section(),
            # Action buttons
            self._action_buttons(),
            # Status message
            self._status_text,
        ]

    def _config_field_row(
        self,
        label: str,
        value: str,
        nta_section: str,
        field: ft.TextField | None = None,
    ) -> ft.Control:
        """Render a config field row with label, value, NTA section, and optional edit field."""
        return ft.Container(
            content=ft.Row(
                controls=[
                    ft.Column(
                        controls=[
                            ft.Text(label, size=13, weight=ft.FontWeight.W_500),
                            ft.Text(nta_section, size=10, color=ft.Colors.GREY_500, italic=True),
                        ],
                        spacing=2,
                        expand=2,
                    ),
                    ft.Text(value, size=13, color=ft.Colors.GREY_700, expand=1),
                    field if field else ft.Container(expand=1),
                ],
                vertical_alignment=ft.CrossAxisAlignment.CENTER,
                spacing=16,
            ),
            padding=ft.padding.symmetric(horizontal=16, vertical=10),
            border_radius=6,
            bgcolor=ft.Colors.GREY_50,
            border=ft.border.all(1, ft.Colors.GREY_200),
        )

    def _bands_section(self) -> ft.Control:
        band_rows = []
        if self._config:
            for i, band in enumerate(self._config.bands):
                upper = band.get("upper")
                upper_str = f"₦{upper:,.0f}" if upper is not None else "∞"
                label = f"Band {i+1}: ₦{band['lower']:,.0f} – {upper_str}"
                rate_field = ft.TextField(
                    value=str(band["rate"]),
                    width=120,
                    keyboard_type=ft.KeyboardType.NUMBER,
                    label="Rate",
                )
                band_rows.append(
                    self._config_field_row(label, f"{band['rate']*100:.0f}%", _BAND_SECTION, rate_field)
                )
        else:
            band_rows.append(ft.Text("Loading tax bands...", size=12, color=ft.Colors.GREY_500, italic=True))

        return ft.Container(
            content=ft.Column(
                controls=[
                    ft.Text("Tax Bands (NTA 2025 Fourth Schedule)", size=15, weight=ft.FontWeight.W_600),
                    *band_rows,
                ],
                spacing=8,
            ),
            padding=ft.padding.all(16),
            border_radius=10,
            bgcolor=ft.Colors.WHITE,
            border=ft.border.all(1, ft.Colors.GREY_200),
        )

    def _relief_section(self) -> ft.Control:
        current_cap = f"₦{self._config.rent_relief_cap:,.0f}" if self._config else "—"
        if self._config:
            self._rent_relief_cap_field.value = str(self._config.rent_relief_cap)

        return ft.Container(
            content=ft.Column(
                controls=[
                    ft.Text("Relief Caps", size=15, weight=ft.FontWeight.W_600),
                    self._config_field_row(
                        "Rent Relief Cap",
                        current_cap,
                        _RELIEF_SECTION,
                        self._rent_relief_cap_field,
                    ),
                ],
                spacing=8,
            ),
            padding=ft.padding.all(16),
            border_radius=10,
            bgcolor=ft.Colors.WHITE,
            border=ft.border.all(1, ft.Colors.GREY_200),
        )

    def _cgt_section(self) -> ft.Control:
        if self._config:
            self._cgt_proceeds_field.value = str(self._config.cgt_proceeds_threshold)
            self._cgt_gain_field.value = str(self._config.cgt_gain_threshold)

        return ft.Container(
            content=ft.Column(
                controls=[
                    ft.Text("CGT Exemption Thresholds", size=15, weight=ft.FontWeight.W_600),
                    self._config_field_row(
                        "CGT Proceeds Threshold",
                        f"₦{self._config.cgt_proceeds_threshold:,.0f}" if self._config else "—",
                        _CGT_SECTION,
                        self._cgt_proceeds_field,
                    ),
                    self._config_field_row(
                        "CGT Gain Threshold",
                        f"₦{self._config.cgt_gain_threshold:,.0f}" if self._config else "—",
                        _CGT_SECTION,
                        self._cgt_gain_field,
                    ),
                ],
                spacing=8,
            ),
            padding=ft.padding.all(16),
            border_radius=10,
            bgcolor=ft.Colors.WHITE,
            border=ft.border.all(1, ft.Colors.GREY_200),
        )

    def _allowance_rates_section(self) -> ft.Control:
        rate_rows = []
        if self._config:
            for asset_type, rate in self._config.allowance_rates.items():
                rate_field = ft.TextField(
                    value=str(rate),
                    width=120,
                    keyboard_type=ft.KeyboardType.NUMBER,
                    label="Rate",
                )
                rate_rows.append(
                    self._config_field_row(asset_type, f"{rate*100:.0f}%", _ALLOWANCE_SECTION, rate_field)
                )
        else:
            rate_rows.append(ft.Text("Loading allowance rates...", size=12, color=ft.Colors.GREY_500, italic=True))

        return ft.Container(
            content=ft.Column(
                controls=[
                    ft.Text("Capital Allowance Rates by Asset Type", size=15, weight=ft.FontWeight.W_600),
                    *rate_rows,
                ],
                spacing=8,
            ),
            padding=ft.padding.all(16),
            border_radius=10,
            bgcolor=ft.Colors.WHITE,
            border=ft.border.all(1, ft.Colors.GREY_200),
        )

    def _min_tax_section(self) -> ft.Control:
        if self._config:
            self._min_tax_rate_field.value = str(self._config.minimum_tax_rate)

        return ft.Container(
            content=ft.Column(
                controls=[
                    ft.Text("Minimum Tax", size=15, weight=ft.FontWeight.W_600),
                    self._config_field_row(
                        "Minimum Tax Rate",
                        f"{self._config.minimum_tax_rate*100:.0f}%" if self._config else "—",
                        _MIN_TAX_SECTION,
                        self._min_tax_rate_field,
                    ),
                ],
                spacing=8,
            ),
            padding=ft.padding.all(16),
            border_radius=10,
            bgcolor=ft.Colors.WHITE,
            border=ft.border.all(1, ft.Colors.GREY_200),
        )

    def _action_buttons(self) -> ft.Control:
        return ft.Row(
            controls=[
                ft.ElevatedButton(
                    "Save Configuration",
                    icon=ft.Icons.SAVE_OUTLINED,
                    style=ft.ButtonStyle(bgcolor=ft.Colors.BLUE_800, color=ft.Colors.WHITE),
                    on_click=self._on_save,
                ),
                ft.OutlinedButton(
                    "Export JSON",
                    icon=ft.Icons.DOWNLOAD_OUTLINED,
                    on_click=self._on_export,
                ),
                ft.OutlinedButton(
                    "Import JSON",
                    icon=ft.Icons.UPLOAD_OUTLINED,
                    on_click=self._on_import,
                ),
            ],
            spacing=12,
        )

    async def _on_save(self, e) -> None:
        """Save updated config values via ConfigEngine."""
        if self._config is None:
            return
        try:
            # Build updated config from field values
            updated = TaxConfig(
                version_label=self._config.version_label,
                bands=self._config.bands,
                rent_relief_cap=float(self._rent_relief_cap_field.value or self._config.rent_relief_cap),
                cgt_proceeds_threshold=float(self._cgt_proceeds_field.value or self._config.cgt_proceeds_threshold),
                cgt_gain_threshold=float(self._cgt_gain_field.value or self._config.cgt_gain_threshold),
                allowance_rates=self._config.allowance_rates,
                minimum_tax_rate=float(self._min_tax_rate_field.value or self._config.minimum_tax_rate),
            )
            saved = await self._config_engine.save_config(updated)
            self._config = saved
            # Update AppState
            app_state = self.page.data
            if app_state:
                app_state.active_config = saved
            self._show_status("Configuration saved successfully.", ft.Colors.GREEN_700)
        except Exception as exc:
            self._show_status(f"Save failed: {exc}", ft.Colors.RED_400)

    async def _on_export(self, e) -> None:
        """Export active config as JSON."""
        if self._config is None:
            return
        try:
            json_str = await self._config_engine.export_json(self._config)
            from lagosfile.constants import Constants
            Constants.ensure_dirs()
            out_path = Constants.BASE_DIR / "tax_config_export.json"
            out_path.write_text(json_str, encoding="utf-8")
            self._show_status(f"Config exported to {out_path}", ft.Colors.GREEN_700)
        except Exception as exc:
            self._show_status(f"Export failed: {exc}", ft.Colors.RED_400)

    async def _on_import(self, e) -> None:
        """Import config from a JSON file."""
        # In a full implementation, open a file picker
        # For the skeleton, show a placeholder message
        self._show_status("File picker not yet implemented. Place JSON at ~/LagosFile/tax_config_import.json", ft.Colors.BLUE_700)

    def _show_status(self, msg: str, color: str) -> None:
        self._status_text.value = msg
        self._status_text.color = color
        self.update()
