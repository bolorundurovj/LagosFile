use crate::{
    db::{self, doc_store},
    AppState,
};
use ::lopdf;
use printpdf::*;
use rusqlite::params;
use std::io::BufWriter;
use std::path::Path;
use tauri::State;

struct FilingSummary {
    filing_reference: Option<String>,
    status: String,
    year_of_assessment: i32,
    total_income_ngn: Option<f64>,
    chargeable_income: Option<f64>,
    tax_payable: Option<f64>,
    wht_credit: Option<f64>,
    paye_credit: Option<f64>,
    foreign_tax_credit: Option<f64>,
    net_tax_payable: Option<f64>,
    minimum_tax: Option<f64>,
    final_tax_payable: Option<f64>,
    tax_config_version: String,
    full_name: String,
    tin: String,
    confirmed_at: Option<String>,
    submitted_at: Option<String>,
}

fn load_summary(conn: &rusqlite::Connection, filing_id: &str) -> Result<FilingSummary, String> {
    conn.query_row(
        "SELECT f.filing_reference, f.year_of_assessment,
                f.total_income_ngn, f.chargeable_income, f.tax_payable,
                f.wht_credit, f.net_tax_payable, f.minimum_tax, f.final_tax_payable,
                f.tax_config_version, f.confirmed_at,
                t.full_name, t.tin, f.submitted_at,
                f.paye_credit, f.foreign_tax_credit, f.status
         FROM filing f JOIN taxpayer t ON t.id = f.taxpayer_id
         WHERE f.id = ?1",
        params![filing_id],
        |row| {
            Ok(FilingSummary {
                filing_reference: row.get(0)?,
                status: row.get(16)?,
                year_of_assessment: row.get(1)?,
                total_income_ngn: row.get(2)?,
                chargeable_income: row.get(3)?,
                tax_payable: row.get(4)?,
                wht_credit: row.get(5)?,
                paye_credit: row.get(14)?,
                foreign_tax_credit: row.get(15)?,
                net_tax_payable: row.get(6)?,
                minimum_tax: row.get(7)?,
                final_tax_payable: row.get(8)?,
                tax_config_version: row.get(9)?,
                confirmed_at: row.get(10)?,
                full_name: row.get(11)?,
                tin: row.get(12)?,
                submitted_at: row.get(13)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

pub fn format_with_commas(n: f64) -> String {
    if !n.is_finite() {
        return "0.00".to_string();
    }
    let total_kobo = (n * 100.0).round() as i128;
    let negative = total_kobo < 0;
    let abs_kobo = total_kobo.unsigned_abs();
    let integer = abs_kobo / 100;
    let cents = abs_kobo % 100;

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
    if negative {
        format!("-{}", formatted)
    } else {
        formatted
    }
}

fn date_prefix(ts: Option<&str>) -> String {
    match ts {
        Some(s) if !s.is_empty() => s.chars().take(10).collect(),
        _ => "—".to_string(),
    }
}

fn csv_escape(field: &str) -> String {
    if field.contains(',') || field.contains('"') || field.contains('\n') || field.contains('\r') {
        format!("\"{}\"", field.replace('"', "\"\""))
    } else {
        field.to_string()
    }
}

fn csv_row(fields: &[&str]) -> String {
    let mut out = fields
        .iter()
        .map(|f| csv_escape(f))
        .collect::<Vec<_>>()
        .join(",");
    out.push_str("\r\n");
    out
}

fn unique_companion_name(
    used: &mut std::collections::HashSet<String>,
    file_name: &str,
) -> String {
    let base = Path::new(file_name)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("attachment");
    if used.insert(base.to_lowercase()) {
        return base.to_string();
    }
    let stem = Path::new(base)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("attachment");
    let ext = Path::new(base).extension().and_then(|s| s.to_str());
    let mut n = 2usize;
    loop {
        let candidate = match ext {
            Some(e) if !e.is_empty() => format!("{stem}_{n}.{e}"),
            _ => format!("{stem}_{n}"),
        };
        if used.insert(candidate.to_lowercase()) {
            return candidate;
        }
        n += 1;
    }
}

fn naira(v: Option<f64>) -> String {
    match v {
        Some(n) => format!("NGN {}", format_with_commas(n)),
        None => "—".to_string(),
    }
}

fn ensure_parent(path: &str) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    Ok(())
}

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
                file_path: row.get(0)?,
                file_name: row.get(1)?,
                file_type: row.get(2)?,
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
    t.contains("image")
        || t.contains("jpeg")
        || t.contains("jpg")
        || t.contains("png")
        || n.ends_with(".jpg")
        || n.ends_with(".jpeg")
        || n.ends_with(".png")
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
            let root_id = main
                .trailer
                .get(b"Root")
                .and_then(|o| o.as_reference())
                .map_err(|e| e.to_string())?;
            let catalog_obj = main
                .objects
                .get(&root_id)
                .ok_or("Catalog object not found")?;
            if let lopdf::Object::Dictionary(ref catalog) = catalog_obj {
                catalog
                    .get(b"Pages")
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
    let font_b = doc
        .add_builtin_font(BuiltinFont::HelveticaBold)
        .map_err(|e| e.to_string())?;
    let font = doc
        .add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|e| e.to_string())?;

    let left = Mm(20.0);
    let right = Mm(190.0);

    let start_appendix_page = |title: &str, page_label: &str| -> (PdfLayerReference, Mm) {
        let (pg, ly) = doc.add_page(Mm(210.0), Mm(297.0), page_label);
        let layer = doc.get_page(pg).get_layer(ly);
        let mut y = Mm(275.0);
        layer.use_text(title, 13.0, left, y, &font_b);
        y -= Mm(4.0);
        layer.add_shape(Line {
            points: vec![(Point::new(left, y), false), (Point::new(right, y), false)],
            is_closed: false,
            has_fill: false,
            has_stroke: true,
            is_clipping_path: false,
        });
        y -= Mm(7.0);
        (layer, y)
    };

    let mut page_num = 1usize;
    let (mut layer, mut y) = start_appendix_page(
        "APPENDIX — SUPPORTING DOCUMENTS",
        "Supporting Documents",
    );
    layer.use_text(
        format!("{} document(s) submitted with this filing.", records.len()),
        9.0,
        left,
        y,
        &font,
    );
    y -= Mm(8.0);

    for (i, rec) in records.iter().enumerate() {
        if y < Mm(30.0) {
            page_num += 1;
            let (next_layer, next_y) = start_appendix_page(
                "APPENDIX — SUPPORTING DOCUMENTS (CONT.)",
                &format!("Supporting Documents (Page {page_num})"),
            );
            layer = next_layer;
            y = next_y;
        }
        let note = if is_image_attachment(&rec.file_type, &rec.file_name) {
            " [embedded — see following page(s)]"
        } else {
            " [copied to attachments folder]"
        };
        layer.use_text(
            format!("{}. {}{}", i + 1, rec.file_name, note),
            9.0,
            left,
            y,
            &font_b,
        );
        y -= Mm(5.5);
        layer.use_text(
            format!(
                "   Type: {}   |   Entry type: {}",
                rec.file_type, rec.parent_entry_type
            ),
            7.5,
            left,
            y,
            &font,
        );
        y -= Mm(7.5);
    }

    if let Some(folder) = non_image_folder {
        if y < Mm(25.0) {
            page_num += 1;
            let (next_layer, next_y) = start_appendix_page(
                "APPENDIX — SUPPORTING DOCUMENTS (CONT.)",
                &format!("Supporting Documents (Page {page_num})"),
            );
            layer = next_layer;
            y = next_y;
        }
        y -= Mm(4.0);
        layer.use_text(
            format!(
                "Non-image files were saved alongside this PDF in: {}",
                folder
            ),
            7.5,
            left,
            y,
            &font,
        );
    }

    Ok(())
}

fn embed_image_page(
    doc: &PdfDocumentReference,
    image_bytes: &[u8],
    file_name: &str,
) -> Result<(), String> {
    use ::image::GenericImageView;

    let img = ::image::load_from_memory(image_bytes)
        .map_err(|e| format!("Cannot decode '{}': {}", file_name, e))?;
    let (w_px, h_px) = img.dimensions();
    let rgb = img.to_rgb8();

    let image_xobj = ImageXObject {
        width: Px(w_px as usize),
        height: Px(h_px as usize),
        color_space: ColorSpace::Rgb,
        bits_per_component: ColorBits::Bit8,
        interpolate: true,
        image_data: rgb.into_raw(),
        image_filter: None,
        clipping_bbox: None,
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

pub fn export_filing_pdf_in_dir(
    app_dir: &Path,
    filing_id: &str,
    save_path: &str,
    include_attachments: bool,
    letterhead_style: Option<&str>,
    state: &AppState,
) -> Result<String, String> {
    let (summary, documents, doc_key) = {
        let guard = state.db.lock().map_err(|e| e.to_string())?;
        let db = guard.as_ref().ok_or("Database not unlocked")?;
        let doc_key = doc_store::get_doc_key(db)?.unwrap_or([0u8; 32]);
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let summary = load_summary(&conn, filing_id)?;
        let docs = if include_attachments {
            load_filing_documents(&conn, filing_id).unwrap_or_default()
        } else {
            vec![]
        };
        (summary, docs, doc_key)
    };

    ensure_parent(save_path)?;

    let is_alt_fills = letterhead_style == Some("alt-fills");

    let (doc, page1, layer1) = PdfDocument::new(
        "LagosFile Tax Computation Statement",
        Mm(210.0),
        Mm(297.0),
        "Cover",
    );
    let cover = doc.get_page(page1).get_layer(layer1);

    let font_bold = doc
        .add_builtin_font(BuiltinFont::HelveticaBold)
        .map_err(|e| e.to_string())?;
    let font = doc
        .add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|e| e.to_string())?;

    let left = Mm(20.0);
    let right = Mm(190.0);

    // Parse the actual SVG logo files and embed them natively in the PDF.
    static SVG_SINGLE: &str = include_str!("../../../src/assets/logo/mark-single-span.svg");
    static SVG_ALT: &str = include_str!("../../../src/assets/logo/mark-alt-fills.svg");
    let logo_src = if is_alt_fills { SVG_ALT } else { SVG_SINGLE };

    // Logo render width in mm.
    // The wordmark SVG (280px wide) places the mark at 0–80px and text at x=92px,
    // so text starts at 92/80 = 1.15× the mark width from the mark's left edge.
    // We use the same ratio here so the horizontal lockup matches the brand sheet.
    const LOGO_W_MM: f64 = 20.0;

    // Embed logo on a layer at position (lx, ly); width_mm controls rendered size.
    // SvgTransform scale: SVG units are in px (96 dpi); we scale to target mm.
    // scale = target_mm / (svg_width_px * 25.4 / 96)
    let embed_logo = |layer: &PdfLayerReference, lx: Mm, ly: Mm, width_mm: f64| {
        if let Ok(svg) = Svg::parse(logo_src) {
            let svg_w_mm = svg.width.0 as f64 * 25.4 / 96.0;
            let scale = width_mm / svg_w_mm;
            svg.add_to_layer(
                layer,
                SvgTransform {
                    translate_x: Some(lx.into()),
                    translate_y: Some(ly.into()),
                    scale_x: Some(scale),
                    scale_y: Some(scale),
                    ..Default::default()
                },
            );
        }
    };
    // Text X = mark left + 1.15× mark width (matches wordmark.svg spacing)
    let logo_text_x = |lx: Mm| lx + Mm(LOGO_W_MM * 1.15);

    // Watermark: very faint diagonal "LagosFile" text centred on page
    let draw_watermark = |layer: &PdfLayerReference, font_ref: &IndirectFontRef| {
        layer.save_graphics_state();
        layer.set_fill_color(Color::Greyscale(Greyscale::new(0.93, None)));
        layer.set_text_rendering_mode(TextRenderingMode::Fill);
        let angle: f64 = std::f64::consts::PI / 4.0;
        let (s, c) = (angle.sin(), angle.cos());
        // Centre 30pt text near page centre
        let tx = Mm(105.0 - 18.0 * c + 6.0 * s);
        let ty = Mm(148.5 - 18.0 * s - 6.0 * c);
        layer.begin_text_section();
        layer.set_font(font_ref, 30.0);
        layer.set_text_matrix(TextMatrix::TranslateRotate(tx.into(), ty.into(), angle));
        layer.write_text("LagosFile", font_ref);
        layer.end_text_section();
        layer.restore_graphics_state();
    };

    // Footer: thin rule + "lagosfile" brand + page info at very bottom
    let draw_footer = |layer: &PdfLayerReference, font_ref: &IndirectFontRef, page_label: &str| {
        let fy = Mm(10.0);
        layer.add_shape(Line {
            points: vec![
                (Point::new(left, fy + Mm(4.0)), false),
                (Point::new(right, fy + Mm(4.0)), false),
            ],
            is_closed: false,
            has_fill: false,
            has_stroke: true,
            is_clipping_path: false,
        });
        layer.save_graphics_state();
        layer.set_fill_color(Color::Greyscale(Greyscale::new(0.55, None)));
        layer.use_text("lagosfile", 7.5, left, fy, font_ref);
        layer.use_text(page_label, 7.5, Mm(155.0), fy, font_ref);
        layer.restore_graphics_state();
    };

    {
        let logo_x = Mm(20.0);
        let logo_y = Mm(261.0);

        embed_logo(&cover, logo_x, logo_y, LOGO_W_MM);

        // Wordmark to the right; logo height at 20mm wide = 8.4mm.
        // "LagosFile" 18pt cap-height ~4.5mm → baseline at mid-logo + half cap-height
        let cover_text_x = logo_text_x(logo_x);
        cover.use_text(
            "LagosFile",
            18.0,
            cover_text_x,
            logo_y + Mm(6.0),
            &font_bold,
        );
        cover.use_text(
            "DIRECT ASSESSMENT  \u{00B7}  NTA 2025",
            7.0,
            cover_text_x,
            logo_y + Mm(2.0),
            &font,
        );

        // Right-side metadata block aligned with logo top
        let ref_str = summary
            .filing_reference
            .clone()
            .unwrap_or_else(|| format!("YOA{}", summary.year_of_assessment));
        let issued_str = date_prefix(summary.confirmed_at.as_deref()).to_uppercase();

        cover.use_text(
            format!("REF  \u{00B7}  {}", ref_str),
            7.0,
            Mm(140.0),
            logo_y + Mm(7.5),
            &font,
        );
        cover.use_text(
            format!("ISSUED  \u{00B7}  {}", issued_str),
            7.0,
            Mm(140.0),
            logo_y + Mm(4.5),
            &font,
        );
        cover.use_text(
            format!("LIRS  \u{00B7}  {}", summary.status.to_uppercase()),
            7.0,
            Mm(140.0),
            logo_y + Mm(1.5),
            &font,
        );

        // Divider line below header — 1 mm under logo baseline
        let div_y = logo_y - Mm(1.0);
        cover.add_shape(Line {
            points: vec![
                (Point::new(left, div_y), false),
                (Point::new(right, div_y), false),
            ],
            is_closed: false,
            has_fill: false,
            has_stroke: true,
            is_clipping_path: false,
        });

        // Cover label
        cover.use_text(
            "COVER  \u{00B7}  COMPUTATION SUMMARY",
            7.0,
            left,
            div_y - Mm(8.0),
            &font,
        );

        // Main title
        let income_year = summary.year_of_assessment;
        let lirs_yoa = income_year + 1;
        cover.use_text(
            format!("{} Personal Income Tax", lirs_yoa),
            26.0,
            left,
            div_y - Mm(22.0),
            &font_bold,
        );
        cover.use_text(
            format!(
                "Income Year {} \u{00B7} LIRS Year of Assessment {}",
                income_year, lirs_yoa
            ),
            11.0,
            left,
            div_y - Mm(32.0),
            &font,
        );

        // Bottom section: taxpayer info (left) and tax payable (right)
        let bottom_y = Mm(35.0);
        cover.use_text("PREPARED FOR", 7.0, left, bottom_y + Mm(10.0), &font);
        cover.use_text(
            &summary.full_name,
            12.0,
            left,
            bottom_y + Mm(5.5),
            &font_bold,
        );
        cover.use_text(
            format!("TIN {}", summary.tin),
            8.0,
            left,
            bottom_y + Mm(1.5),
            &font,
        );

        cover.use_text("TAX PAYABLE", 7.0, Mm(130.0), bottom_y + Mm(10.0), &font);
        cover.use_text(
            format!(
                "\u{20A6} {}",
                format_with_commas(summary.final_tax_payable.unwrap_or(0.0))
            ),
            18.0,
            Mm(130.0),
            bottom_y + Mm(3.0),
            &font_bold,
        );

        draw_watermark(&cover, &font);
        draw_footer(
            &cover,
            &font,
            "Cover Page  \u{00B7}  LagosFile Tax Computation",
        );
    }

    let (page2, layer2) = doc.add_page(Mm(210.0), Mm(297.0), "Layer 1");
    let layer = doc.get_page(page2).get_layer(layer2);

    let mut y = Mm(277.0);
    let line_h = Mm(7.0);
    let gap = Mm(5.0);

    embed_logo(&layer, left, y, LOGO_W_MM);
    layer.use_text(
        "LagosFile",
        16.0,
        logo_text_x(left),
        y + Mm(6.0),
        &font_bold,
    );
    layer.use_text(
        "DIRECT ASSESSMENT  \u{00B7}  NTA 2025",
        7.0,
        logo_text_x(left),
        y + Mm(2.0),
        &font,
    );
    layer.use_text("NIGERIA TAX ACT 2025", 7.0, Mm(148.0), y + Mm(7.5), &font);

    y -= Mm(2.5);
    layer.add_shape(Line {
        points: vec![(Point::new(left, y), false), (Point::new(right, y), false)],
        is_closed: false,
        has_fill: false,
        has_stroke: true,
        is_clipping_path: false,
    });
    y -= Mm(7.0);

    layer.use_text("LAGOS STATE DIRECT ASSESSMENT", 9.0, left, y, &font);
    y -= Mm(7.0);
    layer.use_text("TAX COMPUTATION STATEMENT", 18.0, left, y, &font_bold);
    y -= Mm(4.0);

    layer.add_shape(Line {
        points: vec![(Point::new(left, y), false), (Point::new(right, y), false)],
        is_closed: false,
        has_fill: false,
        has_stroke: true,
        is_clipping_path: false,
    });
    y -= gap;

    let details: &[(&str, String)] = &[
        ("Taxpayer", summary.full_name.clone()),
        ("TIN", summary.tin.clone()),
        ("Income Year", summary.year_of_assessment.to_string()),
        (
            "LIRS Year of Assessment",
            (summary.year_of_assessment + 1).to_string(),
        ),
        (
            "Filing Reference",
            summary
                .filing_reference
                .clone()
                .unwrap_or_else(|| "—".to_string()),
        ),
        (
            "Confirmed At",
            date_prefix(summary.confirmed_at.as_deref()),
        ),
        ("Tax Config", summary.tax_config_version.clone()),
    ];
    for (label, value) in details {
        layer.use_text(*label, 8.0, left, y, &font_bold);
        layer.use_text(value.as_str(), 10.0, Mm(70.0), y, &font);
        y -= line_h;
    }

    y -= Mm(2.0);
    layer.add_shape(Line {
        points: vec![(Point::new(left, y), false), (Point::new(right, y), false)],
        is_closed: false,
        has_fill: false,
        has_stroke: true,
        is_clipping_path: false,
    });
    y -= gap;

    layer.use_text("COMPUTATION SUMMARY", 11.0, left, y, &font_bold);
    y -= line_h;

    let mut rows: Vec<(&str, String)> = vec![
        ("Total Gross Income", naira(summary.total_income_ngn)),
        ("Chargeable Income", naira(summary.chargeable_income)),
        ("Gross Tax (Graduated Bands)", naira(summary.tax_payable)),
    ];
    if summary.minimum_tax.unwrap_or(0.0) > 0.0 {
        rows.push(("Minimum Tax Floor", naira(summary.minimum_tax)));
    }
    rows.push(("Less: WHT Credits", naira(summary.wht_credit.map(|v| -v))));
    if summary.paye_credit.unwrap_or(0.0) > 0.0 {
        rows.push(("Less: PAYE Credits", naira(summary.paye_credit.map(|v| -v))));
    }
    if summary.foreign_tax_credit.unwrap_or(0.0) > 0.0 {
        rows.push((
            "Less: Foreign Tax Credits",
            naira(summary.foreign_tax_credit.map(|v| -v)),
        ));
    }
    rows.push(("Net Tax Payable", naira(summary.net_tax_payable)));
    for (label, value) in &rows {
        layer.use_text(*label, 9.0, left, y, &font);
        layer.use_text(value.as_str(), 9.0, Mm(118.0), y, &font);
        y -= line_h;
    }

    y -= Mm(2.0);
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
    y -= Mm(4.0);
    layer.use_text("FINAL TAX PAYABLE", 11.0, left, y, &font_bold);
    layer.use_text(
        naira(summary.final_tax_payable),
        11.0,
        Mm(118.0),
        y,
        &font_bold,
    );
    y -= Mm(14.0);

    layer.add_shape(Line {
        points: vec![(Point::new(left, y), false), (Point::new(right, y), false)],
        is_closed: false,
        has_fill: false,
        has_stroke: true,
        is_clipping_path: false,
    });
    y -= gap;
    layer.use_text(
        format!(
            "Generated by LagosFile v{}. Governed by NTA 2025 \u{2014} LIRS.",
            env!("CARGO_PKG_VERSION")
        ),
        8.0,
        left,
        y,
        &font,
    );
    y -= Mm(5.0);
    layer.use_text(
        format!(
            "Exported: {}",
            chrono::Utc::now().format("%Y-%m-%d %H:%M UTC")
        ),
        8.0,
        left,
        y,
        &font,
    );

    draw_watermark(&layer, &font);
    draw_footer(&layer, &font, "Page 1  \u{00B7}  Tax Computation Statement");

    let mut pdf_att_paths: Vec<String> = Vec::new();
    let _temp_pdf_dir: Option<doc_store::TempDirGuard>;

    if include_attachments && !documents.is_empty() {
        let mut images: Vec<&DocRecord> = Vec::new();
        let mut pdfs: Vec<&DocRecord> = Vec::new();
        let mut others: Vec<&DocRecord> = Vec::new();

        for rec in &documents {
            if is_image_attachment(&rec.file_type, &rec.file_name) {
                images.push(rec);
            } else if is_pdf_attachment(&rec.file_type, &rec.file_name) {
                pdfs.push(rec);
            } else {
                others.push(rec);
            }
        }

        // Decrypt PDF attachments into a scoped temp dir deleted when export returns.
        _temp_pdf_dir = if !pdfs.is_empty() {
            let guard = doc_store::TempDirGuard::new("lagosfile-pdf-merge")?;
            for (idx, rec) in pdfs.iter().enumerate() {
                if let Ok(plain) = doc_store::read_decrypted_doc(app_dir, &rec.file_path, &doc_key) {
                    let tmp_file = guard.path().join(format!("{}_{}", idx, rec.file_name));
                    if std::fs::write(&tmp_file, plain).is_ok() {
                        pdf_att_paths.push(tmp_file.to_string_lossy().to_string());
                    }
                }
            }
            Some(guard)
        } else {
            None
        };

        let mut used_companion_names = std::collections::HashSet::<String>::new();
        let needs_folder = !pdfs.is_empty() || !others.is_empty();
        let attach_folder: Option<std::path::PathBuf> = if needs_folder {
            let base = Path::new(save_path);
            let stem = base
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("export");
            let parent = base.parent().unwrap_or(Path::new("."));
            let dir = parent.join(format!("{}_attachments", stem));
            let _ = std::fs::create_dir_all(&dir);
            for rec in pdfs.iter().chain(others.iter()) {
                if let Ok(plain) = doc_store::read_decrypted_doc(app_dir, &rec.file_path, &doc_key) {
                    let unique = unique_companion_name(&mut used_companion_names, &rec.file_name);
                    let _ = std::fs::write(dir.join(unique), plain);
                }
            }
            Some(dir)
        } else {
            None
        };

        let _ = add_attachments_appendix(
            &doc,
            &documents,
            attach_folder.as_ref().and_then(|d| d.to_str()),
        );

        for rec in &images {
            let decrypted = doc_store::read_decrypted_doc(app_dir, &rec.file_path, &doc_key);
            let embedded = match &decrypted {
                Ok(plain) => embed_image_page(&doc, plain, &rec.file_name).is_ok(),
                Err(_) => false,
            };
            if !embedded {
                if let Ok(plain) = decrypted {
                    let base = Path::new(save_path);
                    let stem = base
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or("export");
                    let parent = base.parent().unwrap_or(Path::new("."));
                    let dir = parent.join(format!("{}_attachments", stem));
                    let _ = std::fs::create_dir_all(&dir);
                    let unique = unique_companion_name(&mut used_companion_names, &rec.file_name);
                    let _ = std::fs::write(dir.join(unique), plain);
                }
            }
        }
    } else {
        _temp_pdf_dir = None;
    }

    doc.save(&mut BufWriter::new(
        std::fs::File::create(save_path).map_err(|e| e.to_string())?,
    ))
    .map_err(|e| e.to_string())?;

    if !pdf_att_paths.is_empty() {
        if let Err(e) = append_pdf_attachments(save_path, &pdf_att_paths) {
            eprintln!("Warning: could not merge PDF attachments: {}", e);
        }
    }

    Ok(save_path.to_string())
}

#[tauri::command]
pub async fn export_filing_pdf(
    filing_id: String,
    save_path: String,
    include_attachments: bool,
    letterhead_style: Option<String>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    export_filing_pdf_in_dir(
        &db::app_dir(),
        &filing_id,
        &save_path,
        include_attachments,
        letterhead_style.as_deref(),
        &state,
    )
}

pub fn export_filing_csv_with_conn(
    conn: &rusqlite::Connection,
    filing_id: &str,
    save_path: &str,
) -> Result<String, String> {
    let summary = load_summary(conn, filing_id)?;

    let mut csv = String::new();
    csv.push_str(&csv_row(&[
        "section",
        "category",
        "description",
        "amount_ngn",
        "approved_or_allowance_ngn",
        "is_foreign",
        "foreign_currency",
        "foreign_amount",
        "date",
        "fx_rate_used",
        "fx_rate_source",
        "extra",
    ]));

    let fmt_opt_num = |v: Option<f64>| v.map_or(String::new(), |n| format!("{:.2}", n));

    // Summary rows (plain numeric values, RFC 4180 escaped)
    let summary_rows: Vec<(&str, String, String)> = vec![
        ("taxpayer", summary.full_name.clone(), String::new()),
        ("tin", summary.tin.clone(), String::new()),
        (
            "filing_reference",
            summary.filing_reference.clone().unwrap_or_default(),
            String::new(),
        ),
        ("status", summary.status.clone(), String::new()),
        (
            "income_year",
            summary.year_of_assessment.to_string(),
            String::new(),
        ),
        (
            "lirs_year_of_assessment",
            (summary.year_of_assessment + 1).to_string(),
            String::new(),
        ),
        (
            "total_gross_income",
            String::new(),
            fmt_opt_num(summary.total_income_ngn),
        ),
        (
            "chargeable_income",
            String::new(),
            fmt_opt_num(summary.chargeable_income),
        ),
        (
            "tax_payable",
            String::new(),
            fmt_opt_num(summary.tax_payable),
        ),
        ("wht_credit", String::new(), fmt_opt_num(summary.wht_credit)),
        (
            "paye_credit",
            String::new(),
            fmt_opt_num(summary.paye_credit),
        ),
        (
            "foreign_tax_credit",
            String::new(),
            fmt_opt_num(summary.foreign_tax_credit),
        ),
        (
            "net_tax_payable",
            String::new(),
            fmt_opt_num(summary.net_tax_payable),
        ),
        (
            "minimum_tax",
            String::new(),
            fmt_opt_num(summary.minimum_tax),
        ),
        (
            "final_tax_payable",
            String::new(),
            fmt_opt_num(summary.final_tax_payable),
        ),
    ];
    for (cat, desc, amt) in &summary_rows {
        csv.push_str(&csv_row(&[
            "summary", cat, desc, amt, "", "", "", "", "", "", "", "",
        ]));
    }

    // Income entries
    let mut ie_stmt = conn
        .prepare(
            "SELECT income_type,description,gross_amount_ngn,is_foreign,foreign_currency,
                    foreign_amount,income_date,fx_rate_used,fx_rate_source,bik_category,bik_cost
             FROM income_entry WHERE filing_id=?1",
        )
        .map_err(|e| e.to_string())?;
    ie_stmt
        .query_map(params![filing_id], |row| {
            let income_type: String = row.get(0)?;
            let description: String = row.get::<_, Option<String>>(1)?.unwrap_or_default();
            let gross = format!("{:.2}", row.get::<_, f64>(2)?);
            let is_foreign = if row.get::<_, i32>(3)? == 1 { "true" } else { "false" };
            let foreign_currency: String = row.get::<_, Option<String>>(4)?.unwrap_or_default();
            let foreign_amount = row
                .get::<_, Option<f64>>(5)?
                .map_or(String::new(), |v| format!("{:.2}", v));
            let income_date: String = row.get::<_, Option<String>>(6)?.unwrap_or_default();
            let fx_rate = row
                .get::<_, Option<f64>>(7)?
                .map_or(String::new(), |v| v.to_string());
            let fx_source: String = row.get::<_, Option<String>>(8)?.unwrap_or_default();
            let bik_cat: Option<String> = row.get(9)?;
            let bik_cost: Option<f64> = row.get(10)?;
            let extra = match (bik_cat, bik_cost) {
                (Some(cat), Some(cost)) => format!("bik_category={cat};bik_cost={cost:.2}"),
                (Some(cat), None) => format!("bik_category={cat}"),
                _ => String::new(),
            };
            Ok(csv_row(&[
                "income",
                &income_type,
                &description,
                &gross,
                "",
                is_foreign,
                &foreign_currency,
                &foreign_amount,
                &income_date,
                &fx_rate,
                &fx_source,
                &extra,
            ]))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .for_each(|line| csv.push_str(&line));

    // Capital allowances
    let mut ca_stmt = conn
        .prepare(
            "SELECT asset_type,asset_description,asset_cost,acquisition_date,
                    tax_written_down_value,annual_allowance_rate,annual_allowance_amount
             FROM capital_allowance WHERE filing_id=?1",
        )
        .map_err(|e| e.to_string())?;
    ca_stmt
        .query_map(params![filing_id], |row| {
            let asset_type: String = row.get(0)?;
            let asset_desc: String = row.get(1)?;
            let cost = format!("{:.2}", row.get::<_, f64>(2)?);
            let acq_date: String = row.get(3)?;
            let wdv: f64 = row.get(4)?;
            let rate: f64 = row.get(5)?;
            let allowance = format!("{:.2}", row.get::<_, f64>(6)?);
            let extra = format!("wdv={wdv:.2};rate={rate:.4}");
            Ok(csv_row(&[
                "capital_allowance",
                &asset_type,
                &asset_desc,
                &cost,
                &allowance,
                "",
                "",
                "",
                &acq_date,
                "",
                "",
                &extra,
            ]))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .for_each(|line| csv.push_str(&line));

    // Relief entries
    let mut re_stmt = conn
        .prepare(
            "SELECT relief_type,description,claimed_amount,approved_amount,wht_ref,wht_income_type,wht_date
             FROM relief_entry WHERE filing_id=?1",
        )
        .map_err(|e| e.to_string())?;
    re_stmt
        .query_map(params![filing_id], |row| {
            let relief_type: String = row.get(0)?;
            let desc: String = row.get::<_, Option<String>>(1)?.unwrap_or_default();
            let claimed = format!("{:.2}", row.get::<_, f64>(2)?);
            let approved = format!("{:.2}", row.get::<_, f64>(3)?);
            let wht_ref: Option<String> = row.get(4)?;
            let wht_inc: Option<String> = row.get(5)?;
            let wht_date: String = row.get::<_, Option<String>>(6)?.unwrap_or_default();
            let extra = match (wht_ref, wht_inc) {
                (Some(r), Some(t)) if !r.is_empty() => format!("wht_ref={r};wht_income_type={t}"),
                (Some(r), _) if !r.is_empty() => format!("wht_ref={r}"),
                _ => String::new(),
            };
            Ok(csv_row(&[
                "relief",
                &relief_type,
                &desc,
                &claimed,
                &approved,
                "",
                "",
                "",
                &wht_date,
                "",
                "",
                &extra,
            ]))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .for_each(|line| csv.push_str(&line));

    ensure_parent(save_path)?;
    std::fs::write(save_path, csv.as_bytes()).map_err(|e| e.to_string())?;
    Ok(save_path.to_string())
}

#[tauri::command]
pub async fn export_filing_csv(
    filing_id: String,
    save_path: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let guard = state.db.lock().map_err(|e| e.to_string())?;
    let db = guard.as_ref().ok_or("Database not unlocked")?;
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    export_filing_csv_with_conn(&conn, &filing_id, &save_path)
}

pub fn export_filing_json_with_conn(
    conn: &rusqlite::Connection,
    filing_id: &str,
    save_path: &str,
) -> Result<String, String> {
    let summary = load_summary(conn, filing_id)?;

    let mut income_stmt = conn
        .prepare(
            "SELECT income_type,description,gross_amount_ngn,is_foreign,
                    foreign_currency,foreign_amount,income_date,
                    fx_rate_used,fx_rate_source,foreign_tax_paid_ngn,
                    bik_category,bik_cost
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
                "bikCategory":       row.get::<_,Option<String>>(10)?,
                "bikCost":           row.get::<_,Option<f64>>(11)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut ca_stmt = conn
        .prepare(
            "SELECT asset_description,asset_type,asset_cost,acquisition_date,
                    tax_written_down_value,annual_allowance_rate,annual_allowance_amount
             FROM capital_allowance WHERE filing_id=?1",
        )
        .map_err(|e| e.to_string())?;

    let capital_allowances: Vec<serde_json::Value> = ca_stmt
        .query_map(params![filing_id], |row| {
            Ok(serde_json::json!({
                "assetDescription":    row.get::<_,String>(0)?,
                "assetType":           row.get::<_,String>(1)?,
                "assetCost":           row.get::<_,f64>(2)?,
                "acquisitionDate":     row.get::<_,String>(3)?,
                "taxWrittenDownValue": row.get::<_,f64>(4)?,
                "annualAllowanceRate": row.get::<_,f64>(5)?,
                "annualAllowanceAmount": row.get::<_,f64>(6)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut relief_stmt = conn
        .prepare(
            "SELECT relief_type,description,claimed_amount,approved_amount,wht_ref,wht_income_type,wht_date
             FROM relief_entry WHERE filing_id=?1",
        )
        .map_err(|e| e.to_string())?;

    let relief_entries: Vec<serde_json::Value> = relief_stmt
        .query_map(params![filing_id], |row| {
            Ok(serde_json::json!({
                "reliefType":     row.get::<_,String>(0)?,
                "description":    row.get::<_,Option<String>>(1)?,
                "claimedAmount":  row.get::<_,f64>(2)?,
                "approvedAmount": row.get::<_,f64>(3)?,
                "whtRef":         row.get::<_,Option<String>>(4)?,
                "whtIncomeType":  row.get::<_,Option<String>>(5)?,
                "whtDate":        row.get::<_,Option<String>>(6)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let output = serde_json::json!({
        "export": {
            "generator":   concat!("LagosFile v", env!("CARGO_PKG_VERSION")),
            "generatedAt": chrono::Utc::now().to_rfc3339(),
            "legislation": "Nigeria Tax Act (NTA) 2025",
        },
        "taxpayer": {
            "fullName": summary.full_name,
            "tin":      summary.tin,
        },
        "filing": {
            "incomeYear":       summary.year_of_assessment,
            "yearOfAssessment": summary.year_of_assessment + 1,
            "status":           summary.status,
            "filingReference":  summary.filing_reference,
            "confirmedAt":      summary.confirmed_at,
            "submittedAt":      summary.submitted_at,
            "taxConfigVersion": summary.tax_config_version,
            "totalIncomeNgn":   summary.total_income_ngn,
            "chargeableIncome": summary.chargeable_income,
            "taxPayable":       summary.tax_payable,
            "whtCredit":        summary.wht_credit,
            "payeCredit":       summary.paye_credit,
            "foreignTaxCredit": summary.foreign_tax_credit,
            "netTaxPayable":    summary.net_tax_payable,
            "minimumTax":       summary.minimum_tax,
            "finalTaxPayable":  summary.final_tax_payable,
        },
        "incomeEntries":      income_entries,
        "capitalAllowances":  capital_allowances,
        "reliefEntries":      relief_entries,
    });

    let json = serde_json::to_string_pretty(&output).map_err(|e| e.to_string())?;
    ensure_parent(save_path)?;
    std::fs::write(save_path, json.as_bytes()).map_err(|e| e.to_string())?;
    Ok(save_path.to_string())
}

#[tauri::command]
pub async fn export_filing_json(
    filing_id: String,
    save_path: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let guard = state.db.lock().map_err(|e| e.to_string())?;
    let db = guard.as_ref().ok_or("Database not unlocked")?;
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    export_filing_json_with_conn(&conn, &filing_id, &save_path)
}

#[tauri::command]
pub async fn open_file(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let target = doc_store::prepare_file_for_external_app(&db::app_dir(), &path, &state)?;
    open::that(&target).map_err(|e| e.to_string())?;
    Ok(())
}

/// Sends a file to the system's default printer handler.
#[tauri::command]
pub async fn print_file(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let target = doc_store::prepare_file_for_external_app(&db::app_dir(), &path, &state)?;
    if !target.is_file() {
        return Err(format!("File not found: {path}"));
    }
    let target_str = target.to_string_lossy().to_string();
    #[cfg(target_os = "windows")]
    {
        let script = format!(
            "Start-Process -FilePath '{}' -Verb Print",
            target_str.replace('\'', "''")
        );
        std::process::Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &script])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        std::process::Command::new("lpr")
            .arg(&target_str)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_pdf(path: &std::path::Path, pages: usize) {
        let (doc, _, _) = PdfDocument::new("test", Mm(210.0), Mm(297.0), "Layer 1");
        for _ in 1..pages {
            doc.add_page(Mm(210.0), Mm(297.0), "Layer 1");
        }
        doc.save(&mut BufWriter::new(std::fs::File::create(path).unwrap()))
            .unwrap();
    }

    #[test]
    fn appends_attachment_pages_to_generated_pdf() {
        let dir = std::env::temp_dir().join(format!("lagosfile-merge-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let main = dir.join("main.pdf");
        let att = dir.join("att.pdf");
        write_pdf(&main, 1);
        write_pdf(&att, 2);

        append_pdf_attachments(
            main.to_str().unwrap(),
            &[
                att.to_string_lossy().to_string(),
                dir.join("missing.pdf").to_string_lossy().to_string(),
            ],
        )
        .unwrap();

        let merged = lopdf::Document::load(&main).unwrap();
        assert_eq!(merged.get_pages().len(), 3);
        std::fs::remove_dir_all(&dir).ok();
    }

    /// Minimal RFC 4180 CSV parser for test verification.
    fn parse_rfc4180(input: &str) -> Vec<Vec<String>> {
        let mut rows = Vec::new();
        let mut row = Vec::new();
        let mut field = String::new();
        let mut chars = input.chars().peekable();
        let mut in_quotes = false;

        while let Some(c) = chars.next() {
            if in_quotes {
                if c == '"' {
                    if chars.peek() == Some(&'"') {
                        chars.next();
                        field.push('"');
                    } else {
                        in_quotes = false;
                    }
                } else {
                    field.push(c);
                }
            } else {
                match c {
                    '"' => in_quotes = true,
                    ',' => {
                        row.push(std::mem::take(&mut field));
                    }
                    '\r' => {
                        if chars.peek() == Some(&'\n') {
                            chars.next();
                        }
                        row.push(std::mem::take(&mut field));
                        rows.push(std::mem::take(&mut row));
                    }
                    '\n' => {
                        row.push(std::mem::take(&mut field));
                        rows.push(std::mem::take(&mut row));
                    }
                    other => field.push(other),
                }
            }
        }
        if !field.is_empty() || !row.is_empty() {
            row.push(field);
            rows.push(row);
        }
        rows
    }

    #[test]
    fn test_format_with_commas_rounds_kobo_before_splitting() {
        assert_eq!(format_with_commas(1234.996), "1,235.00");
        assert_eq!(format_with_commas(-1234.996), "-1,235.00");
        assert_eq!(format_with_commas(-0.001), "0.00");
        assert_eq!(format_with_commas(1_500_000.0), "1,500,000.00");
        assert_eq!(format_with_commas(999.995), "1,000.00");
    }

    #[test]
    fn test_csv_and_json_include_allowances_reliefs_and_rfc4180_quoting() {
        use crate::commands::filing::{
            confirm_filing_with_conn, create_draft_filing_with_conn, upsert_allowance_with_conn,
            upsert_income_entry_with_conn, upsert_relief_entry_with_conn,
        };
        use crate::db::AppDb;
        use serde_json::json;

        let db = AppDb::open_in_memory().unwrap();
        let conn = db.conn.lock().unwrap();
        let tp_id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO taxpayer (id, full_name, tin, created_at) VALUES (?1, 'Ade, Okafor', '1234567890123', '2025-01-01T00:00:00Z')",
            params![tp_id],
        )
        .unwrap();
        let f = create_draft_filing_with_conn(&conn, 2024).unwrap();
        let fid = f.id.to_string();

        upsert_income_entry_with_conn(
            &conn,
            &json!({
                "id": uuid::Uuid::new_v4().to_string(),
                "filingId": fid,
                "incomeType": "business",
                "description": "Consulting, \"Phase 1\"",
                "grossAmountNgn": 1_500_000.0,
                "isForeign": false,
                "isCgtExempt": false
            }),
        )
        .unwrap();
        upsert_allowance_with_conn(
            &conn,
            &json!({
                "id": uuid::Uuid::new_v4().to_string(),
                "filingId": fid,
                "assetDescription": "MacBook Pro, 16-inch",
                "assetType": "computer_laptop",
                "assetCost": 1_000_000.0,
                "acquisitionDate": "2024-02-01",
                "taxWrittenDownValue": 1_000_000.0,
                "annualAllowanceRate": 0.25,
                "annualAllowanceAmount": 250_000.0
            }),
        )
        .unwrap();
        upsert_relief_entry_with_conn(
            &conn,
            &json!({
                "id": uuid::Uuid::new_v4().to_string(),
                "filingId": fid,
                "reliefType": "pension",
                "claimedAmount": 120_000.0,
                "approvedAmount": 120_000.0
            }),
        )
        .unwrap();
        confirm_filing_with_conn(&conn, &fid).unwrap();

        let dir = std::env::temp_dir().join(format!("lagosfile-s21-csv-{}", uuid::Uuid::new_v4()));
        let csv_path = dir.join("export.csv");
        let json_path = dir.join("export.json");

        export_filing_csv_with_conn(&conn, &fid, csv_path.to_str().unwrap()).unwrap();
        export_filing_json_with_conn(&conn, &fid, json_path.to_str().unwrap()).unwrap();

        let csv_text = std::fs::read_to_string(&csv_path).unwrap();
        let rows = parse_rfc4180(&csv_text);
        assert!(rows.len() >= 19, "expected header + summary + income + allowance + relief rows");
        let header_cols = rows[0].len();
        assert_eq!(header_cols, 12);
        for (idx, r) in rows.iter().enumerate() {
            assert_eq!(r.len(), header_cols, "row {idx} column count mismatch: {r:?}");
        }

        let inc = rows.iter().find(|r| r[0] == "income").expect("income row");
        assert_eq!(inc[1], "business");
        assert_eq!(inc[2], "Consulting, \"Phase 1\"");
        assert_eq!(inc[3], "1500000.00");

        let ca = rows
            .iter()
            .find(|r| r[0] == "capital_allowance")
            .expect("capital_allowance row");
        assert_eq!(ca[2], "MacBook Pro, 16-inch");
        assert_eq!(ca[4], "250000.00");

        let rel = rows.iter().find(|r| r[0] == "relief").expect("relief row");
        assert_eq!(rel[1], "pension");
        assert_eq!(rel[3], "120000.00");

        let json_val: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&json_path).unwrap()).unwrap();
        assert_eq!(json_val["filing"]["status"], "Confirmed");
        assert_eq!(json_val["capitalAllowances"].as_array().unwrap().len(), 1);
        assert_eq!(json_val["reliefEntries"].as_array().unwrap().len(), 1);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_pdf_30_attachments_paginate_cover_status_and_unique_companion_names() {
        use crate::commands::{
            auth::setup_pin_in_dir,
            document::attach_document_in_dir,
            filing::{
                confirm_filing_with_conn, create_draft_filing_with_conn,
                upsert_income_entry_with_conn,
            },
        };
        use serde_json::json;

        let dir = std::env::temp_dir().join(format!("lagosfile-s21-pdf-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let state = AppState::default();
        setup_pin_in_dir(&dir, "123456", &state).unwrap();

        let (fid, entry_id) = {
            let guard = state.db.lock().unwrap();
            let db = guard.as_ref().unwrap();
            let conn = db.conn.lock().unwrap();
            let tp_id = uuid::Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO taxpayer (id, full_name, tin, created_at) VALUES (?1, 'Bimpe', '1234567890124', '2025-01-01T00:00:00Z')",
                params![tp_id],
            )
            .unwrap();
            let f = create_draft_filing_with_conn(&conn, 2024).unwrap();
            let fid = f.id.to_string();
            let eid = upsert_income_entry_with_conn(
                &conn,
                &json!({
                    "id": uuid::Uuid::new_v4().to_string(),
                    "filingId": fid,
                    "incomeType": "employment",
                    "grossAmountNgn": 5_000_000.0,
                    "isForeign": false,
                    "isCgtExempt": false
                }),
            )
            .unwrap();
            (fid, eid)
        };

        // Attach 30 non-image documents, including colliding filenames ("receipt.txt" repeated)
        for i in 1..=30 {
            let file_name = if i <= 2 {
                "receipt.txt".to_string()
            } else {
                format!("doc_{:02}.txt", i)
            };
            let src = dir.join(format!("src_{i}.txt"));
            let content = format!("document payload #{i}");
            std::fs::write(&src, &content).unwrap();
            attach_document_in_dir(
                &dir,
                &entry_id,
                "income_entry",
                src.to_str().unwrap(),
                &file_name,
                "txt",
                content.len() as i64,
                &state,
            )
            .unwrap();
        }

        // Confirm filing and also test short confirmed_at doesn't panic
        {
            let guard = state.db.lock().unwrap();
            let db = guard.as_ref().unwrap();
            let conn = db.conn.lock().unwrap();
            confirm_filing_with_conn(&conn, &fid).unwrap();
            conn.execute(
                "UPDATE filing SET confirmed_at = '2025' WHERE id = ?1",
                params![fid],
            )
            .unwrap();
        }

        let pdf_path = dir.join("return.pdf");
        export_filing_pdf_in_dir(&dir, &fid, pdf_path.to_str().unwrap(), true, None, &state)
            .unwrap();

        let pdf_doc = lopdf::Document::load(&pdf_path).unwrap();
        // Cover + statement + at least 2 appendix pages for 30 items
        assert!(
            pdf_doc.get_pages().len() >= 4,
            "expected multi-page appendix for 30 docs, got {} pages",
            pdf_doc.get_pages().len()
        );
        let all_text: String = pdf_doc
            .get_pages()
            .keys()
            .filter_map(|p| pdf_doc.extract_text(&[*p]).ok())
            .collect::<Vec<_>>()
            .join("\n");
        assert!(all_text.contains("CONFIRMED"), "cover must show CONFIRMED status");
        assert!(!all_text.contains("LIRS  ·  DRAFT"), "confirmed cover must not show DRAFT");
        assert!(all_text.contains("1. receipt.txt"), "appendix missing doc #1");
        assert!(all_text.contains("30. doc_30.txt"), "appendix missing doc #30");

        // Companion attachments folder must contain all 30 files without overwriting duplicates
        let att_dir = dir.join("return_attachments");
        let copied_count = std::fs::read_dir(&att_dir).unwrap().count();
        assert_eq!(copied_count, 30, "duplicate filenames must not overwrite each other");

        let _ = std::fs::remove_dir_all(&dir);
    }
}
