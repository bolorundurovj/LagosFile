from __future__ import annotations

import csv
import io
import json
from dataclasses import asdict, dataclass, field


@dataclass
class IncomeEntryExport:
    income_type: str
    description: str | None
    gross_amount_ngn: float
    foreign_currency: str | None
    foreign_amount: float | None
    income_date: str | None  # ISO date string
    fx_rate_fetched: float | None
    fx_rate_cbn_override: float | None
    fx_rate_used: float | None
    fx_rate_source: str | None


@dataclass
class CapitalAllowanceExport:
    asset_description: str
    asset_type: str
    asset_cost: float
    annual_allowance_amount: float
    tax_written_down_value: float


@dataclass
class ReliefEntryExport:
    relief_type: str
    claimed_amount: float
    approved_amount: float


@dataclass
class FilingExport:
    taxpayer_name: str
    tin: str
    yoa: int
    filing_reference: str | None
    status: str
    total_income_ngn: float | None
    chargeable_income: float | None
    tax_payable: float | None
    net_tax_payable: float | None
    minimum_tax: float | None
    final_tax_payable: float | None
    income_entries: list[IncomeEntryExport] = field(default_factory=list)
    capital_allowances: list[CapitalAllowanceExport] = field(default_factory=list)
    relief_entries: list[ReliefEntryExport] = field(default_factory=list)
    document_paths: list[str] = field(default_factory=list)  # file paths of attached documents


