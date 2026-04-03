"""
Export Modal component.

Renders a format selector (PDF/CSV/JSON), Include Attachments toggle,
Download and Print buttons, and security badges.

Requirements: 11.6, 11.7
"""

from __future__ import annotations

import flet as ft

from lagosfile.services.export_engine import ExportEngine, FilingExport


class ExportModal(ft.BaseControl):
    """Export modal overlay for confirmed filings.

    Requirements: 11.6, 11.7
    """

    def __init__(self, page: ft.Page, filing_export: FilingExport | None = None) -> None:
        super().__init__()
        self.page = page
        self.filing_export = filing_export
        self._export_engine = ExportEngine()

        self._format_group = ft.RadioGroup(
            content=ft.Row(
                controls=[
                    ft.Radio(value="pdf", label="PDF"),
                    ft.Radio(value="csv", label="CSV"),
                    ft.Radio(value="json", label="JSON"),
                ],
                spacing=16,
            ),
            value="pdf",
        )
        self._include_attachments = ft.Switch(
            label="Include Attachments",
            value=True,
        )
        self._status_text = ft.Text("", size=12, color=ft.Colors.GREY_600)

    def build(self) -> ft.Control:
        return ft.AlertDialog(
            modal=True,
            title=ft.Text("Export Filing", size=18, weight=ft.FontWeight.W_600),
            content=ft.Container(
                content=ft.Column(
                    controls=[
                        # Format selector (Req 11.6)
                        ft.Text("Export Format", size=13, weight=ft.FontWeight.W_500),
                        self._format_group,
                        ft.Divider(height=8),
                        # Include Attachments toggle (Req 11.6)
                        self._include_attachments,
                        ft.Divider(height=8),
                        # Security badges (Req 11.7)
                        ft.Row(
                            controls=[
                                self._security_badge("End-to-end Encrypted", ft.Icons.LOCK_OUTLINED, ft.Colors.GREEN_700),
                                self._security_badge("LIRS Compliant Generation", ft.Icons.VERIFIED_OUTLINED, ft.Colors.BLUE_700),
                            ],
                            spacing=10,
                        ),
                        self._status_text,
                    ],
                    spacing=12,
                ),
                width=400,
                padding=ft.padding.symmetric(vertical=8),
            ),
            actions=[
                ft.TextButton("Cancel", on_click=self._close),
                ft.OutlinedButton(
                    "Print",
                    icon=ft.Icons.PRINT_OUTLINED,
                    on_click=self._on_print,
                ),
                ft.ElevatedButton(
                    "Download Export",
                    icon=ft.Icons.DOWNLOAD_OUTLINED,
                    style=ft.ButtonStyle(bgcolor=ft.Colors.BLUE_800, color=ft.Colors.WHITE),
                    on_click=self._on_download,
                ),
            ],
            actions_alignment=ft.MainAxisAlignment.END,
        )

    def _security_badge(self, label: str, icon: str, color: str) -> ft.Control:
        return ft.Container(
            content=ft.Row(
                controls=[
                    ft.Icon(icon, color=color, size=14),
                    ft.Text(label, size=11, color=color),
                ],
                spacing=4,
            ),
            padding=ft.padding.symmetric(horizontal=10, vertical=5),
            border_radius=20,
            bgcolor=ft.Colors.with_opacity(0.1, color),
            border=ft.border.all(1, ft.Colors.with_opacity(0.3, color)),
        )

    def _close(self, e) -> None:
        self.page.dialog.open = False
        self.page.update()

    def _on_download(self, e) -> None:
        """Generate and download the export in the selected format."""
        if self.filing_export is None:
            self._status_text.value = "No filing data available for export."
            self.update()
            return

        fmt = self._format_group.value
        include_attachments = self._include_attachments.value

        try:
            if fmt == "pdf":
                data = self._export_engine.export_pdf(self.filing_export, include_attachments=include_attachments)
                filename = f"lagosfile_{self.filing_export.yoa}_{self.filing_export.tin}.pdf"
                self._save_bytes(data, filename)
            elif fmt == "csv":
                data = self._export_engine.export_csv(self.filing_export)
                filename = f"lagosfile_{self.filing_export.yoa}_{self.filing_export.tin}.csv"
                self._save_text(data, filename)
            elif fmt == "json":
                data = self._export_engine.export_json(self.filing_export)
                filename = f"lagosfile_{self.filing_export.yoa}_{self.filing_export.tin}.json"
                self._save_text(data, filename)

            self._status_text.value = f"Export saved successfully."
            self._status_text.color = ft.Colors.GREEN_700
        except Exception as exc:
            self._status_text.value = f"Export failed: {exc}"
            self._status_text.color = ft.Colors.RED_400

        self.update()

    def _on_print(self, e) -> None:
        """Generate PDF and open for printing."""
        if self.filing_export is None:
            return
        try:
            data = self._export_engine.export_pdf(self.filing_export, include_attachments=self._include_attachments.value)
            import tempfile, os, subprocess, sys
            with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
                f.write(data)
                tmp_path = f.name
            if sys.platform == "win32":
                os.startfile(tmp_path)
            elif sys.platform == "darwin":
                subprocess.run(["open", tmp_path])
            else:
                subprocess.run(["xdg-open", tmp_path])
        except Exception as exc:
            self._status_text.value = f"Print failed: {exc}"
            self._status_text.color = ft.Colors.RED_400
            self.update()

    def _save_bytes(self, data: bytes, filename: str) -> None:
        from lagosfile.constants import Constants
        Constants.ensure_dirs()
        out_path = Constants.BASE_DIR / filename
        out_path.write_bytes(data)

    def _save_text(self, data: str, filename: str) -> None:
        from lagosfile.constants import Constants
        Constants.ensure_dirs()
        out_path = Constants.BASE_DIR / filename
        out_path.write_text(data, encoding="utf-8")

    @classmethod
    def show(cls, page: ft.Page, filing_export: FilingExport | None = None) -> None:
        """Convenience method to open the export modal as a page dialog."""
        modal = cls(page, filing_export)
        page.dialog = modal.build()
        page.dialog.open = True
        page.update()
