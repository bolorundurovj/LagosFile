from datetime import datetime
from typing import Any

from lagosfile.models import (
    CapitalAllowance,
    Filing,
    IncomeEntry,
    ReliefEntry,
)
from lagosfile.services.config_engine import ConfigEngine


def calculate_annual_allowance(asset_cost: float, annual_allowance_rate: float) -> float:
    return asset_cost * annual_allowance_rate


def calculate_bik_taxable_value(cost: float) -> float:
    return cost * 0.05


class FilingService:
    async def create_draft(self, taxpayer_id: str, yoa: int) -> Filing:
        filing = await Filing.create(
            taxpayer_id=taxpayer_id,
            year_of_assessment=yoa,
            status="Draft",
            tax_config_version="",
        )
        return filing

    async def save_step(self, filing_id: str, step_data: dict[str, Any]) -> Filing:
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

    async def confirm(self, filing_id: str) -> Filing:
        filing = await Filing.get(id=filing_id)
        if filing.status != "Draft":
            raise ValueError(f"Only Draft filings can be confirmed; current status is '{filing.status}'")
        confirmed_count = await Filing.filter(
            year_of_assessment=filing.year_of_assessment,
            status="Confirmed",
        ).count()
        sequential = confirmed_count + 1
        filing.filing_reference = f"LIRS/REF/{filing.year_of_assessment}/{sequential:05d}"
        filing.status = "Confirmed"
        filing.confirmed_at = datetime.utcnow()
        config = await ConfigEngine().get_active_config()
        filing.tax_config_version = config.version_label
        await filing.save()
        return filing

    async def duplicate(self, filing_id: str) -> Filing:
        original = await Filing.get(id=filing_id)
        if original.status != "Confirmed":
            raise ValueError(f"Only Confirmed filings can be duplicated; current status is '{original.status}'")
        new_filing = await Filing.create(
            taxpayer_id=str(original.taxpayer_id),
            year_of_assessment=original.year_of_assessment + 1,
            status="Draft",
            tax_config_version="",
        )
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

    async def list_filings(
        self,
        taxpayer_id: str,
        page: int = 1,
        page_size: int = 20,
        filters: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        filters = filters or {}
        qs = Filing.filter(taxpayer_id=taxpayer_id)
        if "yoa" in filters:
            qs = qs.filter(year_of_assessment=filters["yoa"])
        if "status" in filters:
            qs = qs.filter(status=filters["status"])
        total = await qs.count()
        offset = (page - 1) * page_size
        filings = await qs.offset(offset).limit(page_size)
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

    async def get_filing_detail(self, filing_id: str) -> Filing:
        filing = await Filing.get(id=filing_id).prefetch_related(
            "income_entries",
            "capital_allowances",
            "relief_entries",
        )
        return filing

    async def mark_submitted(self, filing_id: str) -> Filing:
        filing = await Filing.get(id=filing_id)
        if filing.status != "Confirmed":
            raise ValueError(f"Only Confirmed filings can be marked as Submitted; current status is '{filing.status}'")
        filing.status = "Submitted"
        await filing.save()
        return filing

    async def amend(self, filing_id: str) -> Filing:
        original = await Filing.get(id=filing_id)
        if original.status != "Confirmed":
            raise ValueError(f"Only Confirmed filings can be amended; current status is '{original.status}'")
        new_filing = await Filing.create(
            taxpayer_id=str(original.taxpayer_id),
            year_of_assessment=original.year_of_assessment,
            status="Draft",
            parent_filing_id=str(original.id),
            tax_config_version="",
        )
        return new_filing
