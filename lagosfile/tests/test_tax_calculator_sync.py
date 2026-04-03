import hypothesis.strategies as st
import datetime
from hypothesis import given, settings, example
from lagosfile.services.tax_calculator import TaxCalculator, tax_calculator


# Property 25: Tax calculation accuracy (sync version)
@given(
    st.floats(min_value=0, max_value=10000000),
    st.floats(min_value=0, max_value=1000000),
    st.floats(min_value=0, max_value=1000000),
    st.dictionaries(
        st.text(min_size=1, max_size=20),
        st.floats(min_value=0, max_value=1000000),
        min_size=0,
        max_size=5,
    ),
)
@settings(max_examples=100)
@example(
    taxable_income=500000,
    cgt_proceeds=0,
    cgt_gain=0,
    allowances={},
)
@example(
    taxable_income=1000000,
    cgt_proceeds=1500000,
    cgt_gain=200000,
    allowances={"plant": 500000},
)
@example(
    taxable_income=2000000,
    cgt_proceeds=0,
    cgt_gain=0,
    allowances={"equipment": 1000000},
)
@example(
    taxable_income=750000,
    cgt_proceeds=0,
    cgt_gain=0,
    allowances={"vehicle": 300000},
)
@example(
    taxable_income=1500000,
    cgt_proceeds=2000000,
    cgt_gain=300000,
    allowances={"computer_software": 500000},
)
def test_tax_calculation_accuracy_sync(
    taxable_income, cgt_proceeds, cgt_gain, allowances
):
    """Test that tax calculations are accurate and consistent (sync version)"""
    # Create calculator instance
    calculator = TaxCalculator()

    # Calculate tax using sync method
    result = calculator.calculate_tax_sync(
        taxable_income, cgt_proceeds, cgt_gain, allowances
    )

    # Basic validation
    assert result.taxable_income == taxable_income
    assert result.adjusted_income >= 0
    assert result.total_allowances >= 0
    assert result.income_tax >= 0
    assert result.cgt_tax >= 0
    assert result.total_tax >= 0
    assert 0 <= result.effective_rate <= 1

    # Effective rate should be reasonable
    if taxable_income > 0:
        assert result.effective_rate <= 0.5  # Should be less than 50% tax rate


# Property 26: Tax calculation consistency (sync version)
@given(
    st.floats(min_value=0, max_value=10000000),
    st.floats(min_value=0, max_value=1000000),
    st.floats(min_value=0, max_value=1000000),
    st.dictionaries(
        st.text(min_size=1, max_size=20),
        st.floats(min_value=0, max_value=1000000),
        min_size=0,
        max_size=5,
    ),
)
@settings(max_examples=50)
@example(
    taxable_income=500000,
    cgt_proceeds=0,
    cgt_gain=0,
    allowances={},
)
def test_tax_calculation_consistency_sync(
    taxable_income, cgt_proceeds, cgt_gain, allowances
):
    """Test that tax calculations are consistent between sync and async methods (sync version)"""
    # Create calculator instance
    calculator = TaxCalculator()

    # Calculate using sync method
    sync_result = calculator.calculate_tax_sync(
        taxable_income, cgt_proceeds, cgt_gain, allowances
    )

    # Calculate using async method
    async def async_calculation():
        return await calculator.calculate_tax(
            taxable_income, cgt_proceeds, cgt_gain, allowances
        )

    async_result = asyncio.run(async_calculation())

    # Results should be identical
    assert sync_result.taxable_income == async_result.taxable_income
    assert sync_result.adjusted_income == async_result.adjusted_income
    assert sync_result.total_allowances == async_result.total_allowances
    assert sync_result.income_tax == async_result.income_tax
    assert sync_result.cgt_tax == async_result.cgt_tax
    assert sync_result.total_tax == async_result.total_tax
    assert sync_result.effective_rate == async_result.effective_rate


