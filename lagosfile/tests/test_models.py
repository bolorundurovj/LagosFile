import pytest
from tortoise import Tortoise

from lagosfile.models import (
    TORTOISE_ORM,
    CapitalAllowance,
    Document,
    Filing,
    FXCache,
    IncomeEntry,
    ReliefEntry,
    TaxConfigModel,
    Taxpayer,
    init_db,
    serialize_db,
)


async def _teardown():
    await Tortoise.close_connections()


def test_tortoise_orm_config_exists():
    assert isinstance(TORTOISE_ORM, dict)


def test_tortoise_orm_uses_in_memory_sqlite():
    url = TORTOISE_ORM["connections"]["default"]
    assert url == "sqlite://:memory:"


def test_tortoise_orm_references_lagosfile_models():
    app_models = TORTOISE_ORM["apps"]["models"]["models"]
    assert "lagosfile.models" in app_models


def test_taxpayer_has_required_fields():
    field_names = set(Taxpayer._meta.fields_map.keys())
    for f in (
        "id",
        "full_name",
        "tin",
        "address",
        "phone",
        "email",
        "filing_agent",
        "created_at",
    ):
        assert f in field_names, f"Taxpayer missing field: {f}"


def test_filing_has_required_fields():
    field_names = set(Filing._meta.fields_map.keys())
    for f in (
        "id",
        "year_of_assessment",
        "status",
        "filing_reference",
        "created_at",
        "confirmed_at",
        "total_income_ngn",
        "chargeable_income",
        "tax_payable",
        "wht_credit",
        "net_tax_payable",
        "minimum_tax",
        "final_tax_payable",
        "tax_config_version",
    ):
        assert f in field_names, f"Filing missing field: {f}"


def test_income_entry_has_required_fields():
    field_names = set(IncomeEntry._meta.fields_map.keys())
    for f in (
        "id",
        "income_type",
        "description",
        "gross_amount_ngn",
        "is_foreign",
        "foreign_currency",
        "foreign_amount",
        "income_date",
        "fx_rate_fetched",
        "fx_rate_cbn_override",
        "fx_rate_used",
        "fx_rate_source",
        "foreign_tax_paid_ngn",
        "is_cgt_exempt",
        "cgt_proceeds",
        "cgt_gain",
    ):
        assert f in field_names, f"IncomeEntry missing field: {f}"


def test_capital_allowance_has_required_fields():
    field_names = set(CapitalAllowance._meta.fields_map.keys())
    for f in (
        "id",
        "asset_description",
        "asset_type",
        "asset_cost",
        "acquisition_date",
        "tax_written_down_value",
        "annual_allowance_rate",
        "annual_allowance_amount",
    ):
        assert f in field_names, f"CapitalAllowance missing field: {f}"


def test_relief_entry_has_required_fields():
    field_names = set(ReliefEntry._meta.fields_map.keys())
    for f in (
        "id",
        "relief_type",
        "claimed_amount",
        "approved_amount",
        "wht_ref",
        "wht_income_type",
        "wht_date",
    ):
        assert f in field_names, f"ReliefEntry missing field: {f}"


def test_fx_cache_has_required_fields():
    field_names = set(FXCache._meta.fields_map.keys())
    for f in (
        "id",
        "base_currency",
        "quote_currency",
        "rate",
        "rate_date",
        "source",
        "fetched_at",
    ):
        assert f in field_names, f"FXCache missing field: {f}"


def test_document_has_required_fields():
    field_names = set(Document._meta.fields_map.keys())
    for f in (
        "id",
        "parent_entry_id",
        "parent_entry_type",
        "file_path",
        "file_name",
        "file_type",
        "file_size_bytes",
        "uploaded_at",
    ):
        assert f in field_names, f"Document missing field: {f}"


def test_tax_config_model_has_required_fields():
    field_names = set(TaxConfigModel._meta.fields_map.keys())
    for f in (
        "id",
        "version_label",
        "governed_by",
        "band_thresholds",
        "relief_caps",
        "cgt_thresholds",
        "allowance_rates",
        "minimum_tax_rate",
        "is_active",
        "last_modified",
        "modified_by",
    ):
        assert f in field_names, f"TaxConfigModel missing field: {f}"


@pytest.mark.asyncio
async def test_init_db_creates_schemas_on_fresh_db():
    try:
        await init_db(b"")
        data = await serialize_db()
        assert isinstance(data, bytes)
        assert len(data) > 0
    finally:
        await _teardown()


@pytest.mark.asyncio
async def test_serialize_then_init_round_trip():
    try:
        await init_db(b"")
        await TaxConfigModel.create(
            version_label="v1.0",
            governed_by="NTA 2025",
            band_thresholds=[],
            relief_caps={},
            cgt_thresholds={},
            allowance_rates={},
            minimum_tax_rate=0.01,
            is_active=True,
        )
        assert await TaxConfigModel.all().count() == 1
        snapshot = await serialize_db()
    finally:
        await _teardown()
    try:
        await init_db(snapshot)
        assert await TaxConfigModel.all().count() == 1
        cfg = await TaxConfigModel.first()
        assert cfg.version_label == "v1.0"
    finally:
        await _teardown()
