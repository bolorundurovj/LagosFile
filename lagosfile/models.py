from tortoise import fields, models
from tortoise.contrib.pydantic import pydantic_model_creator
from datetime import datetime
from typing import Optional, List
from lagosfile.constants import Constants


# ORM Models
class Taxpayer(models.Model):
    id = fields.IntField(pk=True)
    tin = fields.CharField(max_length=13, unique=True)
    name = fields.CharField(max_length=255)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "taxpayer"


class Filing(models.Model):
    id = fields.IntField(pk=True)
    taxpayer = fields.ForeignKeyField("models.Taxpayer", related_name="filings")
    yoa = fields.IntField()
    status = fields.CharField(
        max_length=20, default="Draft"
    )  # Draft, Confirmed, Submitted
    confirmed_at = fields.DatetimeField(null=True)
    filing_reference = fields.CharField(max_length=50, null=True)
    parent_filing_id = fields.IntField(null=True)
    tax_config_version = fields.CharField(max_length=50, null=True)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "filing"


class IncomeEntry(models.Model):
    id = fields.IntField(pk=True)
    filing = fields.ForeignKeyField("models.Filing", related_name="income_entries")
    income_type = fields.CharField(max_length=50)
    description = fields.CharField(max_length=255)
    gross_amount_ngn = fields.DecimalField(max_digits=15, decimal_places=2)
    foreign_currency = fields.CharField(max_length=3, null=True)
    foreign_amount = fields.DecimalField(max_digits=15, decimal_places=2, null=True)
    date = fields.DateField()
    fetched_fx_rate = fields.DecimalField(max_digits=10, decimal_places=6, null=True)
    cbn_override_rate = fields.DecimalField(max_digits=10, decimal_places=6, null=True)
    rate_source = fields.CharField(max_length=50, null=True)
    benefits_in_kind = fields.DecimalField(max_digits=15, decimal_places=2, default=0)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "income_entry"


class CapitalAllowance(models.Model):
    id = fields.IntField(pk=True)
    filing = fields.ForeignKeyField("models.Filing", related_name="capital_allowances")
    asset_type = fields.CharField(max_length=50)
    asset_cost = fields.DecimalField(max_digits=15, decimal_places=2)
    date_acquired = fields.DateField()
    annual_allowance_rate = fields.DecimalField(max_digits=5, decimal_places=4)
    annual_allowance_amount = fields.DecimalField(max_digits=15, decimal_places=2)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "capital_allowance"


class ReliefEntry(models.Model):
    id = fields.IntField(pk=True)
    filing = fields.ForeignKeyField("models.Filing", related_name="relief_entries")
    relief_type = fields.CharField(max_length=50)
    amount = fields.DecimalField(max_digits=15, decimal_places=2)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "relief_entry"


class FXCache(models.Model):
    id = fields.IntField(pk=True)
    base_currency = fields.CharField(max_length=3)
    quote_currency = fields.CharField(max_length=3)
    date = fields.DateField()
    rate = fields.DecimalField(max_digits=10, decimal_places=6)
    source = fields.CharField(max_length=50)
    created_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "fx_cache"
        unique_together = ("base_currency", "quote_currency", "date")


class Document(models.Model):
    id = fields.IntField(pk=True)
    entry = fields.ForeignKeyField(
        "models.IncomeEntry", related_name="documents", null=True
    )
    filing = fields.ForeignKeyField(
        "models.Filing", related_name="documents", null=True
    )
    file_path = fields.CharField(max_length=512)
    file_name = fields.CharField(max_length=255)
    file_size = fields.IntField()
    created_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "document"


class TaxConfigModel(models.Model):
    id = fields.IntField(pk=True)
    version_label = fields.CharField(max_length=50)
    is_active = fields.BooleanField(default=False)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    # Tax bands configuration
    bands = fields.JSONField()

    # Allowance rates
    allowance_rates = fields.JSONField()

    # Rent relief cap
    rent_relief_cap = fields.DecimalField(max_digits=15, decimal_places=2)

    # CGT thresholds
    cgt_proceeds_threshold = fields.DecimalField(max_digits=15, decimal_places=2)
    cgt_gain_threshold = fields.DecimalField(max_digits=15, decimal_places=2)

    # Minimum tax rate
    minimum_tax_rate = fields.DecimalField(max_digits=5, decimal_places=4)

    class Meta:
        table = "tax_config"


# Pydantic models for serialization
TaxpayerPydantic = pydantic_model_creator(Taxpayer, name="Taxpayer")
FilingPydantic = pydantic_model_creator(Filing, name="Filing")
IncomeEntryPydantic = pydantic_model_creator(IncomeEntry, name="IncomeEntry")
CapitalAllowancePydantic = pydantic_model_creator(
    CapitalAllowance, name="CapitalAllowance"
)
ReliefEntryPydantic = pydantic_model_creator(ReliefEntry, name="ReliefEntry")
FXCachePydantic = pydantic_model_creator(FXCache, name="FXCache")
DocumentPydantic = pydantic_model_creator(Document, name="Document")
TaxConfigModelPydantic = pydantic_model_creator(TaxConfigModel, name="TaxConfigModel")

# Database configuration
TORTOISE_ORM = {
    "connections": {"default": "sqlite://:memory:"},
    "apps": {
        "models": {
            "models": [
                "lagosfile.models",
            ],
            "default_connection": "default",
        }
    },
}


async def init_db(plaintext_bytes: bytes):
    """Initialize database with decrypted bytes"""
    from tortoise import Tortoise

    await Tortoise.init(config=TORTOISE_ORM)
    await Tortoise.generate_schemas()


async def serialize_db() -> bytes:
    """Serialize in-memory SQLite database for re-encryption"""
    # In-memory SQLite doesn't support direct serialization
    # This would typically dump the database to a temporary file
    # For this implementation, we'll return empty bytes as a placeholder
    return b""
