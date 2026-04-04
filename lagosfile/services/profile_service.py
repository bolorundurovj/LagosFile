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
        """Create a new taxpayer profile with TIN validation and DB encryption"""
        # Validate TIN (exactly 13 digits)
        tin = data.get("tin", "").strip()
        if not tin.isdigit():
            raise ValueError("TIN must contain only digits")
        if len(tin) != 13:
            raise ValueError("TIN must be exactly 13 digits")

        # Check if TIN already exists
        existing = await Taxpayer.filter(tin=tin).first()
        if existing:
            raise ValueError(f"TIN {tin} already exists")

        # Create taxpayer record
        taxpayer = await Taxpayer.create(tin=tin, full_name=data.get("name", ""), created_at=datetime.datetime.now())

        # Derive encryption key from PIN
        key = security_service.derive_key(pin)

        # Encrypt and save database (placeholder - in-memory DB doesn't support direct encryption)
        # In a real implementation, this would serialize the DB and encrypt it
        await self._encrypt_and_save_db(key)

        self._current_taxpayer = taxpayer
        return taxpayer

    async def get(self) -> Taxpayer | None:
        """Get the current taxpayer profile"""
        if not self._current_taxpayer:
            # Try to load from database
            taxpayer = await Taxpayer.all().first()
            if taxpayer:
                self._current_taxpayer = taxpayer
        return self._current_taxpayer

    async def update(self, data: dict[str, Any]) -> Taxpayer:
        """Update the current taxpayer profile"""
        if not self._current_taxpayer:
            raise ValueError("No taxpayer profile exists")

        # Update fields
        update_data = {}
        if "name" in data:
            update_data["full_name"] = data["name"]

        await self._current_taxpayer.update_from_dict(update_data)
        await self._current_taxpayer.save()

        return self._current_taxpayer

    async def _encrypt_and_save_db(self, key: bytes):
        """Encrypt and save the database (placeholder implementation)"""
        # In a real implementation, this would:
        # 1. Serialize the in-memory SQLite database
        # 2. Encrypt it with the provided key
        # 3. Save to the encrypted DB file
        # For this implementation, we'll just ensure the base directory exists
        Constants.ensure_dirs()

    def create_sync(self, data: dict[str, Any], pin: str) -> Taxpayer:
        """Sync wrapper for create"""
        # Validate TIN (exactly 13 digits)
        tin = data.get("tin", "").strip()
        if not tin.isdigit():
            raise ValueError("TIN must contain only digits")
        if len(tin) != 13:
            raise ValueError("TIN must be exactly 13 digits")

        # Check if TIN already exists
        existing = run_async(Taxpayer.filter(tin=tin).first())
        if existing:
            raise ValueError(f"TIN {tin} already exists")

        # Create taxpayer record
        taxpayer = run_async(
            Taxpayer.create(
                tin=tin,
                full_name=data.get("name", ""),
                created_at=datetime.datetime.now(),
            )
        )

        # Derive encryption key from PIN
        key = security_service.derive_key(pin)

        # Encrypt and save database
        run_async(self._encrypt_and_save_db(key))

        self._current_taxpayer = taxpayer
        return taxpayer

    def get_sync(self) -> Taxpayer | None:
        """Sync wrapper for get"""
        if not self._current_taxpayer:
            taxpayer = run_async(Taxpayer.all().first())
            if taxpayer:
                self._current_taxpayer = taxpayer
        return self._current_taxpayer

    def update_sync(self, data: dict[str, Any]) -> Taxpayer:
        """Sync wrapper for update"""
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


# Global instance
profile_service = ProfileService()
