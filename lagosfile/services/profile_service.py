import datetime
from typing import Any

from tortoise import run_async

from lagosfile.constants import Constants
from lagosfile.models import (  # noqa: F401 – TaxpayerPydantic re-exported
    Taxpayer,
    TaxpayerPydantic,
)
from lagosfile.security import security_service


class ProfileService:
    def __init__(self):
        self._current_taxpayer = None

    async def create(self, data: dict[str, Any], pin: str) -> Taxpayer:
        tin = data.get("tin", "").strip()
        if not tin.isdigit():
            raise ValueError("TIN must contain only digits")
        if len(tin) != 13:
            raise ValueError("TIN must be exactly 13 digits")
        existing = await Taxpayer.filter(tin=tin).first()
        if existing:
            raise ValueError(f"TIN {tin} already exists")
        taxpayer = await Taxpayer.create(tin=tin, full_name=data.get("name", ""), created_at=datetime.datetime.now())
        key = security_service.derive_key(pin)
        await self._encrypt_and_save_db(key)
        self._current_taxpayer = taxpayer
        return taxpayer

    async def get(self) -> Taxpayer | None:
        if not self._current_taxpayer:
            taxpayer = await Taxpayer.all().first()
            if taxpayer:
                self._current_taxpayer = taxpayer
        return self._current_taxpayer

    async def update(self, data: dict[str, Any]) -> Taxpayer:
        if not self._current_taxpayer:
            raise ValueError("No taxpayer profile exists")
        update_data = {}
        if "name" in data:
            update_data["full_name"] = data["name"]
        await self._current_taxpayer.update_from_dict(update_data)
        await self._current_taxpayer.save()
        return self._current_taxpayer

    async def _encrypt_and_save_db(self, key: bytes):
        Constants.ensure_dirs()

    def create_sync(self, data: dict[str, Any], pin: str) -> Taxpayer:
        tin = data.get("tin", "").strip()
        if not tin.isdigit():
            raise ValueError("TIN must contain only digits")
        if len(tin) != 13:
            raise ValueError("TIN must be exactly 13 digits")
        existing = run_async(Taxpayer.filter(tin=tin).first())
        if existing:
            raise ValueError(f"TIN {tin} already exists")
        taxpayer = run_async(
            Taxpayer.create(
                tin=tin,
                full_name=data.get("name", ""),
                created_at=datetime.datetime.now(),
            )
        )
        key = security_service.derive_key(pin)
        run_async(self._encrypt_and_save_db(key))
        self._current_taxpayer = taxpayer
        return taxpayer

    def get_sync(self) -> Taxpayer | None:
        if not self._current_taxpayer:
            taxpayer = run_async(Taxpayer.all().first())
            if taxpayer:
                self._current_taxpayer = taxpayer
        return self._current_taxpayer

    def update_sync(self, data: dict[str, Any]) -> Taxpayer:
        if not self._current_taxpayer:
            raise ValueError("No taxpayer profile exists")
        update_data = {}
        if "name" in data:
            update_data["full_name"] = data["name"]
        run_async(self._current_taxpayer.update_from_dict(update_data))
        run_async(self._current_taxpayer.save())
        return self._current_taxpayer

    def _encrypt_and_save_db_sync(self, key: bytes):
        Constants.ensure_dirs()


profile_service = ProfileService()
