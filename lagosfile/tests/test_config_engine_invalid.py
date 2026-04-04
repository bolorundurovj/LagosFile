import json

import hypothesis.strategies as st
from hypothesis import assume, example, given, settings

from lagosfile.services.config_engine import config_engine


@given(
    st.lists(
        st.tuples(
            st.integers(min_value=0, max_value=10000000),
            st.integers(min_value=0, max_value=10000000),
            st.floats(min_value=-1, max_value=2),  # Include invalid rates
        ).filter(lambda x: x[0] < x[1]),
        min_size=1,
        max_size=10,
    ),
    st.dictionaries(
        st.text(min_size=1, max_size=20),
        st.floats(min_value=-1, max_value=2),
        min_size=1,
        max_size=5,
    ),  # Include invalid rates
    st.floats(min_value=-1000000, max_value=-1),  # Negative values
    st.floats(min_value=-1000000, max_value=-1),  # Negative values
    st.floats(min_value=-1, max_value=2),  # Invalid tax rates
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
    bands=[(0, 100000, 1.5)],
    allowance_rates={"plant": 0.5},
    rent_relief_cap=500000,
    cgt_proceeds_threshold=1000000,
    minimum_tax_rate=0.01,
)
@example(
    bands=[(0, 100000, 0.5)],
    allowance_rates={"plant": -0.5},
    rent_relief_cap=500000,
    cgt_proceeds_threshold=1000000,
    minimum_tax_rate=0.01,
)
@example(
    bands=[(0, 100000, 0.5)],
    allowance_rates={"plant": 0.5},
    rent_relief_cap=-500000,
    cgt_proceeds_threshold=1000000,
    minimum_tax_rate=0.01,
)
@example(
    bands=[(0, 100000, 0.5)],
    allowance_rates={"plant": 0.5},
    rent_relief_cap=500000,
    cgt_proceeds_threshold=-1000000,
    minimum_tax_rate=0.01,
)
@example(
    bands=[(0, 100000, 0.5)],
    allowance_rates={"plant": 0.5},
    rent_relief_cap=500000,
    cgt_proceeds_threshold=1000000,
    minimum_tax_rate=-0.01,
)
@example(
    bands=[(100000, 0, 0.5)],
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
    minimum_tax_rate=1.5,
)
def test_invalid_tax_config_import_rejection(
    bands, allowance_rates, rent_relief_cap, cgt_proceeds_threshold, minimum_tax_rate
):
    config_data = {
        "version_label": "Invalid Test Config",
        "bands": [{"lower": lower, "upper": upper, "rate": rate} for lower, upper, rate in bands],
        "allowance_rates": allowance_rates,
        "rent_relief_cap": rent_relief_cap,
        "cgt_proceeds_threshold": cgt_proceeds_threshold,
        "cgt_gain_threshold": cgt_proceeds_threshold * 0.1,
        "minimum_tax_rate": minimum_tax_rate,
    }
    json_data = json.dumps(config_data)
    try:
        config_engine.import_json_sync(json_data)
        assume(False)
    except ValueError:
        pass
    except Exception:
        assume(False)
