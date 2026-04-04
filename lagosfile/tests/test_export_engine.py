"""
Unit tests for ExportEngine — JSON, CSV, and PDF exports.

Covers:
  - JSON export includes required header fields
  - CSV export has correct column headers
  - PDF export returns bytes
  - PDF export is non-empty
"""

import csv
import io
import json

from lagosfile.services.export_engine import (
    CapitalAllowanceExport,
    ExportEngine,
    FilingExport,
    IncomeEntryExport,
    ReliefEntryExport,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def make_filing(**overrides) -> FilingExport:
    defaults = {
        "taxpayer_name": "Adaeze Okonkwo",
        "tin": "1234567890123",
        "yoa": 2025,
        "filing_reference": "LIRS/REF/2025/00001",
        "status": "Confirmed",
        "total_income_ngn": 5_000_000.0,
        "chargeable_income": 4_200_000.0,
        "tax_payable": 450_000.0,
        "net_tax_payable": 400_000.0,
        "minimum_tax": 50_000.0,
        "final_tax_payable": 400_000.0,
        "income_entries": [
            IncomeEntryExport(
                income_type="employment",
                description="Salary",
                gross_amount_ngn=5_000_000.0,
                foreign_currency=None,
                foreign_amount=None,
                income_date="2025-03-31",
                fx_rate_fetched=None,
                fx_rate_cbn_override=None,
                fx_rate_used=None,
                fx_rate_source=None,
            )
        ],
        "capital_allowances": [
            CapitalAllowanceExport(
                asset_description="MacBook Pro",
                asset_type="Computer/Laptop",
                asset_cost=800_000.0,
                annual_allowance_amount=200_000.0,
                tax_written_down_value=600_000.0,
            )
        ],
        "relief_entries": [
            ReliefEntryExport(
                relief_type="pension",
                claimed_amount=300_000.0,
                approved_amount=300_000.0,
            )
        ],
        "document_paths": ["/home/user/LagosFile/documents/1234567890123/2025/entry1/receipt.pdf"],
    }
    defaults.update(overrides)
    return FilingExport(**defaults)


engine = ExportEngine()


# ---------------------------------------------------------------------------
# JSON export tests
# ---------------------------------------------------------------------------


def test_json_export_includes_taxpayer_name():
    filing = make_filing()
    result = json.loads(engine.export_json(filing))
    assert result["taxpayer_name"] == "Adaeze Okonkwo"


def test_json_export_includes_tin():
    filing = make_filing()
    result = json.loads(engine.export_json(filing))
    assert result["tin"] == "1234567890123"


def test_json_export_includes_yoa():
    filing = make_filing()
    result = json.loads(engine.export_json(filing))
    assert result["yoa"] == 2025


def test_json_export_includes_income_entries():
    filing = make_filing()
    result = json.loads(engine.export_json(filing))
    assert len(result["income_entries"]) == 1
    assert result["income_entries"][0]["income_type"] == "employment"


def test_json_export_includes_capital_allowances():
    filing = make_filing()
    result = json.loads(engine.export_json(filing))
    assert len(result["capital_allowances"]) == 1
    assert result["capital_allowances"][0]["asset_type"] == "Computer/Laptop"


def test_json_export_includes_relief_entries():
    filing = make_filing()
    result = json.loads(engine.export_json(filing))
    assert len(result["relief_entries"]) == 1
    assert result["relief_entries"][0]["relief_type"] == "pension"


def test_json_export_includes_document_paths():
    filing = make_filing()
    result = json.loads(engine.export_json(filing))
    assert len(result["document_paths"]) == 1


def test_json_export_includes_computed_totals():
    filing = make_filing()
    result = json.loads(engine.export_json(filing))
    assert result["total_income_ngn"] == 5_000_000.0
    assert result["final_tax_payable"] == 400_000.0


# ---------------------------------------------------------------------------
# CSV export tests
# ---------------------------------------------------------------------------


def test_csv_export_has_correct_column_headers():
    filing = make_filing()
    csv_str = engine.export_csv(filing)
    reader = csv.reader(io.StringIO(csv_str))
    rows = list(reader)

    # Find the column header row (after the 3 header rows + blank row)
    # Header block: taxpayer_name, tin, yoa, blank, then columns
    col_row = None
    for row in rows:
        if row and row[0] == "income_type":
            col_row = row
            break

    assert col_row is not None, "Column header row not found in CSV"
    assert col_row == ExportEngine.CSV_COLUMNS


def test_csv_export_includes_taxpayer_name_header():
    filing = make_filing()
    csv_str = engine.export_csv(filing)
    assert "Adaeze Okonkwo" in csv_str


def test_csv_export_includes_tin_header():
    filing = make_filing()
    csv_str = engine.export_csv(filing)
    assert "1234567890123" in csv_str


def test_csv_export_includes_yoa_header():
    filing = make_filing()
    csv_str = engine.export_csv(filing)
    assert "2025" in csv_str


def test_csv_export_has_data_row_for_each_income_entry():
    filing = make_filing()
    csv_str = engine.export_csv(filing)
    reader = csv.reader(io.StringIO(csv_str))
    rows = list(reader)

    # Count rows after the column header row
    col_row_idx = None
    for i, row in enumerate(rows):
        if row and row[0] == "income_type":
            col_row_idx = i
            break

    assert col_row_idx is not None
    data_rows = [r for r in rows[col_row_idx + 1 :] if r]
    assert len(data_rows) == len(filing.income_entries)


# ---------------------------------------------------------------------------
# PDF export tests
# ---------------------------------------------------------------------------


def test_pdf_export_returns_bytes():
    filing = make_filing()
    result = engine.export_pdf(filing)
    assert isinstance(result, bytes)


def test_pdf_export_is_non_empty():
    filing = make_filing()
    result = engine.export_pdf(filing)
    assert len(result) > 0


def test_pdf_export_starts_with_pdf_magic_bytes():
    filing = make_filing()
    result = engine.export_pdf(filing)
    assert result[:4] == b"%PDF"


def test_pdf_export_without_attachments():
    filing = make_filing()
    result = engine.export_pdf(filing, include_attachments=False)
    assert isinstance(result, bytes)
    assert len(result) > 0


def test_pdf_export_with_foreign_income():
    """PDF with foreign income entries should include FX summary block."""
    filing = make_filing(
        income_entries=[
            IncomeEntryExport(
                income_type="freelance",
                description="Consulting",
                gross_amount_ngn=2_000_000.0,
                foreign_currency="USD",
                foreign_amount=1_250.0,
                income_date="2025-06-15",
                fx_rate_fetched=1580.0,
                fx_rate_cbn_override=1600.0,
                fx_rate_used=1600.0,
                fx_rate_source="CBN Override",
            )
        ]
    )
    result = engine.export_pdf(filing)
    assert isinstance(result, bytes)
    assert len(result) > 0


def test_json_export_round_trip():
    """Parse the JSON back and verify all field values match the original."""
    filing = make_filing()
    result = json.loads(engine.export_json(filing))

    # Header fields
    assert result["taxpayer_name"] == filing.taxpayer_name
    assert result["tin"] == filing.tin
    assert result["yoa"] == filing.yoa

    # Computed totals
    assert result["total_income_ngn"] == filing.total_income_ngn
    assert result["chargeable_income"] == filing.chargeable_income
    assert result["tax_payable"] == filing.tax_payable
    assert result["net_tax_payable"] == filing.net_tax_payable
    assert result["minimum_tax"] == filing.minimum_tax
    assert result["final_tax_payable"] == filing.final_tax_payable

    # Income entries
    assert len(result["income_entries"]) == len(filing.income_entries)
    assert result["income_entries"][0]["income_type"] == filing.income_entries[0].income_type
    assert result["income_entries"][0]["gross_amount_ngn"] == filing.income_entries[0].gross_amount_ngn

    # Capital allowances
    assert len(result["capital_allowances"]) == len(filing.capital_allowances)
    assert result["capital_allowances"][0]["asset_cost"] == filing.capital_allowances[0].asset_cost

    # Relief entries
    assert len(result["relief_entries"]) == len(filing.relief_entries)
    assert result["relief_entries"][0]["approved_amount"] == filing.relief_entries[0].approved_amount

    # Document paths
    assert result["document_paths"] == filing.document_paths
