import string

import hypothesis.strategies as st
import pytest
from hypothesis import given, settings
from tortoise import Tortoise

from lagosfile.models import Taxpayer


@pytest.fixture(autouse=True)
async def tortoise_db():
    await Tortoise.init(
        db_url="sqlite://:memory:",
        modules={"models": ["lagosfile.models"]},
    )
    await Tortoise.generate_schemas()
    yield
    await Tortoise.close_connections()


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
    await Taxpayer.filter(tin=tin).delete()
    created = await Taxpayer.create(
        full_name=full_name,
        tin=tin,
        address=address,
        phone=phone,
        email=email,
        filing_agent=filing_agent,
    )
    try:
        fetched = await Taxpayer.get(id=created.id)
        assert fetched.full_name == full_name
        assert fetched.tin == tin
        assert fetched.address == address
        assert fetched.phone == phone
        assert fetched.email == email
        assert fetched.filing_agent == filing_agent
    finally:
        await created.delete()
