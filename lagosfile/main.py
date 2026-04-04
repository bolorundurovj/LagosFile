from __future__ import annotations

import flet as ft

from lagosfile.constants import Constants
from lagosfile.security import decrypt_db, derive_key, load_or_create_salt
from lagosfile.services.config_engine import ConfigEngine
from lagosfile.services.profile_service import ProfileService
from lagosfile.state import AppState, WizardDraft


class PinEntryPage(ft.BaseControl):
    def __init__(self, page: ft.Page) -> None:
        super().__init__()
        self.page = page
        self._pin_field = ft.TextField(
            label="Enter PIN",
            password=True,
            can_reveal_password=True,
            width=300,
            on_submit=self._on_submit,
        )
        self._error_text = ft.Text("", color=ft.Colors.RED_400, size=13)
        self._loading = ft.ProgressRing(visible=False, width=24, height=24)

    def build(self) -> ft.Control:
        return ft.Column(
            controls=[
                ft.Container(
                    content=ft.Column(
                        controls=[
                            ft.Text(
                                "LagosFile",
                                size=28,
                                weight=ft.FontWeight.BOLD,
                                color=ft.Colors.BLUE_800,
                            ),
                            ft.Text(
                                "Enter your PIN to unlock",
                                size=14,
                                color=ft.Colors.GREY_600,
                            ),
                            ft.Divider(height=20, color=ft.Colors.TRANSPARENT),
                            self._pin_field,
                            self._error_text,
                            ft.Row(
                                controls=[
                                    ft.ElevatedButton(
                                        "Unlock",
                                        on_click=self._on_submit,
                                        style=ft.ButtonStyle(
                                            bgcolor=ft.Colors.BLUE_800,
                                            color=ft.Colors.WHITE,
                                        ),
                                    ),
                                    self._loading,
                                ],
                                spacing=12,
                            ),
                        ],
                        horizontal_alignment=ft.CrossAxisAlignment.CENTER,
                        spacing=12,
                    ),
                    padding=40,
                    border_radius=12,
                    bgcolor=ft.Colors.WHITE,
                    shadow=ft.BoxShadow(
                        blur_radius=20,
                        color=ft.Colors.with_opacity(0.1, ft.Colors.BLACK),
                    ),
                    width=400,
                )
            ],
            alignment=ft.MainAxisAlignment.CENTER,
            horizontal_alignment=ft.CrossAxisAlignment.CENTER,
            expand=True,
        )

    async def _on_submit(self, e) -> None:
        pin = self._pin_field.value or ""
        if not pin:
            self._error_text.value = "PIN is required."
            self.update()
            return
        self._loading.visible = True
        self._error_text.value = ""
        self.update()
        try:
            salt = load_or_create_salt()
            fernet_key = derive_key(pin, salt)
            enc_path = Constants.ENCRYPTED_DB
            if enc_path.exists():
                ciphertext = enc_path.read_bytes()
                decrypt_db(ciphertext, fernet_key)  # raises InvalidToken on wrong PIN
            from tortoise import Tortoise

            await Tortoise.init(
                db_url="sqlite://:memory:",
                modules={"models": ["lagosfile.models"]},
            )
            await Tortoise.generate_schemas()
            config_engine = ConfigEngine()
            active_config = await config_engine.get_active_config()
            profile_service = ProfileService()
            taxpayer = await profile_service.get()
            app_state = AppState(
                taxpayer=taxpayer,
                active_filing=None,
                active_config=active_config,
                current_step=1,
                wizard_data=WizardDraft(),
            )
            self.page.data = app_state
            if taxpayer is None:
                self.page.go("/setup")
            else:
                self.page.go("/")
        except Exception as exc:
            from cryptography.fernet import InvalidToken

            if isinstance(exc, InvalidToken):
                self._error_text.value = "Incorrect PIN. Please try again."
            else:
                self._error_text.value = f"Error: {exc}"
        finally:
            self._loading.visible = False
            self.update()


