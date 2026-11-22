mod common;

use common::{app_locked, app_with_db, seed_draft, seed_profile, temp_dir, with_conn};
use lagosfile_lib::{
    commands::{
        auth::setup_pin_in_dir,
        document::attach_document_in_dir,
        export::{
            export_filing_csv, export_filing_json, export_filing_pdf, export_filing_pdf_in_dir,
        },
        filing::{
            create_draft_filing_with_conn, upsert_income_entry_with_conn,
            upsert_relief_entry_with_conn,
        },
    },
    services::profile::ProfileService,
    AppState,
};
use serde_json::json;
use tauri::Manager;

fn seed_rich_entries(conn: &rusqlite::Connection, fid: &str) {
    upsert_income_entry_with_conn(
        conn,
        &json!({
            "filingId": fid,
            "incomeType": "employment",
            "description": "Salary, \"senior\" role",
            "grossAmountNgn": 9_000_000.0,
            "bikCategory": "vehicle",
            "bikCost": 2_000_000.0,
        }),
    )
    .unwrap();
    upsert_income_entry_with_conn(
        conn,
        &json!({
            "filingId": fid,
            "incomeType": "foreign_employment",
            "grossAmountNgn": 1_500_000.0,
            "isForeign": true,
            "foreignCurrency": "USD",
            "foreignAmount": 1000.0,
            "fxRateUsed": 1500.0,
            "fxRateSource": "cache",
            "foreignTaxPaidNgn": 150_000.0,
            "incomeDate": "2024-04-01",
        }),
    )
    .unwrap();
    upsert_income_entry_with_conn(
        conn,
        &json!({
            "filingId": fid,
            "incomeType": "capital_gain_shares",
            "grossAmountNgn": 500_000.0,
            "cgtProceeds": 2_000_000.0,
            "cgtGain": 500_000.0,
        }),
    )
    .unwrap();
    upsert_relief_entry_with_conn(
        conn,
        &json!({ "filingId": fid, "reliefType": "wht_credit", "claimedAmount": 10_000.0, "whtRef": "WHT-9" }),
    )
    .unwrap();
    upsert_relief_entry_with_conn(
        conn,
        &json!({ "filingId": fid, "reliefType": "wht_credit", "claimedAmount": 5_000.0,
                 "whtRef": "WHT-10", "whtIncomeType": "dividend", "whtDate": "2024-07-01" }),
    )
    .unwrap();
}

#[tokio::test]
async fn csv_and_json_export_commands_write_all_entry_details() {
    let app = app_with_db();
    let s = || app.state::<AppState>();
    seed_profile(&app);
    let fid = seed_draft(&app, 2024);
    with_conn(&app, |c| seed_rich_entries(c, &fid));
    let dir = temp_dir("export-cmd");

    let csv_path = dir.join("nested").join("out.csv");
    let written = export_filing_csv(fid.clone(), csv_path.to_string_lossy().into(), s())
        .await
        .unwrap();
    assert_eq!(written, csv_path.to_string_lossy());
    let csv = std::fs::read_to_string(&csv_path).unwrap();
    assert!(
        csv.contains("bik_category=vehicle;bik_cost=2000000.00"),
        "{csv}"
    );
    assert!(csv.contains("foreign_tax_paid_ngn=150000.00"), "{csv}");
    assert!(
        csv.contains("cgt_proceeds=2000000.00;cgt_gain=500000.00"),
        "{csv}"
    );
    assert!(csv.contains("wht_ref=WHT-9"), "{csv}");
    assert!(
        csv.contains("wht_ref=WHT-10;wht_income_type=dividend"),
        "{csv}"
    );
    assert!(csv.contains("\"Salary, \"\"senior\"\" role\""), "{csv}");

    let json_path = dir.join("out.json");
    export_filing_json(fid.clone(), json_path.to_string_lossy().into(), s())
        .await
        .unwrap();
    let v: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&json_path).unwrap()).unwrap();
    assert_eq!(v["taxpayer"]["fullName"], "Ada Lovelace");
    assert_eq!(v["filing"]["incomeYear"], 2024);
    assert_eq!(v["filing"]["yearOfAssessment"], 2025);
    assert_eq!(v["incomeEntries"].as_array().unwrap().len(), 3);
    assert_eq!(v["reliefEntries"].as_array().unwrap().len(), 2);
    let foreign = v["incomeEntries"]
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["isForeign"] == true)
        .unwrap();
    assert_eq!(foreign["foreignCurrency"], "USD");
    assert_eq!(foreign["fxRateUsed"], 1500.0);

    let missing = export_filing_csv("nope".into(), csv_path.to_string_lossy().into(), s())
        .await
        .unwrap_err();
    assert!(!missing.is_empty());
    assert!(
        export_filing_json("nope".into(), json_path.to_string_lossy().into(), s())
            .await
            .is_err()
    );

    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn pdf_export_command_without_attachments_writes_valid_pdf() {
    let app = app_with_db();
    let s = || app.state::<AppState>();
    seed_profile(&app);
    let fid = seed_draft(&app, 2024);
    with_conn(&app, |c| seed_rich_entries(c, &fid));
    let dir = temp_dir("export-pdf-cmd");
    let out = dir.join("filing.pdf");

    let path = export_filing_pdf(
        fid.clone(),
        out.to_string_lossy().into(),
        false,
        Some("minimal".into()),
        s(),
    )
    .await
    .unwrap();
    assert_eq!(path, out.to_string_lossy());
    let doc = lopdf::Document::load(&out).unwrap();
    assert!(doc.get_pages().len() >= 2);

    let missing = export_filing_pdf(
        "nope".into(),
        out.to_string_lossy().into(),
        false,
        None,
        s(),
    )
    .await
    .unwrap_err();
    assert!(!missing.is_empty());

    let locked = app_locked();
    let err = export_filing_csv(
        fid,
        out.to_string_lossy().into(),
        locked.state::<AppState>(),
    )
    .await
    .unwrap_err();
    assert_eq!(err, common::NOT_PERSISTED);

    let _ = std::fs::remove_dir_all(&dir);
}