# Property 27: Allowance calculation accuracy (sync version)
@given(
    st.dictionaries(
        st.text(min_size=1, max_size=20),
        st.floats(min_value=0, max_value=1000000),
        min_size=1,
        max_size=5,
    ),
    st.floats(min_value=0, max_value=1000000),
)
@settings(max_examples=50)
@example(
    allowances={"plant": 500000},
    rent_relief_cap=500000,
)
@example(
    allowances={"equipment": 1000000},
    rent_relief_cap=500000,
)
@example(
    allowances={"vehicle": 300000},
    rent_relief_cap=500000,
)
@example(
    allowances={"computer_software": 500000},
    rent_relief_cap=500000,
)
@example(
    allowances={"furniture_and_fittings": 200000},
    rent_relief_cap=500000,
)
def test_allowance_calculation_sync(allowances, rent_relief_cap):
    """Test that allowance calculations are accurate (sync version)"""

    # Mock config with specific rent relief cap
    class MockConfig:
        def __init__(self):
            self.rent_relief_cap = rent_relief_cap
            self.allowance_rates = {
                "plant": 0.25,
                "equipment": 0.25,
                "vehicle": 0.20,
                "computer_software": 0.33,
                "furniture_and_fittings": 0.10,
            }

    # Create calculator with mock config
    calculator = TaxCalculator()
    calculator._config = MockConfig()

    # Calculate allowances
    total_allowance = calculator._calculate_allowances(allowances)

    # Calculate expected allowance
    expected_allowance = 0.0
    for asset_type, amount in allowances.items():
        if asset_type in calculator._config.allowance_rates:
            expected_allowance += (
                amount * calculator._config.allowance_rates[asset_type]
            )

    # Cap at rent relief cap
    expected_allowance = min(expected_allowance, rent_relief_cap)

    # Verify result
    assert total_allowance == expected_allowance


# Property 28: Income tax calculation accuracy (sync version)
@given(
    st.floats(min_value=0, max_value=10000000),
    st.lists(
        st.tuples(
            st.integers(min_value=0, max_value=10000000),
            st.integers(min_value=0, max_value=10000000),
            st.floats(min_value=0, max_value=1),
        ).filter(lambda x: x[0] < x[1]),
        min_size=1,
        max_size=10,
    ),
)
@settings(max_examples=50)
@example(
    income=500000,
    bands=[(0, 300000, 0.07), (300001, 600000, 0.11), (600001, 10000000, 0.15)],
)
@example(
    income=1000000,
    bands=[(0, 300000, 0.07), (300001, 600000, 0.11), (600001, 10000000, 0.15)],
)
@example(
    income=2000000,
    bands=[(0, 300000, 0.07), (300001, 600000, 0.11), (600001, 10000000, 0.15)],
)
@example(
    income=750000,
    bands=[(0, 300000, 0.07), (300001, 600000, 0.11), (600001, 10000000, 0.15)],
)
@example(
    income=1500000,
    bands=[(0, 300000, 0.07), (300001, 600000, 0.11), (600001, 10000000, 0.15)],
)
def test_income_tax_calculation_sync(income, bands):
    """Test that income tax calculations are accurate (sync version)"""

    # Mock config with specific bands
    class MockConfig:
        def __init__(self):
            self.bands = bands

    # Create calculator with mock config
    calculator = TaxCalculator()
    calculator._config = MockConfig()

    # Calculate income tax
    income_tax = calculator._calculate_income_tax(income, calculator._config)

    # Calculate expected tax manually
    expected_tax = 0.0
    remaining_income = income

    for band in bands:
        if remaining_income <= 0:
            break

        band_income = min(remaining_income, band[1] - band[0])
        expected_tax += band_income * band[2]
        remaining_income -= band_income

    # Verify result
    assert income_tax == expected_tax


# Property 29: CGT calculation accuracy (sync version)
@given(
    st.floats(min_value=0, max_value=10000000),
    st.floats(min_value=0, max_value=10000000),
    st.floats(min_value=0, max_value=10000000),
)
@settings(max_examples=50)
@example(
    proceeds=1500000,
    gain=200000,
    threshold=1000000,
)
@example(
    proceeds=500000,
    gain=100000,
    threshold=1000000,
)
@example(
    proceeds=2000000,
    gain=500000,
    threshold=1000000,
)
@example(
    proceeds=1000000,
    gain=150000,
    threshold=1000000,
)
@example(
    proceeds=3000000,
    gain=750000,
    threshold=1000000,
)
def test_cgt_calculation_sync(proceeds, gain, threshold):
    """Test that CGT calculations are accurate (sync version)"""

    # Mock config with specific threshold
    class MockConfig:
        def __init__(self):
            self.cgt_proceeds_threshold = threshold
            self.cgt_gain_threshold = threshold * 0.1

    # Create calculator with mock config
    calculator = TaxCalculator()
    calculator._config = MockConfig()

    # Calculate CGT
    cgt_tax = calculator._calculate_cgt(proceeds, gain, calculator._config)

    # Calculate expected CGT
    expected_cgt = 0.0
    if proceeds > threshold:
        taxable_gain = max(0, gain - (threshold * 0.1))
        expected_cgt = taxable_gain * 0.15

    # Verify result
    assert cgt_tax == expected_cgt
