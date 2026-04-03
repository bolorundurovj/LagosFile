from typing import List, Optional, Dict, Any
from datetime import datetime
from lagosfile.models import (
    Filing,
    IncomeEntry,
    CapitalAllowance,
    ReliefEntry,
    Document,
    TaxConfigModel,
)
from lagosfile.services.config_engine import ConfigEngine
from lagosfile.services.document_service import DocumentService
from lagosfile.services.fx_service import FXService
from lagosfile.services.base_service import BaseAsyncService
from tortoise import Tortoise


class FilingService(BaseAsyncService):
    """Filing service handling draft lifecycle and filing operations."""

    async def create_draft(self, taxpayer_id: int, yoa: int) -> Filing:
        """Create a new filing draft for the given taxpayer and year of assessment."""
        filing = Filing(taxpayer_id=taxpayer_id, yoa=yoa, status="Draft")
        await filing.save()
        return filing

    async def save_step(self, filing_id: int, step_data: Dict[str, Any]) -> None:
        """Save data for a specific step in the filing wizard."""
        filing = await Filing.get(id=filing_id)

        if "income_entries" in step_data:
            await self._save_income_entries(filing, step_data["income_entries"])

        if "capital_allowances" in step_data:
            await self._save_capital_allowances(filing, step_data["capital_allowances"])

        if "relief_entries" in step_data:
            await self._save_relief_entries(filing, step_data["relief_entries"])

        # Re-serialize and re-encrypt the database after each save
        await self._re_encrypt_db()

    async def confirm(self, filing_id: int) -> Filing:
        """Confirm a filing, generating reference and snapshotting tax config."""
        filing = await Filing.get(id=filing_id)

        if filing.status != "Draft":
            raise ValueError("Only draft filings can be confirmed")

        # Generate filing reference
        current_year = datetime.now().year
        filing_reference = f"LIRS/REF/{current_year}/{filing.id:05d}"
        filing.filing_reference = filing_reference
        filing.confirmed_at = datetime.now()
        filing.status = "Confirmed"

        # Snapshot the active tax config version
        config_engine = ConfigEngine()
        active_config = await config_engine.get_active_config()
        filing.tax_config_version = active_config.version_label

        await filing.save()

        # Re-serialize and re-encrypt the database
        await self._re_encrypt_db()

        return filing

    async def duplicate(self, filing_id: int) -> Filing:
        """Create a duplicate of a filing for the next year of assessment."""
        original_filing = await Filing.get(id=filing_id)

        if original_filing.status not in ["Draft", "Confirmed"]:
            raise ValueError("Only draft and confirmed filings can be duplicated")

        # Create new filing with YOA+1
        new_filing = Filing(
            taxpayer_id=original_filing.taxpayer_id,
            yoa=original_filing.yoa + 1,
            status="Draft",
            parent_filing_id=original_filing.id,
        )
        await new_filing.save()

        # Copy income entries
        for entry in await original_filing.income_entries.all():
            new_entry = IncomeEntry(
                filing=new_filing,
                income_type=entry.income_type,
                description=entry.description,
                gross_amount_ngn=entry.gross_amount_ngn,
                foreign_currency=entry.foreign_currency,
                foreign_amount=entry.foreign_amount,
                date=entry.date,
                fetched_fx_rate=entry.fetched_fx_rate,
                cbn_override_rate=entry.cbn_override_rate,
                rate_source=entry.rate_source,
                benefits_in_kind=entry.benefits_in_kind,
            )
            await new_entry.save()

        # Copy capital allowances
        for allowance in await original_filing.capital_allowances.all():
            new_allowance = CapitalAllowance(
                filing=new_filing,
                asset_type=allowance.asset_type,
                asset_cost=allowance.asset_cost,
                date_acquired=allowance.date_acquired,
                annual_allowance_rate=allowance.annual_allowance_rate,
                annual_allowance_amount=allowance.annual_allowance_amount,
            )
            await new_allowance.save()

        # Copy relief entries
        for relief in await original_filing.relief_entries.all():
            new_relief = ReliefEntry(
                filing=new_filing, relief_type=relief.relief_type, amount=relief.amount
            )
            await new_relief.save()

        # Copy documents
        for document in await original_filing.documents.all():
            new_document = Document(
                filing=new_filing,
                file_path=document.file_path,
                document_type=document.document_type,
                uploaded_at=document.uploaded_at,
            )
            await new_document.save()

        # Re-serialize and re-encrypt the database
        await self._re_encrypt_db()

        return new_filing

    async def amend(self, filing_id: int) -> Filing:
        """Create an amendment filing linked to the original filing."""
        original_filing = await Filing.get(id=filing_id)

        if original_filing.status != "Confirmed":
            raise ValueError("Only confirmed filings can be amended")

        # Create new filing as amendment
        new_filing = Filing(
            taxpayer_id=original_filing.taxpayer_id,
            yoa=original_filing.yoa,
            status="Draft",
            parent_filing_id=original_filing.id,
        )
        await new_filing.save()

        # Re-serialize and re-encrypt the database
        await self._re_encrypt_db()

        return new_filing

    async def _save_income_entries(
        self, filing: Filing, entries: List[Dict[str, Any]]
    ) -> None:
        """Save income entries with FX rate selection logic."""
        fx_service = FXService()

        for entry_data in entries:
            # Determine FX rate to use
            if entry_data.get("cbn_override_rate") is not None:
                # Use CBN override rate
                fx_rate_used = entry_data["cbn_override_rate"]
                rate_source = "CBN Override"
            else:
                # Use fetched FX rate
                fx_rate_used = entry_data["fetched_fx_rate"]
                rate_source = entry_data["rate_source"]

            # Calculate gross amount in NGN
            foreign_amount = entry_data.get("foreign_amount")
            if foreign_amount is not None and fx_rate_used is not None:
                gross_amount_ngn = foreign_amount * fx_rate_used
            else:
                gross_amount_ngn = entry_data.get("gross_amount_ngn", 0)

            entry = IncomeEntry(
                filing=filing,
                income_type=entry_data["income_type"],
                description=entry_data["description"],
                gross_amount_ngn=gross_amount_ngn,
                foreign_currency=entry_data.get("foreign_currency"),
                foreign_amount=foreign_amount,
                date=entry_data["date"],
                fetched_fx_rate=entry_data.get("fetched_fx_rate"),
                cbn_override_rate=entry_data.get("cbn_override_rate"),
                rate_source=rate_source,
                benefits_in_kind=entry_data.get("benefits_in_kind", 0),
            )
            await entry.save()

    async def _save_capital_allowances(
        self, filing: Filing, allowances: List[Dict[str, Any]]
    ) -> None:
        """Save capital allowances."""
        for allowance_data in allowances:
            allowance = CapitalAllowance(
                filing=filing,
                asset_type=allowance_data["asset_type"],
                asset_cost=allowance_data["asset_cost"],
                date_acquired=allowance_data["date_acquired"],
                annual_allowance_rate=allowance_data["annual_allowance_rate"],
                annual_allowance_amount=allowance_data["annual_allowance_amount"],
            )
            await allowance.save()

    async def _save_relief_entries(
        self, filing: Filing, reliefs: List[Dict[str, Any]]
    ) -> None:
        """Save relief entries."""
        for relief_data in reliefs:
            relief = ReliefEntry(
                filing=filing,
                relief_type=relief_data["relief_type"],
                amount=relief_data["amount"],
            )
            await relief.save()

    async def _re_encrypt_db(self) -> None:
        """Re-serialize and re-encrypt the database after changes."""
        # This would trigger the database encryption logic
        pass
