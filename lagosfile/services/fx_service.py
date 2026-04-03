from typing import Optional, Tuple
from dataclasses import dataclass
import httpx
from datetime import datetime
from lagosfile.models import FXCache
from lagosfile.services.base_service import BaseAsyncService


@dataclass
class FXResult:
    rate: Optional[float]
    source: str
    is_cached: bool = False
    timestamp: Optional[datetime] = None


class FXService(BaseAsyncService):
    """FX rate service with waterfall resolution strategy."""

    async def resolve_rate(self, base: str, quote: str, date: str) -> FXResult:
        """
        Resolve FX rate using waterfall strategy:
        1. Try fawazahmed0 historical endpoint
        2. Fallback to ExchangeRate-API
        3. Query FXCache for cached rate
        4. Return manual entry prompt if all fail

        Args:
            base: Base currency code (e.g., "USD")
            quote: Quote currency code (e.g., "NGN")
            date: Date in YYYY-MM-DD format

        Returns:
            FXResult with rate and source information
        """
        # Step 1: Try fawazahmed0 historical endpoint
        result = await self._try_fawazahmed0(base, quote, date)
        if result.rate is not None:
            return result

        # Step 2: Fallback to ExchangeRate-API
        result = await self._try_exchangerate_api(base, quote, date)
        if result.rate is not None:
            return result

        # Step 3: Query FXCache for cached rate
        cached_result = await self._try_cached_rate(base, quote)
        if cached_result.rate is not None:
            return cached_result

        # Step 4: Return manual entry prompt
        return FXResult(rate=None, source="manual")

    async def _try_fawazahmed0(self, base: str, quote: str, date: str) -> FXResult:
        """Try fawazahmed0 historical endpoint."""
        try:
            url = f"https://fawazahmed0.github.io/currency-api/latest/{date}.json"
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(url)
                response.raise_for_status()
                data = response.json()

                if base in data and quote in data[base]:
                    rate = data[base][quote]
                    # Cache the successful fetch
                    await self._cache_rate(base, quote, rate, "fawazahmed0", date)
                    return FXResult(
                        rate=rate,
                        source="fawazahmed0",
                        is_cached=False,
                        timestamp=datetime.fromisoformat(date),
                    )
        except (httpx.RequestError, httpx.HTTPStatusError, KeyError, ValueError):
            pass
        return FXResult(rate=None, source="fawazahmed0", is_cached=False)

    async def _try_exchangerate_api(self, base: str, quote: str, date: str) -> FXResult:
        """Fallback to ExchangeRate-API Open Access."""
        try:
            url = f"https://open.exchangerate-api.com/v6/latest/{base}"
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(url)
                response.raise_for_status()
                data = response.json()

                if "rates" in data and quote in data["rates"]:
                    rate = data["rates"][quote]
                    # Cache the successful fetch
                    await self._cache_rate(base, quote, rate, "exchangerate-api", date)
                    return FXResult(
                        rate=rate,
                        source="exchangerate-api",
                        is_cached=False,
                        timestamp=datetime.now(),
                    )
        except (httpx.RequestError, httpx.HTTPStatusError, KeyError, ValueError):
            pass
        return FXResult(rate=None, source="exchangerate-api", is_cached=False)

    async def _try_cached_rate(self, base: str, quote: str) -> FXResult:
        """Query FXCache for most recent cached rate."""
        try:
            # Get most recent cached rate for the pair
            cache_entry = (
                await FXCache.filter(base_currency=base, quote_currency=quote)
                .order_by("-timestamp")
                .first()
            )

            if cache_entry:
                return FXResult(
                    rate=cache_entry.rate,
                    source="cache",
                    is_cached=True,
                    timestamp=cache_entry.timestamp,
                )
        except Exception:
            pass
        return FXResult(rate=None, source="cache", is_cached=False)

    async def _cache_rate(
        self, base: str, quote: str, rate: float, source: str, date: str
    ):
        """Cache successful API fetch to FXCache."""
        try:
            # Delete existing entries for this pair to keep only the most recent
            await FXCache.filter(base_currency=base, quote_currency=quote).delete()

            # Create new cache entry
            await FXCache.create(
                base_currency=base,
                quote_currency=quote,
                rate=rate,
                source=source,
                timestamp=datetime.fromisoformat(date),
            )
        except Exception:
            # Don't fail if caching fails
            pass
