import logging
from dataclasses import dataclass
from datetime import date

import httpx

from lagosfile.models import FXCache

logger = logging.getLogger(__name__)


@dataclass
class FXResult:
    rate: float | None
    source: str  # "fawazahmed0" | "exchangerate-api" | "cache" | "manual"
    rate_date: date
    is_cached: bool
    cache_date: date | None


class FXService:
    async def resolve_rate(self, base: str, quote: str, target_date: date) -> FXResult:
        result = await self._try_fawazahmed0(base, quote, target_date)
        if result is not None:
            await self._cache_rate(base, quote, result.rate, result.source, target_date)
            return result
        result = await self._try_exchangerate_api(base, quote, target_date)
        if result is not None:
            await self._cache_rate(base, quote, result.rate, result.source, date.today())
            return result
        result = await self._try_cached_rate(base, quote, target_date)
        if result is not None:
            return result
        return FXResult(
            rate=None,
            source="manual",
            rate_date=target_date,
            is_cached=False,
            cache_date=None,
        )

    async def _try_fawazahmed0(self, base: str, quote: str, target_date: date) -> FXResult | None:
        try:
            url = (
                f"https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api"
                f"@{target_date}/v1/currencies/{base.lower()}.json"
            )
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(url)
                response.raise_for_status()
                data = response.json()
                rate = data[base.lower()][quote.lower()]
                return FXResult(
                    rate=float(rate),
                    source="fawazahmed0",
                    rate_date=target_date,
                    is_cached=False,
                    cache_date=None,
                )
        except (
            httpx.RequestError,
            httpx.HTTPStatusError,
            KeyError,
            ValueError,
            TypeError,
        ):
            return None

    async def _try_exchangerate_api(self, base: str, quote: str, target_date: date) -> FXResult | None:
        try:
            url = f"https://open.er-api.com/v6/latest/{base}"
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(url)
                response.raise_for_status()
                data = response.json()
                rate = data["rates"][quote]
                today = date.today()
                return FXResult(
                    rate=float(rate),
                    source="exchangerate-api",
                    rate_date=today,
                    is_cached=False,
                    cache_date=None,
                )
        except (
            httpx.RequestError,
            httpx.HTTPStatusError,
            KeyError,
            ValueError,
            TypeError,
        ):
            return None

    async def _try_cached_rate(self, base: str, quote: str, target_date: date) -> FXResult | None:
        try:
            cached = await FXCache.filter(base_currency=base, quote_currency=quote).order_by("-rate_date").first()
            if cached:
                return FXResult(
                    rate=float(cached.rate),
                    source="cache",
                    rate_date=cached.rate_date,
                    is_cached=True,
                    cache_date=cached.rate_date,
                )
        except Exception:
            logger.exception("Error querying FXCache")
            return None

    async def _cache_rate(
        self,
        base: str,
        quote: str,
        rate: float,
        source: str,
        rate_date: date,
    ) -> None:
        try:
            await FXCache.update_or_create(
                base_currency=base,
                quote_currency=quote,
                rate_date=rate_date,
                source=source,
                defaults={"rate": rate},
            )
        except Exception:
            logger.exception("Error caching FX rate")


def apply_cbn_override(entry_data: dict) -> dict:
    result = dict(entry_data)
    cbn_override = result.get("fx_rate_cbn_override")
    foreign_amount = result.get("foreign_amount")
    if cbn_override is not None:
        result["fx_rate_used"] = cbn_override
        result["fx_rate_source"] = "CBN Override"
        if foreign_amount is not None:
            result["gross_amount_ngn"] = foreign_amount * cbn_override
    else:
        fetched = result.get("fx_rate_fetched")
        result["fx_rate_used"] = fetched
        result["fx_rate_source"] = result.get("fx_rate_source", "manual")
        if fetched is not None and foreign_amount is not None:
            result["gross_amount_ngn"] = foreign_amount * fetched
    return result
