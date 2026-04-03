import hypothesis.strategies as st
import datetime
import json
from hypothesis import given, settings, example
from lagosfile.services.config_engine import TaxConfig, config_engine


# Property 23: Tax_Config import/export round-trip
@given(
    st.lists(
        st.tuples(
            st.integers(min_value=0, max_value=10000000),
            st.integers(min_value=0, max_value=10000000),
            st.floats(min_value=0, max_value=1),  # Valid rates between 0 and 1
        ).filter(lambda x: x[0] < x[1]),
        min_size=1,
        max_size=10,
    ),
    st.dictionaries(
        st.text(min_size=1, max_size=20),
        st.floats(min_value=0, max_value=1),  # Valid rates between 0 and 1
        min_size=1,
        max_size=5,
    ),
    st.floats(min_value=1, max_value=10000000),  # Positive values (must be > 0)
    st.floats(min_value=1, max_value=10000000),  # Positive values (must be > 0)
    st.floats(min_value=0, max_value=1),  # Valid tax rates
)
@settings(max_examples=25)
@example(
    bands=[(0, 100000, 0.5)],
    allowance_rates={"plant": 0.5},
    rent_relief_cap=500000,
    cgt_proceeds_threshold=1000000,
    minimum_tax_rate=0.01,
)
@example(
    bands=[(0, 100000, 0.5)],
    allowance_rates={"plant": 0.5},
    rent_relief_cap=500000,
    cgt_proceeds_threshold=1000000,
    minimum_tax_rate=0.01,
)
@example(
    bands=[(0, 100000, 0.5)],
    allowance_rates={"plant": 0.5},
    rent_relief_cap=500000,
    cgt_proceeds_threshold=1000000,
    minimum_tax_rate=0.01,
)
@example(
    bands=[(0, 100000, 0.5)],
    allowance_rates={"plant": 0.5},
    rent_relief_cap=500000,
    cgt_proceeds_threshold=1000000,
    minimum_tax_rate=0.01,
)
@example(
    bands=[(0, 100000, 0.5)],
    allowance_rates={"plant": 0.5},
    rent_relief_cap=500000,
    cgt_proceeds_threshold=1000000,
    minimum_tax_rate=0.5,
)
@example(
    bands=[(0, 100000, 0.5)],
    allowance_rates={"plant": 0.5},
    rent_relief_cap=500000,
    cgt_proceeds_threshold=1000000,
    minimum_tax_rate=0.01,
)
def test_tax_config_import_export_round_trip(
    bands, allowance_rates, rent_relief_cap, cgt_proceeds_threshold, minimum_tax_rate
):
    """Test that exporting and importing a TaxConfig results in the same configuration"""
    # Create test config
    config = TaxConfig(
        version_label=f"Test Config {datetime.datetime.now().timestamp()}",
        bands=[
            {"lower": lower, "upper": upper, "rate": rate}
            for lower, upper, rate in bands
        ],
        allowance_rates=allowance_rates,
        rent_relief_cap=rent_relief_cap,
        cgt_proceeds_threshold=cgt_proceeds_threshold,
        cgt_gain_threshold=cgt_proceeds_threshold
        * 0.1,  # Related to proceeds threshold
        minimum_tax_rate=minimum_tax_rate,
    )

    # Export to JSON
    json_data = config_engine.export_json_sync(config)

    # Import from JSON
    imported_config = config_engine.import_json_sync(json_data)

    # Compare configurations
    original_dict = config.to_dict()
    imported_dict = imported_config.to_dict()

    assert original_dict["version_label"] == imported_dict["version_label"]
    assert original_dict["bands"] == imported_dict["bands"]
    assert original_dict["allowance_rates"] == imported_dict["allowance_rates"]
    assert original_dict["rent_relief_cap"] == imported_dict["rent_relief_cap"]
    assert (
        original_dict["cgt_proceeds_threshold"]
        == imported_dict["cgt_proceeds_threshold"]
    )
    assert original_dict["cgt_gain_threshold"] == imported_dict["cgt_gain_threshold"]
    assert original_dict["minimum_tax_rate"] == imported_dict["minimum_tax_rate"]
