"""
FX Rate Resolution Service for LagosFile.

Implements the waterfall resolution strategy:
  1. fawazahmed0 historical endpoint (primary)
  2. ExchangeRate-API Open Access (fallback)
  3. FXCache — most recent cached rate for the pair
  4. Manual entry prompt

Requirements: 5.2, 5.5, 5.6, 5.7, 5.9, 16.1, 16.2, 16.3, 16.4, 16.5, 16.6
"""

from dataclasses import dataclass
from datetime import date, datetime
from typing import Optional

import httpx

from lagosfile.models import FXCache


@dataclass
class FXResult:
    rate: Optional[float]
    source: str  # "fawazahmed0" | "exchangerate-api" | "cache" | "manual"
    rate_date: date
    is_cached: bool
    cache_date: Optional[date]


class FXService:
    """FX rate service with waterfall resolution strategy."""

    async def resolve_rate(self, base: str, quote: str, target_date: date) -> FXResult:
        """
        Resolve FX rate using the waterfall strategy.

        Step 1: fawazahmed0 historical endpoint (primary)
        Step 2: ExchangeRate-API Open Access (fallback)
        Step 3: FXCache — most recent cached rate for the pair
        Step 4: Manual entry prompt

        Args:
            base: Base currency code (e.g., "USD")
            quote: Quote currency code (e.g., "NGN")
            target_date: The date for which the rate is needed

        Returns:
            FXResult with rate and source information
        """
        # Step 1: fawazahmed0 historical endpoint
        result = await self._try_fawazahmed0(base, quote, target_date)
        if result is not None:
            await self._cache_rate(base, quote, result.rate, result.source, target_date)
            return result

        # Step 2: ExchangeRate-API Open Access fallback
        result = await self._try_exchangerate_api(base, quote, target_date)
        if result is not None:
            await self._cache_rate(base, quote, result.rate, result.source, date.today())
            return result

        # Step 3: FXCache — most recent cached rate for the pair
        result = await self._try_cached_rate(base, quote, target_date)
        if result is not None:
            return result

        # Step 4: Manual entry required
        return FXResult(
            rate=None,
            source="manual",
            rate_date=target_date,
            is_cached=False,
            cache_date=None,
        )

    async def _try_fawazahmed0(
        self, base: str, quote: str, target_date: date
    ) -> Optional[FXResult]:
        """Try fawazahmed0 historical endpoint."""
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
        except (httpx.RequestError, httpx.HTTPStatusError, KeyError, ValueError, TypeError):
            return None

    async def _try_exchangerate_api(
        self, base: str, quote: str, target_date: date
    ) -> Optional[FXResult]:
        """Fallback to ExchangeRate-API Open Access."""
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
        except (httpx.RequestError, httpx.HTTPStatusError, KeyError, ValueError, TypeError):
            return None

    async def _try_cached_rate(
        self, base: str, quote: str, target_date: date
    ) -> Optional[FXResult]:
        """Query FXCache for the most recent cached rate for this pair."""
        try:
            cached = (
                await FXCache.filter(base_currency=base, quote_currency=quote)
                .order_by("-rate_date")
                .first()
            )
            if cached:
                return FXResult(
                    rate=float(cached.rate),
                    source="cache",
                    rate_date=cached.rate_date,
                    is_cached=True,
                    cache_date=cached.rate_date,
                )
        except Exception:
            pass
        return None

    async def _cache_rate(
        self,
        base: str,
        quote: str,
        rate: float,
        source: str,
        rate_date: date,
    ) -> None:
        """Cache a successfully fetched rate to FXCache.

        Uses get_or_create on (base_currency, quote_currency, rate_date, source)
        to avoid unique constraint violations.
        """
        try:
            await FXCache.update_or_create(
                base_currency=base,
                quote_currency=quote,
                rate_date=rate_date,
                source=source,
                defaults={"rate": rate},
            )
        except Exception:
            # Never fail the caller if caching fails
            pass


# ---------------------------------------------------------------------------
# CBN Override — pure function, no DB needed
# ---------------------------------------------------------------------------

def apply_cbn_override(entry_data: dict) -> dict:
    """Apply CBN override rate logic to a foreign income entry dict.

    If ``fx_rate_cbn_override`` is set (not None):
      - fx_rate_used = fx_rate_cbn_override
      - fx_rate_source = "CBN Override"
      - gross_amount_ngn = foreign_amount * fx_rate_used

    Otherwise:
      - fx_rate_used = fx_rate_fetched
      - fx_rate_source = entry_data.get("fx_rate_source", "manual")
      - gross_amount_ngn = foreign_amount * fx_rate_used  (if both are set)

    Returns the updated dict (a shallow copy).

    Requirements: 5.5, 5.6, 5.7
    """
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
