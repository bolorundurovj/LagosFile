import hypothesis.strategies as st
from hypothesis import given, settings, example
import pytest
from lagosfile.services.profile_service import ProfileService
from lagosfile.models import Taxpayer, TaxpayerPydantic
import asyncio
from tortoise import Tortoise, run_async


# Context manager for test execution
class TestContext:
    def __init__(self):
        self.service = ProfileService()

    async def __aenter__(self):
        await Tortoise.init(
            db_url="sqlite://:memory:",
            modules={"models": ["lagosfile.models"]},
        )
        await Tortoise.generate_schemas()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if Tortoise._inited:
            await Taxpayer.all().delete()
            await Tortoise.close_connections()
            # Reset the Tortoise state properly through context
            Tortoise._apps = None
            Tortoise._connections = None
            # Tortoise._inited should be managed by the context system


# Fixture for the service
@pytest.fixture
def profile_service():
    """Provide a single ProfileService instance for the test"""
    return ProfileService()


# Property 2: Profile persistence round-trip
def test_profile_persistence_round_trip():
    """Test that creating and retrieving a profile preserves the data"""

    async def test_operations():
        async with TestContext() as ctx:
            # Create profile data with specific examples
            name = "John Doe"
            tin = "1234567890123"
            profile_data = {"name": name, "tin": tin}

            # Create profile
            pin = "1234"  # Test PIN
            created_taxpayer = await ctx.service.create(profile_data, pin)

            # Get profile
            retrieved_taxpayer = await ctx.service.get()

            # Update profile and test again
            updated_name = f"Updated {name}"
            updated_data = {"name": updated_name}
            updated_taxpayer = await ctx.service.update(updated_data)

            # Verify update worked
            assert updated_taxpayer.name == updated_name
            assert updated_taxpayer.tin == tin
            assert updated_taxpayer.id == created_taxpayer.id

            # Get again to verify persistence
            final_taxpayer = await ctx.service.get()
            assert final_taxpayer.name == updated_name
            assert final_taxpayer.tin == tin
            assert final_taxpayer.id == created_taxpayer.id

    asyncio.run(test_operations())


# Property 3: Profile creation fails with duplicate TIN
def test_profile_creation_fails_with_duplicate_tin():
    """Test that creating a profile with duplicate TIN fails"""

    async def test_operations():
        async with TestContext() as ctx:
            # Create profile data with specific examples
            name = "John Doe"
            tin = "1234567890123"
            profile_data = {"name": name, "tin": tin}

            # First creation should succeed
            pin = "1234"
            await ctx.service.create(profile_data, pin)

            # Second creation with same TIN should fail
            try:
                await ctx.service.create(profile_data, pin)
                assert False, "Expected duplicate TIN error"
            except ValueError as e:
                assert "already exists" in str(e).lower()

    asyncio.run(test_operations())
