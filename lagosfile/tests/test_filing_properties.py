"""
Property-based tests for FilingService — filing lifecycle properties.

Properties 18, 19, 20.

Requirements: 10.4, 10.5, 10.8
"""

# Feature: lagos-file, Property 18: Filing duplicate increments YOA
# Feature: lagos-file, Property 19: Amendment immutability
# Feature: lagos-file, Property 20: Filing reference format

import re
import pytest
from tortoise import Tortoise

from hypothesis import given, settings, HealthCheck
from hypothesis import strategies as st

from lagosfile.models import (
    Filing,
    IncomeEntry,
    Taxpayer,
)
from lagosfile.services.filing_service import FilingService


# ---------------------------------------------------------------------------
# DB fixture — one fresh in-memory DB per test function
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
async def tortoise_db():
    """Fresh in-memory DB per test."""
    await Tortoise.init(
        db_url="sqlite://:memory:",
        modules={"models": ["lagosfile.models"]},
    )
    await Tortoise.generate_schemas()
    yield
    await Tortoise.close_connections()


# ---------------------------------------------------------------------------
# Helper: get-or-create a taxpayer (Hypothesis runs multiple examples
# within the same DB session, so the TIN unique constraint would fire
# on the second example if we always INSERT).
# ---------------------------------------------------------------------------

async def _get_or_create_taxpayer() -> Taxpayer:
    taxpayer, _ = await Taxpayer.get_or_create(
        tin="1234567890123",
        defaults={"full_name": "Test User"},
    )
    return taxpayer


# ---------------------------------------------------------------------------
# Property 18: Filing duplicate increments YOA
# Validates: Requirements 10.4
# ---------------------------------------------------------------------------

@given(yoa=st.integers(min_value=2000, max_value=2050))
@settings(max_examples=25, suppress_health_check=[HealthCheck.function_scoped_fixture])
async def test_property_18_duplicate_increments_yoa(tortoise_db, yoa):
    """
    For any confirmed filing with YOA Y, duplicating it produces a new Draft
    with YOA = Y + 1, with income entries carried forward.

    **Validates: Requirements 10.4**
    """
    taxpayer = await _get_or_create_taxpayer()
    svc = FilingService()

    # Create and confirm a filing with income entries
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

    # Duplicate the confirmed filing
    duplicate = await svc.duplicate(str(confirmed.id))

    # YOA must be incremented by 1
    assert duplicate.year_of_assessment == yoa + 1

    # New filing must be a Draft
    assert duplicate.status == "Draft"

    # Income entries must be carried forward
    new_entries = await IncomeEntry.filter(filing_id=duplicate.id)
    assert len(new_entries) == 2


# ---------------------------------------------------------------------------
# Property 19: Amendment immutability
# Validates: Requirements 10.5
# ---------------------------------------------------------------------------

@given(yoa=st.integers(min_value=2000, max_value=2050))
@settings(max_examples=25, suppress_health_check=[HealthCheck.function_scoped_fixture])
async def test_property_19_amendment_immutability(tortoise_db, yoa):
    """
    For any confirmed filing, creating an amendment produces a new filing with
    parent_filing_id pointing to the original, while the original's status and
    fields remain unchanged.

    **Validates: Requirements 10.5**
    """
    taxpayer = await _get_or_create_taxpayer()
    svc = FilingService()

    # Create and confirm a filing
    filing = await svc.create_draft(str(taxpayer.id), yoa)
    confirmed = await svc.confirm(str(filing.id))

    # Snapshot original state before amendment
    original_id = str(confirmed.id)
    original_status = confirmed.status
    original_reference = confirmed.filing_reference
    original_yoa = confirmed.year_of_assessment

    # Create amendment
    amendment = await svc.amend(str(confirmed.id))

    # Amendment must be a new Draft linked to the original
    assert amendment.status == "Draft"
    assert str(amendment.parent_filing_id) == original_id

    # Re-fetch original from DB to verify it is unchanged
    original_refetched = await Filing.get(id=confirmed.id)
    assert original_refetched.status == original_status
    assert original_refetched.filing_reference == original_reference
    assert original_refetched.year_of_assessment == original_yoa
    # confirmed_at must still be set (not cleared)
    assert original_refetched.confirmed_at is not None


# ---------------------------------------------------------------------------
# Property 20: Filing reference format
# Validates: Requirements 10.8
# ---------------------------------------------------------------------------

REFERENCE_PATTERN = re.compile(r"^LIRS/REF/(\d{4})/(\d{5})$")


@given(yoa=st.integers(min_value=2000, max_value=2050))
@settings(max_examples=25, suppress_health_check=[HealthCheck.function_scoped_fixture])
async def test_property_20_filing_reference_format(tortoise_db, yoa):
    """
    For any confirmed filing, the generated filing_reference matches
    LIRS/REF/YYYY/NNNNN where YYYY is the YOA and NNNNN is a zero-padded
    5-digit sequential number.

    **Validates: Requirements 10.8**
    """
    taxpayer = await _get_or_create_taxpayer()
    svc = FilingService()

    filing = await svc.create_draft(str(taxpayer.id), yoa)
    confirmed = await svc.confirm(str(filing.id))

    ref = confirmed.filing_reference
    assert ref is not None, "filing_reference must not be None after confirm"

    match = REFERENCE_PATTERN.match(ref)
    assert match is not None, (
        f"filing_reference '{ref}' does not match LIRS/REF/YYYY/NNNNN"
    )

    ref_yoa = int(match.group(1))
    ref_seq = match.group(2)

    # YYYY must equal the YOA
    assert ref_yoa == yoa, (
        f"Reference YOA {ref_yoa} does not match filing YOA {yoa}"
    )

    # NNNNN must be exactly 5 digits (zero-padded)
    assert len(ref_seq) == 5, (
        f"Sequential part '{ref_seq}' is not 5 digits"
    )
    assert ref_seq.isdigit(), (
        f"Sequential part '{ref_seq}' contains non-digit characters"
    )
