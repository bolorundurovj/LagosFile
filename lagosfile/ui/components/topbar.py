"""
Top app bar component.

Shows the current Year of Assessment label, logged-in user name + TIN,
and a user avatar.

Requirements: 2.2
"""

from __future__ import annotations

import datetime

import flet as ft


class TopBar(ft.Container):
    """Top app bar showing YOA, user name, TIN, and avatar.

    Requirements: 2.2
    """

    def __init__(self, page: ft.Page, title: str = "") -> None:
        super().__init__()
        self._page = page
        self.expand = True
        self.title = title
        self.content = self.build()

    def build(self) -> ft.Control:
        app_state = self._page.data
        current_yoa = datetime.date.today().year

        taxpayer_name = "—"
        tin_display = "—"
        if app_state and app_state.taxpayer:
            taxpayer_name = app_state.taxpayer.full_name or "—"
            tin = app_state.taxpayer.tin or ""
            # Mask TIN: show last 4 digits
            tin_display = f"TIN: ***{tin[-4:]}" if len(tin) >= 4 else f"TIN: {tin}"

        avatar_initials = (
            taxpayer_name[0].upper() if taxpayer_name and taxpayer_name != "—" else "?"
        )

        return ft.Container(
            content=ft.Row(
                controls=[
                    # Page title / YOA label
                    ft.Column(
                        controls=[
                            ft.Text(
                                self.title or f"Year of Assessment {current_yoa}",
                                size=16,
                                weight=ft.FontWeight.W_600,
                                color=ft.Colors.GREY_800,
                            ),
                            ft.Text(
                                f"YOA {current_yoa}",
                                size=11,
                                color=ft.Colors.GREY_500,
                            ),
                        ],
                        spacing=2,
                        expand=True,
                    ),
                    # User info
                    ft.Column(
                        controls=[
                            ft.Text(
                                taxpayer_name,
                                size=13,
                                weight=ft.FontWeight.W_500,
                                color=ft.Colors.GREY_800,
                                text_align=ft.TextAlign.RIGHT,
                            ),
                            ft.Text(
                                tin_display,
                                size=11,
                                color=ft.Colors.GREY_500,
                                text_align=ft.TextAlign.RIGHT,
                            ),
                        ],
                        spacing=2,
                        horizontal_alignment=ft.CrossAxisAlignment.END,
                    ),
                    # Avatar
                    ft.Container(
                        content=ft.Text(
                            avatar_initials,
                            size=14,
                            weight=ft.FontWeight.BOLD,
                            color=ft.Colors.WHITE,
                        ),
                        width=36,
                        height=36,
                        border_radius=18,
                        bgcolor=ft.Colors.BLUE_800,
                        alignment=ft.Alignment.CENTER,
                    ),
                ],
                alignment=ft.MainAxisAlignment.SPACE_BETWEEN,
                vertical_alignment=ft.CrossAxisAlignment.CENTER,
            ),
            padding=ft.Padding.symmetric(horizontal=24, vertical=14),
            bgcolor=ft.Colors.WHITE,
            shadow=ft.BoxShadow(
                blur_radius=4,
                offset=ft.Offset(0, 2),
                color=ft.Colors.with_opacity(0.08, ft.Colors.BLACK),
            ),
        )






