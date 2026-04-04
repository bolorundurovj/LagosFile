import re

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from tortoise import Tortoise

from lagosfile.models import (
    Filing,
    IncomeEntry,
    Taxpayer,
)
from lagosfile.services.filing_service import FilingService


@pytest.fixture(autouse=True)
async def tortoise_db():
    await Tortoise.init(
        db_url="sqlite://:memory:",
        modules={"models": ["lagosfile.models"]},
    )
    await Tortoise.generate_schemas()
    yield
    await Tortoise.close_connections()


async def _get_or_create_taxpayer() -> Taxpayer:
    taxpayer, _ = await Taxpayer.get_or_create(
        tin="1234567890123",
        defaults={"full_name": "Test User"},
    )
    return taxpayer


@given(yoa=st.integers(min_value=2000, max_value=2050))
@settings(max_examples=25, suppress_health_check=[HealthCheck.function_scoped_fixture])
async def test_property_18_duplicate_increments_yoa(tortoise_db, yoa):
    taxpayer = await _get_or_create_taxpayer()
    svc = FilingService()
    filing = await svc.create_draft(str(taxpayer.id), yoa)
    await IncomeEntry.create(
        filing=filing,
        income_type="employment",
        gross_amount_ngn=5_000_000.0,
    )
    await IncomeEntry.create(
        filing=filing,
        income_type="rental",
        gross_amount_ngn=1_200_000.0,
    )
    confirmed = await svc.confirm(str(filing.id))
    duplicate = await svc.duplicate(str(confirmed.id))
    assert duplicate.year_of_assessment == yoa + 1
    assert duplicate.status == "Draft"
    new_entries = await IncomeEntry.filter(filing_id=duplicate.id)
    assert len(new_entries) == 2


@given(yoa=st.integers(min_value=2000, max_value=2050))
@settings(max_examples=25, suppress_health_check=[HealthCheck.function_scoped_fixture])
async def test_property_19_amendment_immutability(tortoise_db, yoa):
    taxpayer = await _get_or_create_taxpayer()
    svc = FilingService()
    filing = await svc.create_draft(str(taxpayer.id), yoa)
    confirmed = await svc.confirm(str(filing.id))
    original_id = str(confirmed.id)
    original_status = confirmed.status
    original_reference = confirmed.filing_reference
    original_yoa = confirmed.year_of_assessment
    amendment = await svc.amend(str(confirmed.id))
    assert amendment.status == "Draft"
    assert str(amendment.parent_filing_id) == original_id
    original_refetched = await Filing.get(id=confirmed.id)
    assert original_refetched.status == original_status
    assert original_refetched.filing_reference == original_reference
    assert original_refetched.year_of_assessment == original_yoa
    assert original_refetched.confirmed_at is not None


REFERENCE_PATTERN = re.compile(r"^LIRS/REF/(\d{4})/(\d{5})$")


@given(yoa=st.integers(min_value=2000, max_value=2050))
@settings(max_examples=25, suppress_health_check=[HealthCheck.function_scoped_fixture])
async def test_property_20_filing_reference_format(tortoise_db, yoa):
    taxpayer = await _get_or_create_taxpayer()
    svc = FilingService()
    filing = await svc.create_draft(str(taxpayer.id), yoa)
    confirmed = await svc.confirm(str(filing.id))
    ref = confirmed.filing_reference
    assert ref is not None, "filing_reference must not be None after confirm"
    match = REFERENCE_PATTERN.match(ref)
    assert match is not None, f"filing_reference '{ref}' does not match LIRS/REF/YYYY/NNNNN"
    ref_yoa = int(match.group(1))
    ref_seq = match.group(2)
    assert ref_yoa == yoa, f"Reference YOA {ref_yoa} does not match filing YOA {yoa}"
    assert len(ref_seq) == 5, f"Sequential part '{ref_seq}' is not 5 digits"
    assert ref_seq.isdigit(), f"Sequential part '{ref_seq}' contains non-digit characters"
