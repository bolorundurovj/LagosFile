"""
LagosFile — Flet desktop app entry point.

Handles app routing, PIN entry, and first-run profile setup.

Routes:
  /pin   — PIN prompt on every launch (PinEntryPage)
  /setup — First-run profile creation (ProfileSetupPage)
  /      — Dashboard (after successful PIN entry)

Requirements: 1.1, 1.2, 14.2, 14.3, 14.4
"""

from __future__ import annotations

import asyncio

import flet as ft

from lagosfile.constants import Constants
from lagosfile.security import load_or_create_salt, derive_key, decrypt_db, encrypt_db, atomic_write
from lagosfile.models import init_db, serialize_db
from lagosfile.services.config_engine import ConfigEngine
from lagosfile.services.profile_service import ProfileService
from lagosfile.state import AppState, WizardDraft


# ---------------------------------------------------------------------------
# PinEntryPage
# ---------------------------------------------------------------------------


class PinEntryPage(ft.Container):
    """PIN prompt shown on every app launch.

    Derives the Fernet key from the entered PIN, decrypts the DB,
    initialises TortoiseORM, loads AppState, then navigates to the Dashboard.

    Requirements: 14.3, 14.4
    """

    def __init__(self, page: ft.Page) -> None:
        super().__init__()
        self._page = page
        self.expand = True
        self._pin_field = ft.TextField(
            label="Enter PIN",
            password=True,
            can_reveal_password=True,
            width=300,
            on_submit=self._on_submit,
        )
        self._error_text = ft.Text("", color=ft.Colors.RED_400, size=13)
        self._loading = ft.ProgressRing(visible=False, width=24, height=24)
        self.content = self.build()

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
                                    ft.Button(
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
        """Validate PIN, decrypt DB, init ORM, navigate to dashboard."""
        pin = self._pin_field.value or ""
        if not pin:
            self._error_text.value = "PIN is required."
            self._page.update()
            return

        self._loading.visible = True
        self._error_text.value = ""
        self._page.update()

        try:
            salt = load_or_create_salt()
            fernet_key = derive_key(pin, salt)

            enc_path = Constants.ENCRYPTED_DB
            plaintext_bytes = b""
            if enc_path.exists():
                ciphertext = enc_path.read_bytes()
                plaintext_bytes = decrypt_db(ciphertext, fernet_key)  # raises InvalidToken on wrong PIN

            # Load decrypted bytes into in-memory SQLite and initialise ORM
            await init_db(plaintext_bytes)

            # Seed NTA 2025 config if this is a fresh DB
            from lagosfile.services.config_engine import ConfigEngine as _CE
            from lagosfile.models import TaxConfigModel
            if await TaxConfigModel.all().count() == 0:
                from lagosfile.services.config_engine import NTA_2025_CONFIG, _config_to_model_fields
                import uuid
                fields = _config_to_model_fields(NTA_2025_CONFIG)
                fields["id"] = uuid.uuid4()
                await TaxConfigModel.create(**fields)

            # Load AppState
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
            self._page.data = app_state

            # Store fernet_key on page for subsequent DB saves
            self._page.session.set("fernet_key", fernet_key)

            if taxpayer is None:
                await self._page.push_route("/setup")
            else:
                await self._page.push_route("/dashboard")

        except Exception as exc:
            from cryptography.fernet import InvalidToken

            if isinstance(exc, InvalidToken):
                self._error_text.value = "Incorrect PIN. Please try again."
            else:
                self._error_text.value = f"Error: {exc}"
        finally:
            self._loading.visible = False
            self._page.update()


# ---------------------------------------------------------------------------
# ProfileSetupPage
# ---------------------------------------------------------------------------


class ProfileSetupPage(ft.Container):
    """First-run profile creation and PIN setup.

    Shown when no taxpayer profile exists. Collects name, TIN, optional
    fields, and PIN, then calls ProfileService.create().

    Requirements: 1.1, 1.2, 1.3, 1.4
    """

    def __init__(self, page: ft.Page) -> None:
        super().__init__()
        self._page = page
        self.expand = True

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
        self._agent_field = ft.TextField(
            label="Filing Agent Name/Company (optional)", width=340
        )
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
        self.content = self.build()

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
                                    ft.Button(
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
        """Validate inputs and create the taxpayer profile."""
        name = (self._name_field.value or "").strip()
        tin = (self._tin_field.value or "").strip()
        pin = self._pin_field.value or ""
        pin_confirm = self._pin_confirm_field.value or ""

        # Basic validation
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
        self._page.update()

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

            # Store fernet_key on session for subsequent DB saves
            from lagosfile.security import load_or_create_salt, derive_key
            salt = load_or_create_salt()
            fernet_key = derive_key(pin, salt)
            self._page.session.set("fernet_key", fernet_key)

            # Initialise AppState if not already set (first run via setup page)
            if not self._page.data:
                from lagosfile.services.config_engine import ConfigEngine
                from lagosfile.state import AppState, WizardDraft
                config_engine = ConfigEngine()
                active_config = await config_engine.get_active_config()
                self._page.data = AppState(
                    taxpayer=taxpayer,
                    active_filing=None,
                    active_config=active_config,
                    current_step=1,
                    wizard_data=WizardDraft(),
                )
            else:
                self._page.data.taxpayer = taxpayer

            await self._page.push_route("/dashboard")

        except ValueError as exc:
            self._show_error(str(exc))
        except Exception as exc:
            self._show_error(f"Unexpected error: {exc}")
        finally:
            self._loading.visible = False
            self._page.update()

    def _show_error(self, msg: str) -> None:
        self._error_text.value = msg
        self._page.update()


# ---------------------------------------------------------------------------
# App entry point
# ---------------------------------------------------------------------------


async def main(page: ft.Page) -> None:
    """Flet app entry point — sets up routing and initial navigation."""
    page.title = "LagosFile"
    page.theme_mode = ft.ThemeMode.LIGHT
    page.bgcolor = ft.Colors.GREY_100
    page.padding = 0
    page.window.width = 1280
    page.window.height = 800
    page.window.center()

    # Lazy imports to avoid circular deps at module level
    from lagosfile.ui.pages.dashboard import DashboardPage
    from lagosfile.ui.pages.wizard import WizardPage
    from lagosfile.ui.pages.history import FilingHistoryPage
    from lagosfile.ui.pages.config import ConfigurationPage
    from lagosfile.ui.pages.lirs_integration import LIRSIntegrationPage

    async def route_change(e: ft.RouteChangeEvent) -> None:
        page.views.clear()

        route = page.route

        if route == "/pin" or route == "/":
            # Check if DB exists; if not, initialise ORM fresh and go to setup
            if not Constants.ENCRYPTED_DB.exists():
                from tortoise import Tortoise
                try:
                    await Tortoise.init(
                        db_url="sqlite://:memory:",
                        modules={"models": ["lagosfile.models"]},
                    )
                    await Tortoise.generate_schemas()
                except Exception:
                    pass  # already initialised
                page.views.append(
                    ft.View(
                        route="/setup",
                        controls=[ProfileSetupPage(page)],
                        bgcolor=ft.Colors.GREY_100,
                    )
                )
            else:
                page.views.append(
                    ft.View(
                        route="/pin",
                        controls=[PinEntryPage(page)],
                        bgcolor=ft.Colors.GREY_100,
                    )
                )

        elif route == "/setup":
            page.views.append(
                ft.View(
                    route="/setup",
                    controls=[ProfileSetupPage(page)],
                    bgcolor=ft.Colors.GREY_100,
                )
            )

        elif route == "/dashboard" or (route == "/" and page.data is not None):
            page.views.append(
                ft.View(
                    route="/dashboard",
                    controls=[DashboardPage(page)],
                    padding=0,
                    bgcolor=ft.Colors.GREY_100,
                )
            )

        elif route.startswith("/wizard"):
            page.views.append(
                ft.View(
                    route=route,
                    controls=[WizardPage(page)],
                    padding=0,
                    bgcolor=ft.Colors.GREY_100,
                )
            )

        elif route == "/history":
            page.views.append(
                ft.View(
                    route="/history",
                    controls=[FilingHistoryPage(page)],
                    padding=0,
                    bgcolor=ft.Colors.GREY_100,
                )
            )

        elif route == "/config":
            page.views.append(
                ft.View(
                    route="/config",
                    controls=[ConfigurationPage(page)],
                    padding=0,
                    bgcolor=ft.Colors.GREY_100,
                )
            )

        elif route.startswith("/lirs"):
            page.views.append(
                ft.View(
                    route=route,
                    controls=[LIRSIntegrationPage(page)],
                    padding=0,
                    bgcolor=ft.Colors.GREY_100,
                )
            )

        page.update()

    async def view_pop(e: ft.ViewPopEvent) -> None:
        page.views.pop()
        top_view = page.views[-1]
        await page.push_route(top_view.route)

    page.on_route_change = route_change
    page.on_view_pop = view_pop

    # Start at PIN entry (or setup if first run)
    await page.push_route("/pin")


if __name__ == "__main__":
    ft.run(main=main)




