"""
Filing Service — draft lifecycle management.

Handles create_draft, save_step, confirm, duplicate, amend,
list_filings, and get_filing_detail operations.

Requirements: 3.1, 3.4, 3.5, 4.2, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.8
"""

from datetime import datetime
from typing import Any, Optional

from lagosfile.models import (
    CapitalAllowance,
    Filing,
    IncomeEntry,
    ReliefEntry,
)
from lagosfile.services.config_engine import ConfigEngine


def calculate_bik_taxable_value(cost: float) -> float:
    """Calculate the taxable value of a benefit-in-kind.

    Per NTA 2025, the taxable value of a benefit-in-kind is 5% of its cost.

    Args:
        cost: The cost of the benefit-in-kind in Naira.

    Returns:
        The taxable value (5% of cost).

    Requirements: 4.2
    """
    return cost * 0.05


class FilingService:
    """Manages the full draft lifecycle for tax filings."""

    # ------------------------------------------------------------------
    # create_draft
    # ------------------------------------------------------------------

    async def create_draft(self, taxpayer_id: str, yoa: int) -> Filing:
        """Create a new Draft filing for the given taxpayer and year of assessment.

        Args:
            taxpayer_id: UUID string of the Taxpayer record.
            yoa: Year of Assessment (e.g. 2025).

        Returns:
            The newly created Filing in Draft status.
        """
        filing = await Filing.create(
            taxpayer_id=taxpayer_id,
            year_of_assessment=yoa,
            status="Draft",
            tax_config_version="",
        )
        return filing

    # ------------------------------------------------------------------
    # save_step
    # ------------------------------------------------------------------

    async def save_step(self, filing_id: str, step_data: dict[str, Any]) -> Filing:
        """Persist wizard step data to the filing.

        Replaces (delete + recreate) any entry type present in *step_data*.

        Args:
            filing_id: UUID string of the Filing record.
            step_data: Dict that may contain any of:
                - "income_entries": list of dicts
                - "capital_allowances": list of dicts
                - "relief_entries": list of dicts

        Returns:
            The updated Filing record.
        """
        filing = await Filing.get(id=filing_id)

        if "income_entries" in step_data:
            await IncomeEntry.filter(filing_id=filing_id).delete()
            for entry in step_data["income_entries"]:
                await IncomeEntry.create(filing=filing, **entry)

        if "capital_allowances" in step_data:
            await CapitalAllowance.filter(filing_id=filing_id).delete()
            for allowance in step_data["capital_allowances"]:
                await CapitalAllowance.create(filing=filing, **allowance)

        if "relief_entries" in step_data:
            await ReliefEntry.filter(filing_id=filing_id).delete()
            for relief in step_data["relief_entries"]:
                await ReliefEntry.create(filing=filing, **relief)

        return filing

    # ------------------------------------------------------------------
    # confirm
    # ------------------------------------------------------------------

    async def confirm(self, filing_id: str) -> Filing:
        """Confirm a Draft filing, locking it as an immutable record.

        - Raises ValueError if the filing is not in Draft status.
        - Generates a filing reference: LIRS/REF/{YOA}/{sequential:05d}
        - Snapshots the active tax config version.

        Args:
            filing_id: UUID string of the Filing record.

        Returns:
            The confirmed Filing record.
        """
        filing = await Filing.get(id=filing_id)

        if filing.status != "Draft":
            raise ValueError(
                f"Only Draft filings can be confirmed; current status is '{filing.status}'"
            )

        # Sequential number = count of already-confirmed filings for this YOA + 1
        confirmed_count = await Filing.filter(
            year_of_assessment=filing.year_of_assessment,
            status="Confirmed",
        ).count()
        sequential = confirmed_count + 1

        filing.filing_reference = (
            f"LIRS/REF/{filing.year_of_assessment}/{sequential:05d}"
        )
        filing.status = "Confirmed"
        filing.confirmed_at = datetime.utcnow()

        # Snapshot the active tax config version
        config = await ConfigEngine().get_active_config()
        filing.tax_config_version = config.version_label

        await filing.save()
        return filing

    # ------------------------------------------------------------------
    # duplicate
    # ------------------------------------------------------------------

    async def duplicate(self, filing_id: str) -> Filing:
        """Duplicate a Confirmed filing into a new Draft for YOA + 1.

        Copies IncomeEntry and CapitalAllowance records.
        Does NOT copy ReliefEntry records.

        Args:
            filing_id: UUID string of the original Confirmed Filing.

        Returns:
            The new Draft Filing.
        """
        original = await Filing.get(id=filing_id)

        if original.status != "Confirmed":
            raise ValueError(
                f"Only Confirmed filings can be duplicated; current status is '{original.status}'"
            )

        new_filing = await Filing.create(
            taxpayer_id=str(original.taxpayer_id),
            year_of_assessment=original.year_of_assessment + 1,
            status="Draft",
            tax_config_version="",
        )

        # Copy income entries
        async for entry in IncomeEntry.filter(filing_id=filing_id):
            await IncomeEntry.create(
                filing=new_filing,
                income_type=entry.income_type,
                description=entry.description,
                gross_amount_ngn=entry.gross_amount_ngn,
                is_foreign=entry.is_foreign,
                foreign_currency=entry.foreign_currency,
                foreign_amount=entry.foreign_amount,
                income_date=entry.income_date,
                fx_rate_fetched=entry.fx_rate_fetched,
                fx_rate_cbn_override=entry.fx_rate_cbn_override,
                fx_rate_used=entry.fx_rate_used,
                fx_rate_source=entry.fx_rate_source,
                foreign_tax_paid_ngn=entry.foreign_tax_paid_ngn,
                is_cgt_exempt=entry.is_cgt_exempt,
                cgt_proceeds=entry.cgt_proceeds,
                cgt_gain=entry.cgt_gain,
            )

        # Copy capital allowances (written-down values carry forward)
        async for allowance in CapitalAllowance.filter(filing_id=filing_id):
            await CapitalAllowance.create(
                filing=new_filing,
                asset_description=allowance.asset_description,
                asset_type=allowance.asset_type,
                asset_cost=allowance.asset_cost,
                acquisition_date=allowance.acquisition_date,
                tax_written_down_value=allowance.tax_written_down_value,
                annual_allowance_rate=allowance.annual_allowance_rate,
                annual_allowance_amount=allowance.annual_allowance_amount,
            )

        return new_filing

    # ------------------------------------------------------------------
    # list_filings
    # ------------------------------------------------------------------

    async def list_filings(
        self,
        taxpayer_id: str,
        page: int = 1,
        page_size: int = 20,
        filters: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Return a paginated list of filings for a taxpayer with metric counts.

        Args:
            taxpayer_id: UUID string of the Taxpayer record.
            page: 1-based page number.
            page_size: Number of records per page.
            filters: Optional dict with keys:
                - ``yoa`` (int): filter by year_of_assessment
                - ``status`` (str): filter by status (Draft/Confirmed/Submitted)

        Returns:
            A dict with keys:
                - ``filings``: list of Filing objects for the current page
                - ``total``: total matching records
                - ``page``: current page number
                - ``page_size``: page size used
                - ``metrics``: dict with ``total``, ``submitted``, ``confirmed``, ``drafts``
        """
        filters = filters or {}

        # Build the base queryset for this taxpayer
        qs = Filing.filter(taxpayer_id=taxpayer_id)

        # Apply optional filters
        if "yoa" in filters:
            qs = qs.filter(year_of_assessment=filters["yoa"])
        if "status" in filters:
            qs = qs.filter(status=filters["status"])

        total = await qs.count()
        offset = (page - 1) * page_size
        filings = await qs.offset(offset).limit(page_size)

        # Metric counts are always over the full taxpayer scope (no filters)
        all_qs = Filing.filter(taxpayer_id=taxpayer_id)
        metrics = {
            "total": await all_qs.count(),
            "submitted": await all_qs.filter(status="Submitted").count(),
            "confirmed": await all_qs.filter(status="Confirmed").count(),
            "drafts": await all_qs.filter(status="Draft").count(),
        }

        return {
            "filings": filings,
            "total": total,
            "page": page,
            "page_size": page_size,
            "metrics": metrics,
        }

    # ------------------------------------------------------------------
    # get_filing_detail
    # ------------------------------------------------------------------

    async def get_filing_detail(self, filing_id: str) -> Filing:
        """Return a Filing with all related entries prefetched.

        Prefetches ``income_entries``, ``capital_allowances``, and
        ``relief_entries`` so callers can access them without extra queries.

        Args:
            filing_id: UUID string of the Filing record.

        Returns:
            The Filing with prefetched relations.
        """
        filing = await Filing.get(id=filing_id).prefetch_related(
            "income_entries",
            "capital_allowances",
            "relief_entries",
        )
        return filing

    # ------------------------------------------------------------------
    # amend
    # ------------------------------------------------------------------

    async def amend(self, filing_id: str) -> Filing:
        """Create an amendment Draft linked to a Confirmed filing.

        The original filing is never modified.

        Args:
            filing_id: UUID string of the original Confirmed Filing.

        Returns:
            The new amendment Draft Filing.
        """
        original = await Filing.get(id=filing_id)

        if original.status != "Confirmed":
            raise ValueError(
                f"Only Confirmed filings can be amended; current status is '{original.status}'"
            )

        new_filing = await Filing.create(
            taxpayer_id=str(original.taxpayer_id),
            year_of_assessment=original.year_of_assessment,
            status="Draft",
            parent_filing_id=str(original.id),
            tax_config_version="",
        )
        return new_filing