class ProfileSetupPage(ft.BaseControl):
    def __init__(self, page: ft.Page) -> None:
        super().__init__()
        self.page = page
        self._name_field = ft.TextField(label="Full Name *", width=340)
        self._tin_field = ft.TextField(
            label="TIN (13 digits) *",
            width=340,
            hint_text="e.g. 1234567890123",
            max_length=13,
        )
        self._address_field = ft.TextField(label="Lagos Address (optional)", width=340)
        self._phone_field = ft.TextField(label="Phone Number (optional)", width=340)
        self._email_field = ft.TextField(label="Email Address (optional)", width=340)
        self._agent_field = ft.TextField(label="Filing Agent Name/Company (optional)", width=340)
        self._pin_field = ft.TextField(
            label="Set PIN *",
            password=True,
            can_reveal_password=True,
            width=340,
        )
        self._pin_confirm_field = ft.TextField(
            label="Confirm PIN *",
            password=True,
            can_reveal_password=True,
            width=340,
        )
        self._error_text = ft.Text("", color=ft.Colors.RED_400, size=13)
        self._loading = ft.ProgressRing(visible=False, width=24, height=24)

    def build(self) -> ft.Control:
        return ft.Column(
            controls=[
                ft.Container(
                    content=ft.Column(
                        controls=[
                            ft.Text(
                                "Create Your Taxpayer Profile",
                                size=22,
                                weight=ft.FontWeight.BOLD,
                                color=ft.Colors.BLUE_800,
                            ),
                            ft.Text(
                                "This information will be used on all filings and exports.",
                                size=13,
                                color=ft.Colors.GREY_600,
                            ),
                            ft.Divider(height=10, color=ft.Colors.TRANSPARENT),
                            self._name_field,
                            self._tin_field,
                            ft.Text(
                                "TIN must be exactly 13 digits (numbers only).",
                                size=11,
                                color=ft.Colors.GREY_500,
                                italic=True,
                            ),
                            self._address_field,
                            self._phone_field,
                            self._email_field,
                            self._agent_field,
                            ft.Divider(height=8),
                            ft.Text(
                                "Set a PIN to protect your data",
                                size=14,
                                weight=ft.FontWeight.W_500,
                            ),
                            self._pin_field,
                            self._pin_confirm_field,
                            self._error_text,
                            ft.Row(
                                controls=[
                                    ft.ElevatedButton(
                                        "Create Profile",
                                        on_click=self._on_submit,
                                        style=ft.ButtonStyle(
                                            bgcolor=ft.Colors.BLUE_800,
                                            color=ft.Colors.WHITE,
                                        ),
                                    ),
                                    self._loading,
                                ],
                                spacing=12,
                            ),
                        ],
                        spacing=10,
                        scroll=ft.ScrollMode.AUTO,
                    ),
                    padding=40,
                    border_radius=12,
                    bgcolor=ft.Colors.WHITE,
                    shadow=ft.BoxShadow(
                        blur_radius=20,
                        color=ft.Colors.with_opacity(0.1, ft.Colors.BLACK),
                    ),
                    width=440,
                )
            ],
            alignment=ft.MainAxisAlignment.CENTER,
            horizontal_alignment=ft.CrossAxisAlignment.CENTER,
            expand=True,
        )

    async def _on_submit(self, e) -> None:
        name = (self._name_field.value or "").strip()
        tin = (self._tin_field.value or "").strip()
        pin = self._pin_field.value or ""
        pin_confirm = self._pin_confirm_field.value or ""
        if not name:
            self._show_error("Full Name is required.")
            return
        if not tin:
            self._show_error("TIN is required.")
            return
        if not tin.isdigit() or len(tin) != 13:
            self._show_error("TIN must be exactly 13 digits (numbers only).")
            return
        if not pin:
            self._show_error("PIN is required.")
            return
        if pin != pin_confirm:
            self._show_error("PINs do not match.")
            return
        self._loading.visible = True
        self._error_text.value = ""
        self.update()
        try:
            profile_service = ProfileService()
            profile_data = {
                "name": name,
                "tin": tin,
                "address": self._address_field.value or None,
                "phone": self._phone_field.value or None,
                "email": self._email_field.value or None,
                "filing_agent": self._agent_field.value or None,
            }
            taxpayer = await profile_service.create(profile_data, pin)
            if self.page.data:
                self.page.data.taxpayer = taxpayer
            self.page.go("/")
        except ValueError as exc:
            self._show_error(str(exc))
        except Exception as exc:
            self._show_error(f"Unexpected error: {exc}")
        finally:
            self._loading.visible = False
            self.update()

    def _show_error(self, msg: str) -> None:
        self._error_text.value = msg
        self.update()


def main(page: ft.Page) -> None:
    page.title = "LagosFile"
    page.theme_mode = ft.ThemeMode.LIGHT
    page.bgcolor = ft.Colors.GREY_100
    page.padding = 0
    from lagosfile.ui.pages.config import ConfigurationPage
    from lagosfile.ui.pages.dashboard import DashboardPage
    from lagosfile.ui.pages.history import FilingHistoryPage
    from lagosfile.ui.pages.lirs_integration import LIRSIntegrationPage
    from lagosfile.ui.pages.wizard import WizardPage

    def route_change(e: ft.RouteChangeEvent) -> None:
        page.views.clear()
        route = page.route
        if route == "/pin" or route == "/":
            if not Constants.ENCRYPTED_DB.exists():
                page.views.append(
                    ft.View(
                        "/setup",
                        controls=[ProfileSetupPage(page)],
                        bgcolor=ft.Colors.GREY_100,
                    )
                )
            else:
                page.views.append(
                    ft.View(
                        "/pin",
                        controls=[PinEntryPage(page)],
                        bgcolor=ft.Colors.GREY_100,
                    )
                )
        elif route == "/setup":
            page.views.append(
                ft.View(
                    "/setup",
                    controls=[ProfileSetupPage(page)],
                    bgcolor=ft.Colors.GREY_100,
                )
            )
        elif route == "/dashboard" or (route == "/" and page.data is not None):
            page.views.append(
                ft.View(
                    "/dashboard",
                    controls=[DashboardPage(page)],
                    padding=0,
                    bgcolor=ft.Colors.GREY_100,
                )
            )
        elif route.startswith("/wizard"):
            page.views.append(
                ft.View(
                    route,
                    controls=[WizardPage(page)],
                    padding=0,
                    bgcolor=ft.Colors.GREY_100,
                )
            )
        elif route == "/history":
            page.views.append(
                ft.View(
                    "/history",
                    controls=[FilingHistoryPage(page)],
                    padding=0,
                    bgcolor=ft.Colors.GREY_100,
                )
            )
        elif route == "/config":
            page.views.append(
                ft.View(
                    "/config",
                    controls=[ConfigurationPage(page)],
                    padding=0,
                    bgcolor=ft.Colors.GREY_100,
                )
            )
        elif route.startswith("/lirs"):
            page.views.append(
                ft.View(
                    route,
                    controls=[LIRSIntegrationPage(page)],
                    padding=0,
                    bgcolor=ft.Colors.GREY_100,
                )
            )
        page.update()

    def view_pop(e: ft.ViewPopEvent) -> None:
        page.views.pop()
        top_view = page.views[-1]
        page.go(top_view.route)

    page.on_route_change = route_change
    page.on_view_pop = view_pop
    page.push_route("/")


if __name__ == "__main__":
    ft.run(main=main)