class ExportEngine:
    def export_json(self, filing: FilingExport) -> str:
        data = {
            "taxpayer_name": filing.taxpayer_name,
            "tin": filing.tin,
            "yoa": filing.yoa,
            "filing_reference": filing.filing_reference,
            "status": filing.status,
            "total_income_ngn": filing.total_income_ngn,
            "chargeable_income": filing.chargeable_income,
            "tax_payable": filing.tax_payable,
            "net_tax_payable": filing.net_tax_payable,
            "minimum_tax": filing.minimum_tax,
            "final_tax_payable": filing.final_tax_payable,
            "income_entries": [asdict(e) for e in filing.income_entries],
            "capital_allowances": [asdict(ca) for ca in filing.capital_allowances],
            "relief_entries": [asdict(r) for r in filing.relief_entries],
            "document_paths": filing.document_paths,
        }
        return json.dumps(data, indent=2, ensure_ascii=False)

    CSV_COLUMNS = [
        "income_type",
        "description",
        "gross_amount_ngn",
        "foreign_currency",
        "foreign_amount",
        "date",
        "fetched_fx_rate",
        "cbn_override_rate",
        "naira_equivalent",
        "rate_source",
    ]

    def export_csv(self, filing: FilingExport) -> str:
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Taxpayer Name", filing.taxpayer_name])
        writer.writerow(["TIN", filing.tin])
        writer.writerow(["Year of Assessment", filing.yoa])
        writer.writerow([])  # blank separator
        writer.writerow(self.CSV_COLUMNS)
        for entry in filing.income_entries:
            writer.writerow(
                [
                    entry.income_type,
                    entry.description,
                    entry.gross_amount_ngn,
                    entry.foreign_currency,
                    entry.foreign_amount,
                    entry.income_date,
                    entry.fx_rate_fetched,
                    entry.fx_rate_cbn_override,
                    entry.gross_amount_ngn,  # naira_equivalent = gross_amount_ngn (already converted)
                    entry.fx_rate_source,
                ]
            )
        return output.getvalue()

    def export_pdf(self, filing: FilingExport, include_attachments: bool = True) -> bytes:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import cm
        from reportlab.platypus import (
            Paragraph,
            SimpleDocTemplate,
            Spacer,
            Table,
            TableStyle,
        )

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            leftMargin=2 * cm,
            rightMargin=2 * cm,
            topMargin=2 * cm,
            bottomMargin=2 * cm,
        )
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            "Title",
            parent=styles["Heading1"],
            fontSize=14,
            spaceAfter=6,
        )
        heading_style = ParagraphStyle(
            "Heading",
            parent=styles["Heading2"],
            fontSize=11,
            spaceAfter=4,
        )
        normal = styles["Normal"]
        story = []
        story.append(Paragraph("LAGOS INTERNAL REVENUE SERVICE", title_style))
        story.append(Paragraph("Direct Assessment — Tax Computation Statement", heading_style))
        story.append(Spacer(1, 0.3 * cm))
        header_data = [
            ["Taxpayer Name:", filing.taxpayer_name],
            ["TIN:", filing.tin],
            ["Year of Assessment:", str(filing.yoa)],
            ["Filing Reference:", filing.filing_reference or "N/A"],
            ["Status:", filing.status],
        ]
        header_table = Table(header_data, colWidths=[5 * cm, 12 * cm])
        header_table.setStyle(
            TableStyle(
                [
                    ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                    ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
                    ("FONTSIZE", (0, 0), (-1, -1), 10),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]
            )
        )
        story.append(header_table)
        story.append(Spacer(1, 0.5 * cm))
        story.append(Paragraph("Tax Computation", heading_style))

        def _fmt(val: float | None) -> str:
            if val is None:
                return "—"
            return f"₦{val:,.2f}"

        computation_data = [
            ["Description", "Amount (₦)"],
            ["Total Income (NGN)", _fmt(filing.total_income_ngn)],
            ["Chargeable Income", _fmt(filing.chargeable_income)],
            ["Tax Payable (Graduated)", _fmt(filing.tax_payable)],
            ["Net Tax Payable (after WHT)", _fmt(filing.net_tax_payable)],
            ["Minimum Tax (1% of Total Income)", _fmt(filing.minimum_tax)],
            ["Final Tax Payable", _fmt(filing.final_tax_payable)],
        ]
        comp_table = Table(computation_data, colWidths=[12 * cm, 5 * cm])
        comp_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a3c5e")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                    ("FONTSIZE", (0, 0), (-1, -1), 10),
                    (
                        "ROWBACKGROUNDS",
                        (0, 1),
                        (-1, -1),
                        [colors.white, colors.HexColor("#f5f5f5")],
                    ),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                    ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
                ]
            )
        )
        story.append(comp_table)
        story.append(Spacer(1, 0.5 * cm))
        foreign_entries = [e for e in filing.income_entries if e.foreign_currency]
        if foreign_entries:
            story.append(Paragraph("Foreign Income Summary", heading_style))
            fx_data = [
                [
                    "Income Type",
                    "Currency",
                    "Foreign Amount",
                    "FX Rate Used",
                    "Rate Source",
                    "NGN Equivalent",
                ]
            ]
            for e in foreign_entries:
                fx_data.append(
                    [
                        e.income_type,
                        e.foreign_currency or "—",
                        (f"{e.foreign_amount:,.2f}" if e.foreign_amount is not None else "—"),
                        f"{e.fx_rate_used:,.4f}" if e.fx_rate_used is not None else "—",
                        e.fx_rate_source or "—",
                        _fmt(e.gross_amount_ngn),
                    ]
                )
            fx_table = Table(fx_data, colWidths=[3 * cm, 2.5 * cm, 3 * cm, 3 * cm, 3 * cm, 3 * cm])
            fx_table.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a3c5e")),
                        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                        ("FONTSIZE", (0, 0), (-1, -1), 9),
                        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                        ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ]
                )
            )
            story.append(fx_table)
            story.append(Spacer(1, 0.5 * cm))
        if filing.relief_entries:
            story.append(Paragraph("Relief Breakdown", heading_style))
            relief_data = [["Relief Type", "Claimed (₦)", "Approved (₦)"]]
            for r in filing.relief_entries:
                relief_data.append(
                    [
                        r.relief_type,
                        f"{r.claimed_amount:,.2f}",
                        f"{r.approved_amount:,.2f}",
                    ]
                )
            relief_table = Table(relief_data, colWidths=[9 * cm, 4 * cm, 4 * cm])
            relief_table.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a3c5e")),
                        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                        ("FONTSIZE", (0, 0), (-1, -1), 10),
                        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                        ("TOPPADDING", (0, 0), (-1, -1), 4),
                        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
                    ]
                )
            )
            story.append(relief_table)
            story.append(Spacer(1, 0.5 * cm))
        if include_attachments and filing.document_paths:
            story.append(Paragraph("Document Attachment Index", heading_style))
            for i, path in enumerate(filing.document_paths, start=1):
                story.append(Paragraph(f"{i}. {path}", normal))
            story.append(Spacer(1, 0.3 * cm))
        doc.build(story)
        return buffer.getvalue()
