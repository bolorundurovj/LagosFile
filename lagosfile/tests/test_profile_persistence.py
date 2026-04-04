"""
Property test for profile persistence round-trip.

# Feature: lagos-file, Property 2: Profile persistence round-trip

For any valid profile (name + TIN + optional fields) saved to the encrypted
database, reading it back should return a profile with identical field values.

Validates: Requirements 1.3, 1.7
"""

import string

import hypothesis.strategies as st
import pytest
from hypothesis import given, settings
from tortoise import Tortoise

from lagosfile.models import Taxpayer

# ---------------------------------------------------------------------------
# DB fixture — init a fresh in-memory DB before each test, tear down after
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
async def tortoise_db():
    """Initialise a fresh in-memory Tortoise DB for each test and close after."""
    await Tortoise.init(
        db_url="sqlite://:memory:",
        modules={"models": ["lagosfile.models"]},
    )
    await Tortoise.generate_schemas()
    yield
    await Tortoise.close_connections()


# ---------------------------------------------------------------------------
# Property 2: Profile persistence round-trip
# Validates: Requirements 1.3, 1.7
# ---------------------------------------------------------------------------


@given(
    full_name=st.text(min_size=1, max_size=255),
    tin=st.text(alphabet=string.digits, min_size=13, max_size=13),
    address=st.one_of(st.none(), st.text(max_size=200)),
    phone=st.one_of(st.none(), st.text(max_size=20)),
    email=st.one_of(st.none(), st.text(max_size=255)),
    filing_agent=st.one_of(st.none(), st.text(max_size=255)),
)
@settings(max_examples=25)
async def test_profile_persistence_round_trip(
    full_name: str,
    tin: str,
    address,
    phone,
    email,
    filing_agent,
):
    """
    For any valid profile saved to the DB, reading it back returns identical
    field values.

    Validates: Requirements 1.3, 1.7
    """
    # Clean up any leftover record with this TIN from a prior example
    await Taxpayer.filter(tin=tin).delete()

    # Save the profile
    created = await Taxpayer.create(
        full_name=full_name,
        tin=tin,
        address=address,
        phone=phone,
        email=email,
        filing_agent=filing_agent,
    )

    try:
        # Read it back by primary key
        fetched = await Taxpayer.get(id=created.id)

        # All fields must be identical
        assert fetched.full_name == full_name
        assert fetched.tin == tin
        assert fetched.address == address
        assert fetched.phone == phone
        assert fetched.email == email
        assert fetched.filing_agent == filing_agent
    finally:
        # Clean up so the next example starts fresh
        await created.delete()
