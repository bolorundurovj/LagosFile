"""
TortoiseORM models for LagosFile.

All ORM models follow the design document exactly.
Provides init_db() and serialize_db() for the encrypted in-memory SQLite session.

Requirements: 14.1
"""

import sqlite3
from dataclasses import dataclass, field
from typing import Optional
from tortoise import fields
from tortoise.models import Model


# ---------------------------------------------------------------------------
# Plain dataclasses used by services (not ORM models)
# ---------------------------------------------------------------------------


@dataclass
class TaxpayerPydantic:
    """Plain-data representation of a Taxpayer (used by ProfileService)."""

    tin: str
    full_name: str
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    filing_agent: Optional[str] = None


@dataclass
class TaxCalculationResult:
    """Result returned by TaxCalculator.calculate_tax()."""

    taxable_income: float
    total_income: float
    total_allowances: float
    income_tax: float
    cgt_tax: float
    tax_payable: float
    effective_rate: float
    adjusted_income: float
    total_tax: float = 0.0
    total_relief: float = 0.0


# ---------------------------------------------------------------------------
# ORM Models
# ---------------------------------------------------------------------------


class Taxpayer(Model):
    id = fields.UUIDField(primary_key=True)
    full_name = fields.CharField(max_length=255)
    tin = fields.CharField(max_length=13, unique=True)
    address = fields.TextField(null=True)
    phone = fields.CharField(max_length=20, null=True)
    email = fields.CharField(max_length=255, null=True)
    filing_agent = fields.CharField(max_length=255, null=True)
    created_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "taxpayer"


class Filing(Model):
    id = fields.UUIDField(primary_key=True)
    taxpayer = fields.ForeignKeyField("models.Taxpayer", related_name="filings")
    parent_filing = fields.ForeignKeyField(
        "models.Filing", null=True, related_name="amendments"
    )
    year_of_assessment = fields.IntField()
    status = fields.CharField(
        max_length=20, default="Draft"
    )  # Draft|Confirmed|Submitted
    filing_reference = fields.CharField(max_length=30, null=True)
    created_at = fields.DatetimeField(auto_now_add=True)
    confirmed_at = fields.DatetimeField(null=True)
    total_income_ngn = fields.FloatField(null=True)
    chargeable_income = fields.FloatField(null=True)
    tax_payable = fields.FloatField(null=True)
    wht_credit = fields.FloatField(null=True)
    net_tax_payable = fields.FloatField(null=True)
    minimum_tax = fields.FloatField(null=True)
    final_tax_payable = fields.FloatField(null=True)
    tax_config_version = fields.CharField(max_length=100)

    class Meta:
        table = "filing"


class IncomeEntry(Model):
    id = fields.UUIDField(primary_key=True)
    filing = fields.ForeignKeyField("models.Filing", related_name="income_entries")
    income_type = fields.CharField(max_length=50)
    description = fields.TextField(null=True)
    gross_amount_ngn = fields.FloatField()
    is_foreign = fields.BooleanField(default=False)
    foreign_currency = fields.CharField(max_length=3, null=True)
    foreign_amount = fields.FloatField(null=True)
    income_date = fields.DateField(null=True)
    fx_rate_fetched = fields.FloatField(null=True)
    fx_rate_cbn_override = fields.FloatField(null=True)
    fx_rate_used = fields.FloatField(null=True)
    fx_rate_source = fields.CharField(max_length=30, null=True)
    foreign_tax_paid_ngn = fields.FloatField(null=True)
    is_cgt_exempt = fields.BooleanField(default=False)
    cgt_proceeds = fields.FloatField(null=True)
    cgt_gain = fields.FloatField(null=True)

    class Meta:
        table = "income_entry"


class CapitalAllowance(Model):
    id = fields.UUIDField(primary_key=True)
    filing = fields.ForeignKeyField("models.Filing", related_name="capital_allowances")
    asset_description = fields.CharField(max_length=255)
    asset_type = fields.CharField(max_length=50)
    asset_cost = fields.FloatField()
    acquisition_date = fields.DateField()
    tax_written_down_value = fields.FloatField()
    annual_allowance_rate = fields.FloatField()
    annual_allowance_amount = fields.FloatField()

    class Meta:
        table = "capital_allowance"


