from lagosfile.services.tax_calculator import TaxCalculator


def test_basic_calculation():
    """Test basic tax calculation"""
    calculator = TaxCalculator()
    result = calculator.calculate_tax_sync(500000, 0, 0, {})
    print(f"Result: {result}")
    assert result.taxable_income == 500000
    assert result.total_income >= 0
    assert result.total_allowances >= 0
    assert result.total_relief >= 0
    assert result.tax_payable >= 0
    assert 0 <= result.effective_rate <= 1


if __name__ == "__main__":
    test_basic_calculation()
    print("All tests passed!")
