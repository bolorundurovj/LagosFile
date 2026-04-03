import hypothesis.strategies as st
import json
from hypothesis import given, settings, example, assume
from lagosfile.services.tax_calculator import TaxCalculator, tax_calculator


# Property 30: Invalid tax calculation input rejection (sync version)
@given(
    st.floats(min_value=-10000000, max_value=-1),  # Negative taxable income
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
    taxable_income=-500000,
    cgt_proceeds=0,
    cgt_gain=0,
    allowances={},
)
@example(
    taxable_income=-1000000,
    cgt_proceeds=1500000,
    cgt_gain=200000,
    allowances={"plant": 500000},
)
@example(
    taxable_income=-2000000,
    cgt_proceeds=0,
    cgt_gain=0,
    allowances={"equipment": 1000000},
)
def test_invalid_tax_calculation_input_rejection_sync(
    taxable_income, cgt_proceeds, cgt_gain, allowances
):
    """Test that invalid tax calculation inputs are rejected (sync version)"""
    # Create calculator instance
    calculator = TaxCalculator()

    # Test that negative taxable income is rejected
    try:
        calculator.calculate_tax_sync(
            taxable_income, cgt_proceeds, cgt_gain, allowances
        )
        # If we get here, the test should fail
        assume(False)
    except ValueError:
        # Expected behavior - invalid input should be rejected
        pass
    except Exception as e:
        # Any other exception means the test failed
        assume(False)


# Property 31: Invalid CGT input rejection (sync version)
@given(
    st.floats(min_value=0, max_value=10000000),
    st.floats(min_value=-10000000, max_value=-1),  # Negative CGT proceeds
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
    cgt_proceeds=-100000,
    cgt_gain=0,
    allowances={},
)
@example(
    taxable_income=1000000,
    cgt_proceeds=-500000,
    cgt_gain=200000,
    allowances={"plant": 500000},
)
@example(
    taxable_income=2000000,
    cgt_proceeds=-1000000,
    cgt_gain=0,
    allowances={"equipment": 1000000},
)
def test_invalid_cgt_input_rejection_sync(
    taxable_income, cgt_proceeds, cgt_gain, allowances
):
    """Test that invalid CGT inputs are rejected (sync version)"""
    # Create calculator instance
    calculator = TaxCalculator()

    # Test that negative CGT proceeds are rejected
    try:
        calculator.calculate_tax_sync(
            taxable_income, cgt_proceeds, cgt_gain, allowances
        )
        # If we get here, the test should fail
        assume(False)
    except ValueError:
        # Expected behavior - invalid input should be rejected
        pass
    except Exception as e:
        # Any other exception means the test failed
        assume(False)


# Property 32: Invalid CGT gain input rejection (sync version)
@given(
    st.floats(min_value=0, max_value=10000000),
    st.floats(min_value=0, max_value=1000000),
    st.floats(min_value=-10000000, max_value=-1),  # Negative CGT gain
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
    cgt_gain=-100000,
    allowances={},
)
@example(
    taxable_income=1000000,
    cgt_proceeds=1500000,
    cgt_gain=-200000,
    allowances={"plant": 500000},
)
@example(
    taxable_income=2000000,
    cgt_proceeds=0,
    cgt_gain=-500000,
    allowances={"equipment": 1000000},
)
def test_invalid_cgt_gain_input_rejection_sync(
    taxable_income, cgt_proceeds, cgt_gain, allowances
):
    """Test that invalid CGT gain inputs are rejected (sync version)"""
    # Create calculator instance
    calculator = TaxCalculator()

    # Test that negative CGT gain is rejected
    try:
        calculator.calculate_tax_sync(
            taxable_income, cgt_proceeds, cgt_gain, allowances
        )
        # If we get here, the test should fail
        assume(False)
    except ValueError:
        # Expected behavior - invalid input should be rejected
        pass
    except Exception as e:
        # Any other exception means the test failed
        assume(False)


# Property 33: Invalid allowance input rejection (sync version)
@given(
    st.floats(min_value=0, max_value=10000000),
    st.floats(min_value=0, max_value=1000000),
    st.floats(min_value=0, max_value=1000000),
    st.dictionaries(
        st.text(min_size=1, max_size=20),
        st.floats(min_value=-10000000, max_value=-1),  # Negative allowance amounts
        min_size=0,
        max_size=5,
    ),
)
@settings(max_examples=50)
@example(
    taxable_income=500000,
    cgt_proceeds=0,
    cgt_gain=0,
    allowances={"plant": -500000},
)
@example(
    taxable_income=1000000,
    cgt_proceeds=1500000,
    cgt_gain=200000,
    allowances={"equipment": -1000000},
)
@example(
    taxable_income=2000000,
    cgt_proceeds=0,
    cgt_gain=0,
    allowances={"vehicle": -300000},
)
def test_invalid_allowance_input_rejection_sync(
    taxable_income, cgt_proceeds, cgt_gain, allowances
):
    """Test that invalid allowance inputs are rejected (sync version)"""
    # Create calculator instance
    calculator = TaxCalculator()

    # Test that negative allowance amounts are rejected
    try:
        calculator.calculate_tax_sync(
            taxable_income, cgt_proceeds, cgt_gain, allowances
        )
        # If we get here, the test should fail
        assume(False)
    except ValueError:
        # Expected behavior - invalid input should be rejected
        pass
    except Exception as e:
        # Any other exception means the test failed
        assume(False)
