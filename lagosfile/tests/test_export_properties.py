"""
Property-based tests for ExportEngine — JSON round-trip and CSV required columns.

Property 21: JSON export round-trip
Tag: # Feature: lagos-file, Property 21: JSON export round-trip
Validates: Requirements 11.3

Property 22: CSV export contains required columns
Tag: # Feature: lagos-file, Property 22: CSV export contains required columns
Validates: Requirements 11.2
"""

import csv
import io
import json
from dataclasses import asdict

from hypothesis import given, settings
from hypothesis import strategies as st

from lagosfile.services.export_engine import (
    CapitalAllowanceExport,
    ExportEngine,
    FilingExport,
    IncomeEntryExport,
    ReliefEntryExport,
)

engine = ExportEngine()

# ---------------------------------------------------------------------------
# Shared strategies
# ---------------------------------------------------------------------------

amount = st.floats(min_value=0.0, max_value=1e12, allow_nan=False, allow_infinity=False)
nullable_amount = st.one_of(st.none(), amount)
short_text = st.text(
    min_size=1,
    max_size=50,
    alphabet=st.characters(whitelist_categories=("Lu", "Ll", "Nd", "Zs")),
)
nullable_text = st.one_of(st.none(), short_text)
nullable_date = st.one_of(st.none(), st.dates().map(lambda d: d.isoformat()))
nullable_currency = st.one_of(
    st.none(),
    st.text(alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ", min_size=3, max_size=3),
)
valid_tin = st.text(alphabet="0123456789", min_size=13, max_size=13)


@st.composite
def income_entry_strategy(draw) -> IncomeEntryExport:
    return IncomeEntryExport(
        income_type=draw(
            st.sampled_from(["employment", "business", "rental", "dividend", "freelance", "other"])
        ),
        description=draw(nullable_text),
        gross_amount_ngn=draw(amount),
        foreign_currency=draw(nullable_currency),
        foreign_amount=draw(nullable_amount),
        income_date=draw(nullable_date),
        fx_rate_fetched=draw(nullable_amount),
        fx_rate_cbn_override=draw(nullable_amount),
        fx_rate_used=draw(nullable_amount),
        fx_rate_source=draw(nullable_text),
    )


@st.composite
def capital_allowance_strategy(draw) -> CapitalAllowanceExport:
    return CapitalAllowanceExport(
        asset_description=draw(short_text),
        asset_type=draw(
            st.sampled_from(["Computer/Laptop", "Camera/Recording Equipment", "Software Licence", "Other"])
        ),
        asset_cost=draw(amount),
        annual_allowance_amount=draw(amount),
        tax_written_down_value=draw(amount),
    )


@st.composite
def relief_entry_strategy(draw) -> ReliefEntryExport:
    return ReliefEntryExport(
        relief_type=draw(
            st.sampled_from(["pension", "nhis", "nhf", "rent", "wht", "life_assurance", "other_approved"])
        ),
        claimed_amount=draw(amount),
        approved_amount=draw(amount),
    )


@st.composite
def filing_export_strategy(draw) -> FilingExport:
    """FilingExport with varying numbers of entries (0 or more)."""
    return FilingExport(
        taxpayer_name=draw(short_text),
        tin=draw(valid_tin),
        yoa=draw(st.integers(min_value=2000, max_value=2050)),
        filing_reference=draw(nullable_text),
        status=draw(st.sampled_from(["Draft", "Confirmed", "Submitted"])),
        total_income_ngn=draw(nullable_amount),
        chargeable_income=draw(nullable_amount),
        tax_payable=draw(nullable_amount),
        net_tax_payable=draw(nullable_amount),
        minimum_tax=draw(nullable_amount),
        final_tax_payable=draw(nullable_amount),
        income_entries=draw(st.lists(income_entry_strategy(), min_size=0, max_size=5)),
        capital_allowances=draw(st.lists(capital_allowance_strategy(), min_size=0, max_size=3)),
        relief_entries=draw(st.lists(relief_entry_strategy(), min_size=0, max_size=5)),
        document_paths=draw(st.lists(st.text(min_size=1, max_size=100), min_size=0, max_size=3)),
    )


@st.composite
def filing_with_entries_strategy(draw) -> FilingExport:
    """FilingExport with at least one income entry (required for Property 22)."""
    return FilingExport(
        taxpayer_name=draw(short_text),
        tin=draw(valid_tin),
        yoa=draw(st.integers(min_value=2000, max_value=2050)),
        filing_reference=draw(nullable_text),
        status=draw(st.sampled_from(["Draft", "Confirmed", "Submitted"])),
        total_income_ngn=draw(nullable_amount),
        chargeable_income=draw(nullable_amount),
        tax_payable=draw(nullable_amount),
        net_tax_payable=draw(nullable_amount),
        minimum_tax=draw(nullable_amount),
        final_tax_payable=draw(nullable_amount),
        income_entries=draw(st.lists(income_entry_strategy(), min_size=1, max_size=5)),
        capital_allowances=[],
        relief_entries=[],
        document_paths=[],
    )


# ---------------------------------------------------------------------------
# Property 21: JSON export round-trip
# Feature: lagos-file, Property 21: JSON export round-trip
# Validates: Requirements 11.3
# ---------------------------------------------------------------------------


@given(filing=filing_export_strategy())
@settings(max_examples=25)
def test_property_21_json_export_round_trip(filing: FilingExport):
    """
    For any FilingExport, serializing to JSON and deserializing should produce
    identical field values for all income entries, capital allowances, relief
    entries, computed totals, and document paths.

    **Validates: Requirements 11.3**
    """
    # Feature: lagos-file, Property 21: JSON export round-trip
    json_str = engine.export_json(filing)
    data = json.loads(json_str)

    # Header fields
    assert data["taxpayer_name"] == filing.taxpayer_name
    assert data["tin"] == filing.tin
    assert data["yoa"] == filing.yoa
    assert data["filing_reference"] == filing.filing_reference
    assert data["status"] == filing.status

    # Computed totals
    assert data["total_income_ngn"] == filing.total_income_ngn
    assert data["chargeable_income"] == filing.chargeable_income
    assert data["tax_payable"] == filing.tax_payable
    assert data["net_tax_payable"] == filing.net_tax_payable
    assert data["minimum_tax"] == filing.minimum_tax
    assert data["final_tax_payable"] == filing.final_tax_payable

    # Income entries — all fields identical
    assert len(data["income_entries"]) == len(filing.income_entries)
    for serialized, original in zip(data["income_entries"], filing.income_entries):
        assert serialized == asdict(original)

    # Capital allowances — all fields identical
    assert len(data["capital_allowances"]) == len(filing.capital_allowances)
    for serialized, original in zip(data["capital_allowances"], filing.capital_allowances):
        assert serialized == asdict(original)

    # Relief entries — all fields identical
    assert len(data["relief_entries"]) == len(filing.relief_entries)
    for serialized, original in zip(data["relief_entries"], filing.relief_entries):
        assert serialized == asdict(original)

    # Document paths
    assert data["document_paths"] == filing.document_paths


# ---------------------------------------------------------------------------
# Property 22: CSV export contains required columns
# Feature: lagos-file, Property 22: CSV export contains required columns
# Validates: Requirements 11.2
# ---------------------------------------------------------------------------

REQUIRED_COLUMNS = ExportEngine.CSV_COLUMNS


@given(filing=filing_with_entries_strategy())
@settings(max_examples=25)
def test_property_22_csv_export_contains_required_columns(filing: FilingExport):
    """
    For any FilingExport with at least one income entry, the CSV export should
    contain all required columns: income_type, description, gross_amount_ngn,
    foreign_currency, foreign_amount, date, fetched_fx_rate, cbn_override_rate,
    naira_equivalent, rate_source.

    **Validates: Requirements 11.2**
    """
    # Feature: lagos-file, Property 22: CSV export contains required columns
    assert len(filing.income_entries) >= 1, "Precondition: at least one income entry"

    csv_str = engine.export_csv(filing)
    reader = csv.reader(io.StringIO(csv_str))
    rows = list(reader)

    # Find the column header row (first row whose first cell is "income_type")
    col_row = None
    for row in rows:
        if row and row[0] == "income_type":
            col_row = row
            break

    assert col_row is not None, "Column header row not found in CSV output"

    # Every required column must be present
    for col in REQUIRED_COLUMNS:
        assert col in col_row, f"Required column '{col}' missing from CSV header row"

    # The number of data rows must equal the number of income entries
    col_row_idx = rows.index(col_row)
    data_rows = [r for r in rows[col_row_idx + 1:] if r]
    assert len(data_rows) == len(filing.income_entries), (
        f"Expected {len(filing.income_entries)} data rows, got {len(data_rows)}"
    )




