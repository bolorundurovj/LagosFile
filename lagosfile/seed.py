"""
Seed script — populates the migrations database with initial data.

Run once after `aerich init-db` (or `aerich upgrade`) to insert the NTA 2025
default Tax_Config record.

Usage:
    python -m lagosfile.seed
"""

import asyncio
import uuid

from tortoise import Tortoise

from lagosfile.db_config import TORTOISE_ORM_SEED
from lagosfile.models import TaxConfigModel
from lagosfile.services.config_engine import NTA_2025_CONFIG, _config_to_model_fields


async def seed() -> None:
    await Tortoise.init(config=TORTOISE_ORM_SEED)
    await Tortoise.generate_schemas(safe=True)

    existing = await TaxConfigModel.filter(is_active=True).count()
    if existing:
        print("Seed skipped — active Tax_Config already exists.")
        await Tortoise.close_connections()
        return

    fields = _config_to_model_fields(NTA_2025_CONFIG)
    fields["id"] = uuid.uuid4()
    await TaxConfigModel.create(**fields)
    print(f"Seeded Tax_Config: {NTA_2025_CONFIG.version_label}")

    await Tortoise.close_connections()


if __name__ == "__main__":
    asyncio.run(seed())
