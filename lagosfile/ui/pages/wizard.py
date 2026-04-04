"""
Filing Wizard container — four-step guided filing wizard.

Renders a vertical progress stepper and hosts the active step component.
Wires Back/Continue buttons to AppState step transitions and FilingService.

Requirements: 3.2, 3.3, 3.4, 3.6, 3.7
"""

from __future__ import annotations

import flet as ft

from lagosfile.services.filing_service import FilingService
from lagosfile.state import advance_step, go_back
from lagosfile.ui.components.sidebar import Sidebar
from lagosfile.ui.components.topbar import TopBar

_STEPS = [
    (1, "Income Sources"),
    (2, "Capital Allowances"),
    (3, "Deductions & Reliefs"),
    (4, "Review & Confirm"),
]


class WizardPage(ft.BaseControl):
    """Four-step filing wizard container.

    Requirements: 3.2, 3.3, 3.4, 3.6, 3.7
    """

    def __init__(self, page: ft.Page) -> None:
        super().__init__()
        self.page = page
        self._filing_service = FilingService()

    def build(self) -> ft.Control:
        sidebar = Sidebar(self.page, active_route="/wizard")
        topbar = TopBar(self.page, title="New Filing Wizard")

        app_state = self.page.data
        current_step = app_state.current_step if app_state else 1

        stepper = self._build_stepper(current_step)
        step_content = self._build_step_content(current_step)
        nav_buttons = self._build_nav_buttons(current_step)

        main_content = ft.Column(
            controls=[
                topbar,
                ft.Container(
                    content=ft.Row(
                        controls=[
                            # Left: vertical stepper
                            ft.Container(
                                content=stepper,
                                width=220,
                                padding=ft.padding.all(20),
                                bgcolor=ft.Colors.WHITE,
                                border=ft.border.only(right=ft.BorderSide(1, ft.Colors.GREY_200)),
                            ),
                            # Right: step content + nav
                            ft.Container(
                                content=ft.Column(
                                    controls=[
                                        ft.Container(
                                            content=step_content,
                                            expand=True,
                                            padding=ft.padding.all(24),
                                        ),
                                        ft.Divider(height=1, color=ft.Colors.GREY_200),
                                        ft.Container(
                                            content=nav_buttons,
                                            padding=ft.padding.symmetric(horizontal=24, vertical=16),
                                        ),
                                    ],
                                    expand=True,
                                    spacing=0,
                                ),
                                expand=True,
                            ),
                        ],
                        expand=True,
                        spacing=0,
                    ),
                    expand=True,
                ),
            ],
            expand=True,
            spacing=0,
        )

        return ft.Row(
            controls=[sidebar, main_content],
            expand=True,
            spacing=0,
        )

    def _build_stepper(self, current_step: int) -> ft.Control:
        """Vertical progress stepper showing all four steps."""
        items = []
        for step_num, step_label in _STEPS:
            if step_num < current_step:
                state = "done"
                icon = ft.Icons.CHECK_CIRCLE
                icon_color = ft.Colors.GREEN_600
                label_color = ft.Colors.GREY_600
            elif step_num == current_step:
                state = "active"
                icon = ft.Icons.RADIO_BUTTON_CHECKED
                icon_color = ft.Colors.BLUE_800
                label_color = ft.Colors.BLUE_900
            else:
                state = "pending"
                icon = ft.Icons.RADIO_BUTTON_UNCHECKED
                icon_color = ft.Colors.GREY_400
                label_color = ft.Colors.GREY_400

            items.append(
                ft.Row(
                    controls=[
                        ft.Icon(icon, color=icon_color, size=20),
                        ft.Column(
                            controls=[
                                ft.Text(
                                    f"Step {step_num}",
                                    size=10,
                                    color=ft.Colors.GREY_500,
                                ),
                                ft.Text(
                                    step_label,
                                    size=13,
                                    color=label_color,
                                    weight=(ft.FontWeight.W_500 if state == "active" else ft.FontWeight.NORMAL),
                                ),
                            ],
                            spacing=1,
                        ),
                    ],
                    spacing=10,
                )
            )

            # Connector line between steps
            if step_num < len(_STEPS):
                items.append(
                    ft.Container(
                        width=2,
                        height=24,
                        bgcolor=(ft.Colors.GREEN_400 if step_num < current_step else ft.Colors.GREY_300),
                        margin=ft.margin.only(left=9),
                    )
                )

        return ft.Column(
            controls=[
                ft.Text(
                    "Filing Progress",
                    size=13,
                    weight=ft.FontWeight.W_600,
                    color=ft.Colors.GREY_700,
                ),
                ft.Divider(height=12, color=ft.Colors.TRANSPARENT),
                *items,
            ],
            spacing=4,
        )

    def _build_step_content(self, current_step: int) -> ft.Control:
        """Load the appropriate step component."""
        try:
            if current_step == 1:
                from lagosfile.ui.pages.wizard_income import IncomeSourcesStep

                return IncomeSourcesStep(self.page)
            elif current_step == 2:
                from lagosfile.ui.pages.wizard_allowances import CapitalAllowancesStep

                return CapitalAllowancesStep(self.page)
            elif current_step == 3:
                from lagosfile.ui.pages.wizard_deductions import DeductionsReliefsStep

                return DeductionsReliefsStep(self.page)
            elif current_step == 4:
                from lagosfile.ui.pages.wizard_review import ReviewConfirmStep

                return ReviewConfirmStep(self.page)
        except Exception as exc:
            return ft.Text(f"Error loading step {current_step}: {exc}", color=ft.Colors.RED_400)

        return ft.Text("Unknown step", color=ft.Colors.RED_400)

    def _build_nav_buttons(self, current_step: int) -> ft.Control:
        back_btn = ft.OutlinedButton(
            "Back",
            icon=ft.Icons.ARROW_BACK,
            disabled=(current_step == 1),
            on_click=self._on_back,
        )

        continue_label = "Continue" if current_step < 4 else "Review & Confirm"
        continue_btn = ft.ElevatedButton(
            continue_label,
            icon=ft.Icons.ARROW_FORWARD,
            style=ft.ButtonStyle(
                bgcolor=ft.Colors.BLUE_800,
                color=ft.Colors.WHITE,
            ),
            on_click=self._on_continue,
        )

        save_btn = ft.TextButton(
            "Save for Later",
            icon=ft.Icons.SAVE_OUTLINED,
            on_click=self._on_save_later,
        )

        return ft.Row(
            controls=[back_btn, ft.Container(expand=True), save_btn, continue_btn],
            alignment=ft.MainAxisAlignment.SPACE_BETWEEN,
        )

    async def _on_continue(self, e) -> None:
        """Flush current step data and advance to the next step."""
        app_state = self.page.data
        if app_state is None:
            return
        try:
            await advance_step(app_state, self._filing_service)
        except Exception:
            pass
        # Rebuild the wizard with the new step
        self.page.go(self.page.route)

    def _on_back(self, e) -> None:
        """Navigate back to the previous step without data loss."""
        app_state = self.page.data
        if app_state is None:
            return
        go_back(app_state)
        self.page.go(self.page.route)

    async def _on_save_later(self, e) -> None:
        """Save current step data as a Draft without advancing."""
        app_state = self.page.data
        if app_state is None or app_state.active_filing is None:
            return
        try:
            from lagosfile.state import _STEP_DATA_KEYS

            step = app_state.current_step
            key = _STEP_DATA_KEYS.get(step)
            if key:
                step_data = {key: getattr(app_state.wizard_data, key)}
                await self._filing_service.save_step(str(app_state.active_filing.id), step_data)
        except Exception:
            pass
        self.page.go("/dashboard")