class ReliefEntry(Model):
    id = fields.UUIDField(primary_key=True)
    filing = fields.ForeignKeyField("models.Filing", related_name="relief_entries")
    relief_type = fields.CharField(max_length=50)
    claimed_amount = fields.FloatField()
    approved_amount = fields.FloatField()
    wht_ref = fields.CharField(max_length=100, null=True)
    wht_income_type = fields.CharField(max_length=50, null=True)
    wht_date = fields.DateField(null=True)

    class Meta:
        table = "relief_entry"


class FXCache(Model):
    id = fields.UUIDField(primary_key=True)
    base_currency = fields.CharField(max_length=3)
    quote_currency = fields.CharField(max_length=3)
    rate = fields.FloatField()
    rate_date = fields.DateField()
    source = fields.CharField(max_length=30)
    fetched_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "fx_cache"
        unique_together = (("base_currency", "quote_currency", "rate_date", "source"),)


class Document(Model):
    id = fields.UUIDField(primary_key=True)
    parent_entry_id = fields.UUIDField()
    parent_entry_type = fields.CharField(
        max_length=30
    )  # income_entry|capital_allowance|relief_entry
    file_path = fields.TextField()
    file_name = fields.CharField(max_length=255)
    file_type = fields.CharField(max_length=10)
    file_size_bytes = fields.IntField()
    uploaded_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "document"


class TaxConfigModel(Model):
    id = fields.UUIDField(primary_key=True)
    version_label = fields.CharField(max_length=100)
    governed_by = fields.CharField(max_length=100)
    band_thresholds = fields.JSONField()
    relief_caps = fields.JSONField()
    cgt_thresholds = fields.JSONField()
    allowance_rates = fields.JSONField()
    minimum_tax_rate = fields.FloatField()
    is_active = fields.BooleanField(default=False)
    last_modified = fields.DatetimeField(auto_now=True)
    modified_by = fields.CharField(max_length=100, default="system")

    class Meta:
        table = "tax_config"


# ---------------------------------------------------------------------------
# TortoiseORM configuration — in-memory SQLite for the session
# ---------------------------------------------------------------------------

TORTOISE_ORM = {
    "connections": {
        "default": "sqlite://:memory:"
    },  # in-memory; backed by encrypted file
    "apps": {
        "models": {
            "models": ["lagosfile.models"],
            "default_connection": "default",
        }
    },
}


# ---------------------------------------------------------------------------
# DB lifecycle helpers
# ---------------------------------------------------------------------------


async def init_db(plaintext_bytes: bytes) -> None:
    """Load decrypted database bytes into the in-memory SQLite and initialise ORM.

    If *plaintext_bytes* is non-empty it is deserialized into the in-memory
    connection so that existing data is available immediately.  An empty bytes
    value (first run) causes generate_schemas() to create a fresh schema.

    Args:
        plaintext_bytes: Raw SQLite database bytes obtained after Fernet
                         decryption, or b"" on first run.
    """
    from tortoise import Tortoise

    await Tortoise.init(config=TORTOISE_ORM)

    if plaintext_bytes:
        # Deserialize the existing database into the in-memory connection.
        # aiosqlite runs sqlite3 in a worker thread; use _execute() to call
        # deserialize() safely from within that thread.
        conn = Tortoise.get_connection("default")
        async with conn.acquire_connection() as aio_conn:

            def _deserialize(data: bytes) -> None:
                aio_conn._conn.deserialize(data)  # type: ignore[attr-defined]

            await aio_conn._execute(_deserialize, plaintext_bytes)  # type: ignore[attr-defined]

    await Tortoise.generate_schemas(safe=True)


async def serialize_db() -> bytes:
    """Serialize the in-memory SQLite database to bytes for re-encryption.

    Returns:
        Raw SQLite database bytes ready to be passed to encrypt_db().
    """
    from tortoise import Tortoise

    conn = Tortoise.get_connection("default")
    async with conn.acquire_connection() as aio_conn:

        def _serialize() -> bytes:
            return aio_conn._conn.serialize()  # type: ignore[attr-defined]

        return await aio_conn._execute(_serialize)  # type: ignore[attr-defined]




