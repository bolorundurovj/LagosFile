use crate::AppState;
use ::lopdf;
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

fn format_with_commas(n: f64) -> String {
    let negative = n < 0.0;
    let abs = n.abs();
    let integer = abs.floor() as u64;
    let cents   = (abs.fract() * 100.0).round() as u32;

    // Insert commas every 3 digits from the right
    let int_str: Vec<char> = integer.to_string().chars().collect();
    let mut with_commas = String::new();
    let len = int_str.len();
    for (i, &ch) in int_str.iter().enumerate() {
        if i > 0 && (len - i) % 3 == 0 {
            with_commas.push(',');
        }
        with_commas.push(ch);
    }

    let formatted = format!("{}.{:02}", with_commas, cents);
    if negative { format!("-{}", formatted) } else { formatted }
}

fn naira(v: Option<f64>) -> String {
    match v {
        Some(n) => format!("NGN {}", format_with_commas(n)),
        None    => "—".to_string(),
    }
}

fn ensure_parent(path: &str) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ── Attachment helpers ────────────────────────────────────────

struct DocRecord {
    file_path: String,
    file_name: String,
    file_type: String,
    parent_entry_type: String,
}

fn load_filing_documents(
    conn: &rusqlite::Connection,
    filing_id: &str,
) -> Result<Vec<DocRecord>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT d.file_path, d.file_name, d.file_type, d.parent_entry_type
             FROM document d
             WHERE d.parent_entry_id IN (
                 SELECT id FROM income_entry      WHERE filing_id = ?1
                 UNION ALL
                 SELECT id FROM capital_allowance WHERE filing_id = ?1
                 UNION ALL
                 SELECT id FROM relief_entry       WHERE filing_id = ?1
             )
             ORDER BY d.uploaded_at",
        )
        .map_err(|e| e.to_string())?;

    let docs: Vec<DocRecord> = stmt
        .query_map(params![filing_id], |row| {
            Ok(DocRecord {
                file_path:         row.get(0)?,
                file_name:         row.get(1)?,
                file_type:         row.get(2)?,
                parent_entry_type: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(docs)
}

fn is_image_attachment(file_type: &str, file_name: &str) -> bool {
    let t = file_type.to_lowercase();
    let n = file_name.to_lowercase();
    t.contains("image") || t.contains("jpeg") || t.contains("jpg") || t.contains("png")
        || n.ends_with(".jpg") || n.ends_with(".jpeg") || n.ends_with(".png")
}

fn is_pdf_attachment(file_type: &str, file_name: &str) -> bool {
    let t = file_type.to_lowercase();
    let n = file_name.to_lowercase();
    t.contains("pdf") || n.ends_with(".pdf")
}

/// Append pages from each attachment PDF into the already-saved main PDF using lopdf.
fn append_pdf_attachments(main_path: &str, att_paths: &[String]) -> Result<(), String> {
    if att_paths.is_empty() {
        return Ok(());
    }

    let mut main = lopdf::Document::load(main_path)
        .map_err(|e| format!("Cannot reload PDF for merging: {}", e))?;

    for att_path in att_paths {
        let mut att = match lopdf::Document::load(att_path) {
            Ok(d) => d,
            Err(e) => {
                eprintln!("Skipping attachment '{}': {}", att_path, e);
                continue;
            }
        };

        // Renumber attachment object IDs so they don't collide with main
        let start = main.max_id + 1;
        att.renumber_objects_with(start);
        main.max_id = att.max_id;

        // Locate main doc's Pages root — extract ID before any mutable borrow
        let pages_root_id: lopdf::ObjectId = {
            let root_id = main.trailer
                .get(b"Root")
                .and_then(|o| o.as_reference())
                .map_err(|e| e.to_string())?;
            let catalog_obj = main.objects.get(&root_id)
                .ok_or("Catalog object not found")?;
            if let lopdf::Object::Dictionary(ref catalog) = catalog_obj {
                catalog.get(b"Pages")
                    .and_then(|p| p.as_reference())
                    .map_err(|e| e.to_string())?
            } else {
                return Err("Catalog is not a dictionary".to_string());
            }
        };

        // Collect attachment page object IDs (sorted by page number)
        let att_page_ids: Vec<lopdf::ObjectId> = {
            let mut pages: Vec<_> = att.get_pages().into_iter().collect();
            pages.sort_by_key(|(num, _)| *num);
            pages.into_iter().map(|(_, id)| id).collect()
        };
        let page_count = att_page_ids.len() as i64;

        // Re-parent each attachment page to main's Pages root
        for &pid in &att_page_ids {
            if let Some(lopdf::Object::Dictionary(ref mut d)) = att.objects.get_mut(&pid) {
                d.set("Parent", pages_root_id);
            }
        }

        // Move all attachment objects into main
        for (id, obj) in att.objects {
            main.objects.insert(id, obj);
        }

        // Update main's Pages root: append Kids + increment Count
        if let Some(lopdf::Object::Dictionary(ref mut pd)) = main.objects.get_mut(&pages_root_id) {
            if let Ok(lopdf::Object::Integer(ref mut count)) = pd.get_mut(b"Count") {
                *count += page_count;
            }
            if let Ok(lopdf::Object::Array(ref mut kids)) = pd.get_mut(b"Kids") {
                for &pid in &att_page_ids {
                    kids.push(lopdf::Object::Reference(pid));
                }
            }
        }
    }

    main.save(main_path)
        .map_err(|e| format!("Failed to save merged PDF: {}", e))?;
    Ok(())
}

fn add_attachments_appendix(
    doc: &PdfDocumentReference,
    records: &[DocRecord],
    non_image_folder: Option<&str>,
) -> Result<(), String> {
    let (pg, ly) = doc.add_page(Mm(210.0), Mm(297.0), "Supporting Documents");
    let layer = doc.get_page(pg).get_layer(ly);
    let font_b = doc.add_builtin_font(BuiltinFont::HelveticaBold).map_err(|e| e.to_string())?;
    let font   = doc.add_builtin_font(BuiltinFont::Helvetica).map_err(|e| e.to_string())?;

    let left  = Mm(20.0);
    let right = Mm(190.0);
    let mut y = Mm(275.0);

    layer.use_text("APPENDIX — SUPPORTING DOCUMENTS", 13.0, left, y, &font_b);
    y = y - Mm(4.0);
    layer.add_shape(Line {
        points: vec![(Point::new(left, y), false), (Point::new(right, y), false)],
        is_closed: false, has_fill: false, has_stroke: true, is_clipping_path: false,
    });
    y = y - Mm(7.0);
    layer.use_text(
        &format!("{} document(s) submitted with this filing.", records.len()),
        9.0, left, y, &font,
    );
    y = y - Mm(8.0);

    for (i, rec) in records.iter().enumerate() {
        if y < Mm(30.0) { break; }
        let note = if is_image_attachment(&rec.file_type, &rec.file_name) {
            " [embedded — see following page(s)]"
        } else {
            " [copied to attachments folder]"
        };
        layer.use_text(
            &format!("{}. {}{}", i + 1, rec.file_name, note),
            9.0, left, y, &font_b,
        );
        y = y - Mm(5.5);
        layer.use_text(
            &format!("   Type: {}   |   Entry type: {}", rec.file_type, rec.parent_entry_type),
            7.5, left, y, &font,
        );
        y = y - Mm(7.5);
    }

    if let Some(folder) = non_image_folder {
        y = y - Mm(4.0);
        layer.use_text(
            &format!("Non-image files were saved alongside this PDF in: {}", folder),
            7.5, left, y, &font,
        );
    }

    Ok(())
}

fn embed_image_page(
    doc: &PdfDocumentReference,
    file_path: &str,
    file_name: &str,
) -> Result<(), String> {
    use ::image::GenericImageView;

    let img = ::image::open(file_path)
        .map_err(|e| format!("Cannot open '{}': {}", file_name, e))?;
    let (w_px, h_px) = img.dimensions();
    let rgb = img.to_rgb8();

    let image_xobj = ImageXObject {
        width:              Px(w_px as usize),
        height:             Px(h_px as usize),
        color_space:        ColorSpace::Rgb,
        bits_per_component: ColorBits::Bit8,
        interpolate:        true,
        image_data:         rgb.into_raw(),
        image_filter:       None,
        clipping_bbox:      None,
    };
    let pdf_image = Image::from(image_xobj);

    // Calculate DPI so the image fits inside the 190 × 277 mm usable area
    let dpi = (w_px as f64 * 25.4 / 190.0_f64)
        .max(h_px as f64 * 25.4 / 277.0_f64)
        .max(72.0);
    let rendered_w = w_px as f64 * 25.4 / dpi;
    let rendered_h = h_px as f64 * 25.4 / dpi;
    let x = (210.0 - rendered_w) / 2.0;
    let y = (297.0 - rendered_h) / 2.0;

    let (pg, ly) = doc.add_page(Mm(210.0), Mm(297.0), file_name);
    let layer = doc.get_page(pg).get_layer(ly);

    if let Ok(font) = doc.add_builtin_font(BuiltinFont::Helvetica) {
        layer.use_text(file_name, 7.5, Mm(10.0), Mm(289.0), &font);
    }

    pdf_image.add_to_layer(
        layer,
        ImageTransform {
            translate_x: Some(Mm(x)),
            translate_y: Some(Mm(y)),
            dpi: Some(dpi),
            ..ImageTransform::default()
        },
    );

    Ok(())
}

// ── PDF export ────────────────────────────────────────────────

#[tauri::command]
pub async fn export_filing_pdf(
    filing_id: String,
    save_path: String,
    include_attachments: bool,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let (summary, documents) = {
        let guard = state.db.lock().map_err(|e| e.to_string())?;
        let db = guard.as_ref().ok_or("Database not unlocked")?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let summary = load_summary(&conn, &filing_id)?;
        let docs = if include_attachments {
            load_filing_documents(&conn, &filing_id).unwrap_or_default()
        } else {
            vec![]
        };
        (summary, docs)
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

    // ── Attachments (phase 1 — before printpdf save) ─────────
    let mut pdf_att_paths: Vec<String> = Vec::new();

    if include_attachments && !documents.is_empty() {
        // Sort docs into three buckets
        let mut images: Vec<&DocRecord>  = Vec::new();
        let mut pdfs:   Vec<&DocRecord>  = Vec::new();
        let mut others: Vec<&DocRecord>  = Vec::new();

        for rec in &documents {
            if is_image_attachment(&rec.file_type, &rec.file_name) {
                images.push(rec);
            } else if is_pdf_attachment(&rec.file_type, &rec.file_name) {
                pdfs.push(rec);
                pdf_att_paths.push(rec.file_path.clone());
            } else {
                others.push(rec);
            }
        }

        // Sibling _attachments/ folder — PDFs will also be merged into the PDF
        // itself; copy them to the folder as a backup alongside other files.
        let needs_folder = !pdfs.is_empty() || !others.is_empty();
        let attach_folder: Option<std::path::PathBuf> = if needs_folder {
            let base   = std::path::Path::new(&save_path);
            let stem   = base.file_stem().and_then(|s| s.to_str()).unwrap_or("export");
            let parent = base.parent().unwrap_or(std::path::Path::new("."));
            let dir    = parent.join(format!("{}_attachments", stem));
            let _      = std::fs::create_dir_all(&dir);
            for rec in pdfs.iter().chain(others.iter()) {
                let _ = std::fs::copy(&rec.file_path, dir.join(&rec.file_name));
            }
            Some(dir)
        } else {
            None
        };

        // Appendix listing page (always comes right after the computation pages)
        let _ = add_attachments_appendix(
            &doc,
            &documents,
            attach_folder.as_ref().and_then(|d| d.to_str()),
        );

        // Embed image files directly as PDF pages
        for rec in &images {
            if embed_image_page(&doc, &rec.file_path, &rec.file_name).is_err() {
                // Fallback: copy to _attachments/ folder
                let base   = std::path::Path::new(&save_path);
                let stem   = base.file_stem().and_then(|s| s.to_str()).unwrap_or("export");
                let parent = base.parent().unwrap_or(std::path::Path::new("."));
                let dir    = parent.join(format!("{}_attachments", stem));
                let _      = std::fs::create_dir_all(&dir);
                let _      = std::fs::copy(&rec.file_path, dir.join(&rec.file_name));
            }
        }
    }

    // ── Write main PDF to disk ─────────────────────────────────
    doc.save(&mut BufWriter::new(
        std::fs::File::create(&save_path).map_err(|e| e.to_string())?,
    ))
    .map_err(|e| e.to_string())?;

    // ── Attachments (phase 2 — merge PDF pages with lopdf) ────
    if !pdf_att_paths.is_empty() {
        // Best-effort: don't fail the whole export if merging has issues
        if let Err(e) = append_pdf_attachments(&save_path, &pdf_att_paths) {
            eprintln!("Warning: could not merge PDF attachments: {}", e);
        }
    }

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
         Final Tax Payable NGN,{}\r\n\r\n",
        summary.year_of_assessment,
        summary.filing_reference.as_deref().unwrap_or("—"),
        summary.full_name,
        summary.tin,
        summary.filing_reference.as_deref().unwrap_or("—"),
        format_with_commas(summary.final_tax_payable.unwrap_or(0.0)),
    );

    csv.push_str(
        "income_type,description,gross_amount_ngn,is_foreign,foreign_currency,\
         foreign_amount,income_date,fx_rate_used,fx_rate_source\r\n",
    );

    stmt.query_map(params![filing_id], |row| {
        Ok(format!(
            "{},{},{},{},{},{},{},{},{}\r\n",
            row.get::<_, String>(0)?,
            row.get::<_, Option<String>>(1)?.unwrap_or_default(),
            format_with_commas(row.get::<_, f64>(2)?),
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

// ── Open file with OS default application ────────────────

#[tauri::command]
pub async fn open_file(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/c", "start", "", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
