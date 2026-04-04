from abc import ABC, abstractmethod

from tortoise import Tortoise


class BaseService(ABC):
    @abstractmethod
    async def initialize(self) -> None:
        pass

    @abstractmethod
    async def _re_encrypt_db(self) -> None:
        pass


class BaseAsyncService(BaseService):
    async def initialize(self) -> None:
        await Tortoise.init(db_url="sqlite://:memory:", modules={"models": ["lagosfile.models"]})
        await Tortoise.generate_schemas()
