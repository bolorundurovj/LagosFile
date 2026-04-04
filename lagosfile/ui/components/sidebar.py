"""
Sidebar navigation component.

Fixed left sidebar with LagosFile logo, navigation links, and a support card.

Requirements: 2.1
"""

from __future__ import annotations

import flet as ft


# Navigation items: (label, icon, route)
_NAV_ITEMS = [
    ("Dashboard", ft.Icons.DASHBOARD_OUTLINED, "/dashboard"),
    ("New Filing", ft.Icons.ADD_CIRCLE_OUTLINE, "/wizard"),
    ("Filing History", ft.Icons.HISTORY, "/history"),
    ("Configuration", ft.Icons.SETTINGS_OUTLINED, "/config"),
    ("Settings", ft.Icons.MANAGE_ACCOUNTS_OUTLINED, "/settings"),
]


class Sidebar(ft.Container):
    """Fixed left sidebar with navigation links.

    Requirements: 2.1
    """

    def __init__(self, page: ft.Page, active_route: str = "/dashboard") -> None:
        super().__init__()
        self._page = page
        self.expand = True
        self.active_route = active_route
        self.content = self.build()

    def build(self) -> ft.Control:
        nav_items = [
            self._nav_item(label, icon, route) for label, icon, route in _NAV_ITEMS
        ]

        support_card = ft.Container(
            content=ft.Column(
                controls=[
                    ft.Icon(ft.Icons.HELP_OUTLINE, color=ft.Colors.BLUE_200, size=20),
                    ft.Text(
                        "Need help?",
                        size=12,
                        color=ft.Colors.WHITE,
                        weight=ft.FontWeight.W_500,
                    ),
                    ft.Text(
                        "Visit the LIRS website or consult a tax advisor.",
                        size=10,
                        color=ft.Colors.BLUE_100,
                    ),
                ],
                spacing=4,
            ),
            padding=ft.Padding.all(12),
            border_radius=8,
            bgcolor=ft.Colors.with_opacity(0.15, ft.Colors.WHITE),
            margin=ft.Margin.only(top=8),
        )

        return ft.Container(
            content=ft.Column(
                controls=[
                    # Logo
                    ft.Container(
                        content=ft.Row(
                            controls=[
                                ft.Icon(
                                    ft.Icons.RECEIPT_LONG,
                                    color=ft.Colors.WHITE,
                                    size=28,
                                ),
                                ft.Text(
                                    "LagosFile",
                                    size=20,
                                    weight=ft.FontWeight.BOLD,
                                    color=ft.Colors.WHITE,
                                ),
                            ],
                            spacing=8,
                        ),
                        padding=ft.Padding.only(bottom=24, top=8),
                    ),
                    # Navigation links
                    ft.Column(controls=nav_items, spacing=4),
                    # Spacer
                    ft.Container(expand=True),
                    # Support card at bottom
                    support_card,
                ],
                expand=True,
            ),
            width=220,
            bgcolor=ft.Colors.BLUE_900,
            padding=ft.Padding.symmetric(horizontal=16, vertical=20),
        )

    def _nav_item(self, label: str, icon: str, route: str) -> ft.Control:
        is_active = self.active_route == route
        return ft.Container(
            content=ft.Row(
                controls=[
                    ft.Icon(
                        icon,
                        color=ft.Colors.WHITE if is_active else ft.Colors.BLUE_200,
                        size=18,
                    ),
                    ft.Text(
                        label,
                        size=13,
                        color=ft.Colors.WHITE if is_active else ft.Colors.BLUE_100,
                        weight=ft.FontWeight.W_500
                        if is_active
                        else ft.FontWeight.NORMAL,
                    ),
                ],
                spacing=10,
            ),
            padding=ft.Padding.symmetric(horizontal=12, vertical=10),
            border_radius=8,
            bgcolor=ft.Colors.with_opacity(0.2, ft.Colors.WHITE)
            if is_active
            else ft.Colors.TRANSPARENT,
            on_click=lambda e, r=route: self._page.push_route(r),
            ink=True,
        )






