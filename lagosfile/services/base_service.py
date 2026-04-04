from abc import ABC, abstractmethod

from tortoise import Tortoise


class BaseService(ABC):
    """Base service class for common functionality."""

    @abstractmethod
    async def initialize(self) -> None:
        """Initialize the service."""
        pass

    @abstractmethod
    async def _re_encrypt_db(self) -> None:
        """Re-serialize and re-encrypt the database."""
        # This would trigger the database encryption logic
        pass


class BaseAsyncService(BaseService):
    """Base async service class."""

    async def initialize(self) -> None:
        """Initialize the async service."""
        await Tortoise.init(db_url="sqlite://:memory:", modules={"models": ["lagosfile.models"]})
        await Tortoise.generate_schemas()
