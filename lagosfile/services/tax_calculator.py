import asyncio
from typing import Dict, Any, Optional, List, Tuple
from lagosfile.services.config_engine import config_engine, TaxConfig
from lagosfile.models import TaxCalculationResult, TaxCalculationResultPydantic
from lagosfile.constants import Constants


class TaxCalculator:
    def __init__(self):
        self._config = None

    async def get_config(self) -> TaxConfig:
        """Get the current tax configuration"""
        if not self._config:
            self._config = await config_engine.get_active_config()
        return self._config

    def get_config_sync(self) -> TaxConfig:
        """Sync wrapper for get_config"""
        return asyncio.run(self.get_config())

    async def calculate_tax(
        self,
        taxable_income: float,
        cgt_proceeds: float = 0.0,
        cgt_gain: float = 0.0,
        allowances: Optional[Dict[str, float]] = None,
    ) -> TaxCalculationResult:
        """Calculate tax based on income and configuration"""
        config = await self.get_config()

        # Apply allowances
        total_allowances = self._calculate_allowances(allowances or {})
        adjusted_income = max(0, taxable_income - total_allowances)

        # Calculate income tax
        income_tax = self._calculate_income_tax(adjusted_income, config)

        # Calculate CGT
        cgt_tax = self._calculate_cgt(cgt_proceeds, cgt_gain, config)

        # Total tax
        total_tax = income_tax + cgt_tax

        # Apply minimum tax rate if applicable
        if (
            adjusted_income > 0
            and total_tax < adjusted_income * config.minimum_tax_rate
        ):
            total_tax = adjusted_income * config.minimum_tax_rate

        return TaxCalculationResult(
            taxable_income=taxable_income,
            adjusted_income=adjusted_income,
            total_allowances=total_allowances,
            income_tax=income_tax,
            cgt_tax=cgt_tax,
            total_tax=total_tax,
            effective_rate=total_tax / taxable_income if taxable_income > 0 else 0.0,
        )

    def calculate_tax_sync(
        self,
        taxable_income: float,
        cgt_proceeds: float = 0.0,
        cgt_gain: float = 0.0,
        allowances: Optional[Dict[str, float]] = None,
    ) -> TaxCalculationResult:
        """Sync wrapper for calculate_tax"""
        return asyncio.run(
            self.calculate_tax(taxable_income, cgt_proceeds, cgt_gain, allowances)
        )

    def _calculate_allowances(self, allowances: Dict[str, float]) -> float:
        """Calculate total allowances based on asset types and rates"""
        config = self.get_config_sync()
        total_allowance = 0.0

        for asset_type, amount in allowances.items():
            if asset_type in config.allowance_rates:
                total_allowance += amount * config.allowance_rates[asset_type]

        return min(total_allowance, config.rent_relief_cap)

    def _calculate_income_tax(self, income: float, config: TaxConfig) -> float:
        """Calculate income tax using the tax bands"""
        tax = 0.0
        remaining_income = income

        for band in config.bands:
            if remaining_income <= 0:
                break

            band_income = min(remaining_income, band["upper"] - band["lower"])
            tax += band_income * band["rate"]
            remaining_income -= band_income

        return tax

    def _calculate_cgt(self, proceeds: float, gain: float, config: TaxConfig) -> float:
        """Calculate Capital Gains Tax"""
        if proceeds <= config.cgt_proceeds_threshold:
            return 0.0

        taxable_gain = max(0, gain - config.cgt_gain_threshold)
        return taxable_gain * 0.15  # Standard CGT rate


# Global instance
tax_calculator = TaxCalculator()


class TaxCalculationService:
    def __init__(self):
        self._calculator = tax_calculator

    async def calculate(
        self,
        taxable_income: float,
        cgt_proceeds: float = 0.0,
        cgt_gain: float = 0.0,
        allowances: Optional[Dict[str, float]] = None,
    ) -> TaxCalculationResult:
        """Calculate tax with the current configuration"""
        return await self._calculator.calculate_tax(
            taxable_income, cgt_proceeds, cgt_gain, allowances
        )

    def calculate_sync(
        self,
        taxable_income: float,
        cgt_proceeds: float = 0.0,
        cgt_gain: float = 0.0,
        allowances: Optional[Dict[str, float]] = None,
    ) -> TaxCalculationResult:
        """Sync wrapper for calculate"""
        return self._calculator.calculate_tax_sync(
            taxable_income, cgt_proceeds, cgt_gain, allowances
        )


# Global instance
tax_calculation_service = TaxCalculationService()
