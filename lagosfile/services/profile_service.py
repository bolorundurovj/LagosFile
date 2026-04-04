from typing import Optional, Dict, Any
from lagosfile.models import Taxpayer, TaxpayerPydantic, serialize_db  # noqa: F401
from lagosfile.security import security_service, atomic_write
from lagosfile.constants import Constants
import datetime
import asyncio
from tortoise import Tortoise, run_async


class ProfileService:
    def __init__(self):
        self._current_taxpayer = None

    async def create(self, data: Dict[str, Any], pin: str) -> Taxpayer:
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
        taxpayer = await Taxpayer.create(
            tin=tin,
            full_name=data.get("name", ""),
            address=data.get("address"),
            phone=data.get("phone"),
            email=data.get("email"),
            filing_agent=data.get("filing_agent"),
        )

        # Derive encryption key from PIN using the persisted salt
        from lagosfile.security import load_or_create_salt, derive_key as _derive_key
        salt = load_or_create_salt()
        key = _derive_key(pin, salt)

        # Serialize in-memory DB and encrypt to disk
        await self._encrypt_and_save_db(key)

        self._current_taxpayer = taxpayer
        return taxpayer

    async def get(self) -> Optional[Taxpayer]:
        """Get the current taxpayer profile"""
        if not self._current_taxpayer:
            # Try to load from database
            taxpayer = await Taxpayer.all().first()
            if taxpayer:
                self._current_taxpayer = taxpayer
        return self._current_taxpayer

    async def update(self, data: Dict[str, Any]) -> Taxpayer:
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
        """Serialize the in-memory SQLite, encrypt it, and write to disk atomically."""
        Constants.ensure_dirs()
        plaintext = await serialize_db()
        ciphertext = security_service.encrypt_db(plaintext, key)
        atomic_write(ciphertext, Constants.ENCRYPTED_DB)

    def create_sync(self, data: Dict[str, Any], pin: str) -> Taxpayer:
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
                tin=tin, full_name=data.get("name", ""), created_at=datetime.datetime.now()
            )
        )

        # Derive encryption key from PIN
        key = security_service.derive_key(pin)

        # Encrypt and save database
        run_async(self._encrypt_and_save_db(key))

        self._current_taxpayer = taxpayer
        return taxpayer

    def get_sync(self) -> Optional[Taxpayer]:
        """Sync wrapper for get"""
        if not self._current_taxpayer:
            taxpayer = run_async(Taxpayer.all().first())
            if taxpayer:
                self._current_taxpayer = taxpayer
        return self._current_taxpayer

    def update_sync(self, data: Dict[str, Any]) -> Taxpayer:
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
