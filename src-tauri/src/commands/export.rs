use crate::AppState;
use printpdf::*;
use rusqlite::params;
use std::io::BufWriter;
use tauri::State;

// ── shared DB helpers ─────────────────────────────────────────

struct FilingSummary {
    filing_reference: Option<String>,
    year_of_assessment: i32,
    total_income_ngn: Option<f64>,
    chargeable_income: Option<f64>,
    tax_payable: Option<f64>,
    wht_credit: Option<f64>,
    net_tax_payable: Option<f64>,
    minimum_tax: Option<f64>,
    final_tax_payable: Option<f64>,
    tax_config_version: String,
    full_name: String,
    tin: String,
    confirmed_at: Option<String>,
}

fn load_summary(conn: &rusqlite::Connection, filing_id: &str) -> Result<FilingSummary, String> {
    conn.query_row(
        "SELECT f.filing_reference, f.year_of_assessment,
                f.total_income_ngn, f.chargeable_income, f.tax_payable,
                f.wht_credit, f.net_tax_payable, f.minimum_tax, f.final_tax_payable,
                f.tax_config_version, f.confirmed_at,
                t.full_name, t.tin
         FROM filing f JOIN taxpayer t ON t.id = f.taxpayer_id
         WHERE f.id = ?1",
        params![filing_id],
        |row| {
            Ok(FilingSummary {
                filing_reference:   row.get(0)?,
                year_of_assessment: row.get(1)?,
                total_income_ngn:   row.get(2)?,
                chargeable_income:  row.get(3)?,
                tax_payable:        row.get(4)?,
                wht_credit:         row.get(5)?,
                net_tax_payable:    row.get(6)?,
                minimum_tax:        row.get(7)?,
                final_tax_payable:  row.get(8)?,
                tax_config_version: row.get(9)?,
                confirmed_at:       row.get(10)?,
                full_name:          row.get(11)?,
                tin:                row.get(12)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

fn naira(v: Option<f64>) -> String {
    match v {
        Some(n) => format!("NGN {:>16.2}", n),
        None    => "—".to_string(),
    }
}

fn ensure_parent(path: &str) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ── PDF export ────────────────────────────────────────────────

#[tauri::command]
pub async fn export_filing_pdf(
    filing_id: String,
    save_path: String,
    _include_attachments: bool,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let summary = {
        let guard = state.db.lock().map_err(|e| e.to_string())?;
        let db = guard.as_ref().ok_or("Database not unlocked")?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        load_summary(&conn, &filing_id)?
    };

    ensure_parent(&save_path)?;

    // ── Build PDF (A4 portrait, 210×297 mm) ───────────────────
    let (doc, page1, layer1) = PdfDocument::new(
        "LagosFile Tax Computation Statement",
        Mm(210.0),
        Mm(297.0),
        "Layer 1",
    );
    let layer = doc.get_page(page1).get_layer(layer1);

    let font_bold = doc
        .add_builtin_font(BuiltinFont::HelveticaBold)
        .map_err(|e| e.to_string())?;
    let font = doc
        .add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|e| e.to_string())?;

    let left   = Mm(20.0);
    let right  = Mm(190.0);
    let mut y  = Mm(275.0);
    let line_h = Mm(7.0);
    let gap    = Mm(5.0);

    // ── Header ────────────────────────────────────────────────
    layer.use_text("LAGOS STATE DIRECT ASSESSMENT", 9.0, left, y, &font);
    layer.use_text("NIGERIA TAX ACT 2025", 9.0, Mm(145.0), y, &font);
    y = y - Mm(6.0);

    layer.use_text("TAX COMPUTATION STATEMENT", 18.0, left, y, &font_bold);
    y = y - Mm(3.0);

    layer.add_shape(Line {
        points: vec![
            (Point::new(left, y), false),
            (Point::new(right, y), false),
        ],
        is_closed: false,
        has_fill: false,
        has_stroke: true,
        is_clipping_path: false,
    });
    y = y - gap;

    // ── Taxpayer details ──────────────────────────────────────
    let details: &[(&str, String)] = &[
        ("Taxpayer",         summary.full_name.clone()),
        ("TIN",              summary.tin.clone()),
        ("Year of Assessment", summary.year_of_assessment.to_string()),
        ("Filing Reference", summary.filing_reference.clone().unwrap_or_else(|| "—".to_string())),
        ("Confirmed At",     summary.confirmed_at.as_deref().map(|s| &s[..10]).unwrap_or("—").to_string()),
        ("Tax Config",       summary.tax_config_version.clone()),
    ];
    for (label, value) in details {
        layer.use_text(*label, 8.0, left, y, &font_bold);
        layer.use_text(value.as_str(), 10.0, Mm(70.0), y, &font);
        y = y - line_h;
    }

    y = y - Mm(2.0);
    layer.add_shape(Line {
        points: vec![
            (Point::new(left, y), false),
            (Point::new(right, y), false),
        ],
        is_closed: false,
        has_fill: false,
        has_stroke: true,
        is_clipping_path: false,
    });
    y = y - gap;

    // ── Computation summary ───────────────────────────────────
    layer.use_text("COMPUTATION SUMMARY", 11.0, left, y, &font_bold);
    y = y - line_h;

    let rows: &[(&str, String)] = &[
        ("Total Gross Income",    naira(summary.total_income_ngn)),
        ("Chargeable Income",     naira(summary.chargeable_income)),
        ("Gross Tax (PITA bands)",naira(summary.tax_payable)),
        ("WHT Credits",           naira(summary.wht_credit.map(|v| -v))),
        ("Net Tax Payable",       naira(summary.net_tax_payable)),
        ("Minimum Tax (1%)",      naira(summary.minimum_tax)),
    ];
    for (label, value) in rows {
        layer.use_text(*label, 9.0, left, y, &font);
        layer.use_text(value.as_str(), 9.0, Mm(118.0), y, &font);
        y = y - line_h;
    }

    y = y - Mm(2.0);
    layer.add_shape(Line {
        points: vec![
            (Point::new(Mm(116.0), y), false),
            (Point::new(right, y), false),
        ],
        is_closed: false,
        has_fill: false,
        has_stroke: true,
        is_clipping_path: false,
    });
    y = y - Mm(4.0);
    layer.use_text("FINAL TAX PAYABLE", 11.0, left, y, &font_bold);
    layer.use_text(&naira(summary.final_tax_payable), 11.0, Mm(118.0), y, &font_bold);
    y = y - Mm(14.0);

    // ── Footer ────────────────────────────────────────────────
    layer.add_shape(Line {
        points: vec![
            (Point::new(left, y), false),
            (Point::new(right, y), false),
        ],
        is_closed: false,
        has_fill: false,
        has_stroke: true,
        is_clipping_path: false,
    });
    y = y - gap;
    layer.use_text(
        "Generated by LagosFile v2.0 (Angular + Tauri). Governed by NTA 2025 — LIRS.",
        8.0, left, y, &font,
    );
    y = y - Mm(5.0);
    layer.use_text(
        &format!("Exported: {}", chrono::Utc::now().format("%Y-%m-%d %H:%M UTC")),
        8.0, left, y, &font,
    );

    // ── Write to disk ─────────────────────────────────────────
    doc.save(&mut BufWriter::new(
        std::fs::File::create(&save_path).map_err(|e| e.to_string())?,
    ))
    .map_err(|e| e.to_string())?;

    Ok(save_path)
}

// ── CSV export ────────────────────────────────────────────────

#[tauri::command]
pub async fn export_filing_csv(
    filing_id: String,
    save_path: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let guard = state.db.lock().map_err(|e| e.to_string())?;
    let db = guard.as_ref().ok_or("Database not unlocked")?;
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let summary = load_summary(&conn, &filing_id)?;

    let mut stmt = conn
        .prepare(
            "SELECT income_type,description,gross_amount_ngn,is_foreign,foreign_currency,
                    foreign_amount,income_date,fx_rate_used,fx_rate_source
             FROM income_entry WHERE filing_id=?1",
        )
        .map_err(|e| e.to_string())?;

    let mut csv = format!(
        "LagosFile Tax Export — YOA {} — {}\r\n\
         Taxpayer,{}\r\n\
         TIN,{}\r\n\
         Filing Reference,{}\r\n\
         Final Tax Payable NGN,{:.2}\r\n\r\n",
        summary.year_of_assessment,
        summary.filing_reference.as_deref().unwrap_or("—"),
        summary.full_name,
        summary.tin,
        summary.filing_reference.as_deref().unwrap_or("—"),
        summary.final_tax_payable.unwrap_or(0.0),
    );

    csv.push_str(
        "income_type,description,gross_amount_ngn,is_foreign,foreign_currency,\
         foreign_amount,income_date,fx_rate_used,fx_rate_source\r\n",
    );

    stmt.query_map(params![filing_id], |row| {
        Ok(format!(
            "{},{},{:.2},{},{},{},{},{},{}\r\n",
            row.get::<_, String>(0)?,
            row.get::<_, Option<String>>(1)?.unwrap_or_default(),
            row.get::<_, f64>(2)?,
            row.get::<_, i32>(3)?,
            row.get::<_, Option<String>>(4)?.unwrap_or_default(),
            row.get::<_, Option<f64>>(5)?.map_or(String::new(), |v| format!("{:.2}", v)),
            row.get::<_, Option<String>>(6)?.unwrap_or_default(),
            row.get::<_, Option<f64>>(7)?.map_or(String::new(), |v| v.to_string()),
            row.get::<_, Option<String>>(8)?.unwrap_or_default(),
        ))
    })
    .map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .for_each(|line| csv.push_str(&line));

    ensure_parent(&save_path)?;
    std::fs::write(&save_path, csv.as_bytes()).map_err(|e| e.to_string())?;
    Ok(save_path)
}

// ── JSON export ───────────────────────────────────────────────

#[tauri::command]
pub async fn export_filing_json(
    filing_id: String,
    save_path: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let guard = state.db.lock().map_err(|e| e.to_string())?;
    let db = guard.as_ref().ok_or("Database not unlocked")?;
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let summary = load_summary(&conn, &filing_id)?;

    let mut income_stmt = conn
        .prepare(
            "SELECT income_type,description,gross_amount_ngn,is_foreign,
                    foreign_currency,foreign_amount,income_date,
                    fx_rate_used,fx_rate_source,foreign_tax_paid_ngn
             FROM income_entry WHERE filing_id=?1",
        )
        .map_err(|e| e.to_string())?;

    let income_entries: Vec<serde_json::Value> = income_stmt
        .query_map(params![filing_id], |row| {
            Ok(serde_json::json!({
                "incomeType":        row.get::<_,String>(0)?,
                "description":       row.get::<_,Option<String>>(1)?,
                "grossAmountNgn":    row.get::<_,f64>(2)?,
                "isForeign":         row.get::<_,i32>(3)? == 1,
                "foreignCurrency":   row.get::<_,Option<String>>(4)?,
                "foreignAmount":     row.get::<_,Option<f64>>(5)?,
                "incomeDate":        row.get::<_,Option<String>>(6)?,
                "fxRateUsed":        row.get::<_,Option<f64>>(7)?,
                "fxRateSource":      row.get::<_,Option<String>>(8)?,
                "foreignTaxPaidNgn": row.get::<_,Option<f64>>(9)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let output = serde_json::json!({
        "export": {
            "generator":   "LagosFile v2.0",
            "generatedAt": chrono::Utc::now().to_rfc3339(),
            "legislation": "Nigeria Tax Act (NTA) 2025",
        },
        "taxpayer": {
            "fullName": summary.full_name,
            "tin":      summary.tin,
        },
        "filing": {
            "yearOfAssessment": summary.year_of_assessment,
            "filingReference":  summary.filing_reference,
            "confirmedAt":      summary.confirmed_at,
            "taxConfigVersion": summary.tax_config_version,
            "totalIncomeNgn":   summary.total_income_ngn,
            "chargeableIncome": summary.chargeable_income,
            "taxPayable":       summary.tax_payable,
            "whtCredit":        summary.wht_credit,
            "netTaxPayable":    summary.net_tax_payable,
            "minimumTax":       summary.minimum_tax,
            "finalTaxPayable":  summary.final_tax_payable,
        },
        "incomeEntries": income_entries,
    });

    let json = serde_json::to_string_pretty(&output).map_err(|e| e.to_string())?;
    ensure_parent(&save_path)?;
    std::fs::write(&save_path, json.as_bytes()).map_err(|e| e.to_string())?;
    Ok(save_path)
}
