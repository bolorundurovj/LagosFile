import math

from hypothesis import given, settings
from hypothesis import strategies as st

from lagosfile.services.fx_service import apply_cbn_override

rate_strategy = st.floats(min_value=1.0, max_value=2000.0, allow_nan=False, allow_infinity=False)
amount_strategy = st.floats(min_value=0.01, max_value=1e9, allow_nan=False, allow_infinity=False)
source_strategy = st.sampled_from(["fawazahmed0", "exchangerate-api", "cache", "manual"])


@given(
    fetched_rate=rate_strategy,
    cbn_override_rate=rate_strategy,
    foreign_amount=amount_strategy,
    source=source_strategy,
)
@settings(max_examples=25)
def test_cbn_override_takes_precedence(fetched_rate, cbn_override_rate, foreign_amount, source):
    entry = {
        "fx_rate_fetched": fetched_rate,
        "fx_rate_cbn_override": cbn_override_rate,
        "foreign_amount": foreign_amount,
        "fx_rate_source": source,
    }
    result = apply_cbn_override(entry)
    assert result["fx_rate_used"] == cbn_override_rate
    assert result["fx_rate_source"] == "CBN Override"
    expected_ngn = foreign_amount * cbn_override_rate
    assert math.isclose(result["gross_amount_ngn"], expected_ngn, rel_tol=1e-9)


@given(
    fetched_rate=rate_strategy,
    foreign_amount=amount_strategy,
    source=source_strategy,
)
@settings(max_examples=25)
def test_fetched_rate_used_when_no_override(fetched_rate, foreign_amount, source):
    entry = {
        "fx_rate_fetched": fetched_rate,
        "fx_rate_cbn_override": None,
        "foreign_amount": foreign_amount,
        "fx_rate_source": source,
    }
    result = apply_cbn_override(entry)
    assert result["fx_rate_used"] == fetched_rate
    assert result["fx_rate_source"] == source
    expected_ngn = foreign_amount * fetched_rate
    assert math.isclose(result["gross_amount_ngn"], expected_ngn, rel_tol=1e-9)


@given(
    fetched_rate=rate_strategy,
    cbn_override_rate=rate_strategy,
    foreign_amount=amount_strategy,
)
@settings(max_examples=25)
def test_apply_cbn_override_does_not_mutate_input(fetched_rate, cbn_override_rate, foreign_amount):
    entry = {
        "fx_rate_fetched": fetched_rate,
        "fx_rate_cbn_override": cbn_override_rate,
        "foreign_amount": foreign_amount,
        "fx_rate_source": "fawazahmed0",
    }
    original_override = entry["fx_rate_cbn_override"]
    result = apply_cbn_override(entry)
    assert entry["fx_rate_cbn_override"] == original_override
    assert result is not entry
