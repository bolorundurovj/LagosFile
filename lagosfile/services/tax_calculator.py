from lagosfile.models import TaxCalculationResult
from lagosfile.services.config_engine import TaxConfig, config_engine


class TaxCalculator:
    def __init__(self):
        self._config = None

    async def get_config(self) -> TaxConfig:
        if not self._config:
            self._config = await config_engine.get_active_config()
        return self._config

    def get_config_sync(self) -> TaxConfig:
        if self._config:
            return self._config
        return TaxConfig()

    async def calculate_tax(
        self,
        taxable_income: float,
        cgt_proceeds: float = 0.0,
        cgt_gain: float = 0.0,
        allowances: dict[str, float] | None = None,
    ) -> TaxCalculationResult:
        config = await self.get_config()
        total_allowances = self._calculate_allowances(allowances or {})
        adjusted_income = max(0, taxable_income - total_allowances)
        income_tax = self._calculate_income_tax(adjusted_income, config)
        cgt_tax = self._calculate_cgt(cgt_proceeds, cgt_gain, config)
        total_tax = income_tax + cgt_tax
        if adjusted_income > 0 and total_tax < adjusted_income * config.minimum_tax_rate:
            total_tax = adjusted_income * config.minimum_tax_rate
        return TaxCalculationResult(
            taxable_income=taxable_income,
            total_income=adjusted_income,
            total_allowances=total_allowances,
            total_relief=0,  # Assuming no relief for now
            tax_payable=income_tax + cgt_tax,
            effective_rate=((income_tax + cgt_tax) / taxable_income if taxable_income > 0 else 0.0),
            adjusted_income=adjusted_income,
            income_tax=income_tax,
            cgt_tax=cgt_tax,
        )

    def calculate_tax_sync(
        self,
        taxable_income: float,
        cgt_proceeds: float = 0.0,
        cgt_gain: float = 0.0,
        allowances: dict[str, float] | None = None,
    ) -> TaxCalculationResult:
        config = self.get_config_sync()
        total_allowances = self._calculate_allowances(allowances or {})
        adjusted_income = max(0, taxable_income - total_allowances)
        income_tax = self._calculate_income_tax(adjusted_income, config)
        cgt_tax = self._calculate_cgt(cgt_proceeds, cgt_gain, config)
        total_tax = income_tax + cgt_tax
        if adjusted_income > 0 and total_tax < adjusted_income * config.minimum_tax_rate:
            total_tax = adjusted_income * config.minimum_tax_rate
        return TaxCalculationResult(
            taxable_income=taxable_income,
            total_income=adjusted_income,
            total_allowances=total_allowances,
            income_tax=income_tax,
            cgt_tax=cgt_tax,
            tax_payable=total_tax,
            total_tax=total_tax,
            effective_rate=total_tax / taxable_income if taxable_income > 0 else 0.0,
            adjusted_income=adjusted_income,
        )

    def _calculate_allowances(self, allowances: dict[str, float]) -> float:
        config = self.get_config_sync()
        total_allowance = 0.0
        for asset_type, amount in allowances.items():
            if asset_type in config.allowance_rates:
                total_allowance += amount * config.allowance_rates[asset_type]
        return min(total_allowance, config.rent_relief_cap)

    def _calculate_income_tax(self, income: float, config: TaxConfig) -> float:
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
        if proceeds <= config.cgt_proceeds_threshold:
            return 0.0
        taxable_gain = max(0, gain - config.cgt_gain_threshold)
        return taxable_gain * 0.15  # Standard CGT rate


tax_calculator = TaxCalculator()


class TaxCalculationService:
    def __init__(self):
        self._calculator = tax_calculator

    async def calculate(
        self,
        taxable_income: float,
        cgt_proceeds: float = 0.0,
        cgt_gain: float = 0.0,
        allowances: dict[str, float] | None = None,
    ) -> TaxCalculationResult:
        return await self._calculator.calculate_tax(taxable_income, cgt_proceeds, cgt_gain, allowances)

    def calculate_sync(
        self,
        taxable_income: float,
        cgt_proceeds: float = 0.0,
        cgt_gain: float = 0.0,
        allowances: dict[str, float] | None = None,
    ) -> TaxCalculationResult:
        return self._calculator.calculate_tax_sync(taxable_income, cgt_proceeds, cgt_gain, allowances)


tax_calculation_service = TaxCalculationService()