fn jpeg_with_exif_rotation() -> Vec<u8> {
    let img = image::RgbImage::from_pixel(8, 4, image::Rgb([200, 30, 30]));
    let mut plain = Vec::new();
    image::codecs::jpeg::JpegEncoder::new(&mut plain)
        .encode_image(&img)
        .unwrap();
    let tiff: [u8; 26] = [
        0x4D, 0x4D, 0x00, 0x2A, 0x00, 0x00, 0x00, 0x08, 0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00,
        0x00, 0x00, 0x01, 0x00, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ];
    let mut app1 = vec![0xFF, 0xE1];
    app1.extend_from_slice(&((2 + 6 + tiff.len()) as u16).to_be_bytes());
    app1.extend_from_slice(b"Exif\0\0");
    app1.extend_from_slice(&tiff);
    let mut out = plain[..2].to_vec();
    out.extend_from_slice(&app1);
    out.extend_from_slice(&plain[2..]);
    out
}

#[test]
fn pdf_export_embeds_rotated_jpeg_and_saves_undecodable_images_beside_pdf() {
    let dir = temp_dir("export-att");
    let state = AppState::default();
    setup_pin_in_dir(&dir, "1234", &state).unwrap();
    let (fid, entry_id) = {
        let guard = state.db.lock().unwrap();
        let db = guard.as_ref().unwrap();
        ProfileService::create(db, json!({ "fullName": "Tunde Bello", "tin": "99887766" }))
            .unwrap();
        let conn = db.conn.lock().unwrap();
        let fid = create_draft_filing_with_conn(&conn, 2024)
            .unwrap()
            .id
            .to_string();
        let entry_id = upsert_income_entry_with_conn(
            &conn,
            &json!({ "filingId": fid, "incomeType": "employment", "grossAmountNgn": 7_000_000.0 }),
        )
        .unwrap();
        (fid, entry_id)
    };

    let jpg = dir.join("rotated.jpg");
    std::fs::write(&jpg, jpeg_with_exif_rotation()).unwrap();
    let bad_png = dir.join("broken.png");
    std::fs::write(&bad_png, b"\x89PNG\r\n\x1a\nnot really a png").unwrap();
    let note = dir.join("note.txt");
    std::fs::write(&note, b"plain note").unwrap();
    for (path, name, ty) in [
        (&jpg, "rotated.jpg", "jpg"),
        (&bad_png, "broken.png", "png"),
        (&note, "note.txt", "txt"),
    ] {
        attach_document_in_dir(
            &dir,
            &entry_id,
            "income_entry",
            path.to_str().unwrap(),
            name,
            ty,
            0,
            &state,
        )
        .unwrap();
    }

    let out = dir.join("report.pdf");
    export_filing_pdf_in_dir(&dir, &fid, out.to_str().unwrap(), true, None, &state).unwrap();

    let pdf = lopdf::Document::load(&out).unwrap();
    // Cover + computation + appendix + one embedded JPEG page
    assert_eq!(pdf.get_pages().len(), 4);
    let companions = dir.join("report_attachments");
    assert_eq!(
        std::fs::read(companions.join("broken.png")).unwrap(),
        b"\x89PNG\r\n\x1a\nnot really a png"
    );
    assert_eq!(
        std::fs::read(companions.join("note.txt")).unwrap(),
        b"plain note"
    );
    assert!(!companions.join("rotated.jpg").exists());

    let _ = std::fs::remove_dir_all(&dir);
}
