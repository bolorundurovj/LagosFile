use lagosfile_lib::commands::lirs;

#[test]
fn test_format_payer_id_plain_tin() {
    assert_eq!(lirs::format_payer_id("12345678901"), "N-12345678901");
}

#[test]
fn test_format_payer_id_already_prefixed_n() {
    assert_eq!(lirs::format_payer_id("N-12345678901"), "N-12345678901");
}

#[test]
fn test_format_payer_id_prefixed_c() {
    assert_eq!(lirs::format_payer_id("C-98765432100"), "C-98765432100");
}

#[test]
fn test_format_payer_id_empty_string() {
    assert_eq!(lirs::format_payer_id(""), "N-");
}

#[test]
fn test_format_payer_id_short_tin() {
    assert_eq!(lirs::format_payer_id("123"), "N-123");
}

#[test]
fn test_build_http_response_ok() {
    let response = lirs::build_http_response(
        200,
        "application/json",
        r#"{"status":"ok"}"#,
        Some("https://etax.lirs.net"),
    );
    assert!(response.starts_with("HTTP/1.1 200 OK\r\n"));
    assert!(response.contains("Content-Type: application/json\r\n"));
    assert!(response.contains("Content-Length: 15\r\n"));
    assert!(response.contains("Access-Control-Allow-Origin: https://etax.lirs.net\r\n"));
    assert!(!response.contains("Access-Control-Allow-Origin: *"));
    assert!(response.contains(r#"{"status":"ok"}"#));
}

#[test]
fn test_build_http_response_not_found() {
    let response = lirs::build_http_response(404, "text/plain", "not found", None);
    assert!(response.starts_with("HTTP/1.1 404 Not Found\r\n"));
    assert!(response.contains("Content-Type: text/plain\r\n"));
    assert!(!response.contains("Access-Control-Allow-Origin"));
    assert!(response.contains("not found"));
}

#[test]
fn test_build_http_response_unknown_status() {
    let response = lirs::build_http_response(500, "text/html", "<h1>Error</h1>", None);
    assert!(response.starts_with("HTTP/1.1 500 Error\r\n"));
    assert!(response.contains("Content-Type: text/html\r\n"));
    assert!(response.contains("<h1>Error</h1>"));
}

#[test]
fn test_build_http_response_content_length_matches_body() {
    let body = r#"{"key":"value"}"#;
    let response = lirs::build_http_response(200, "application/json", body, None);
    let expected_len = body.len();
    assert!(response.contains(&format!("Content-Length: {}\r\n", expected_len)));
}

#[test]
fn test_build_http_response_empty_body() {
    let response = lirs::build_http_response(200, "text/plain", "", None);
    assert!(response.contains("Content-Length: 0\r\n"));
}

#[test]
fn test_build_http_response_cors_headers() {
    let response = lirs::build_http_response(
        200,
        "text/plain",
        "ok",
        Some("chrome-extension://abcdefghijklmnop"),
    );
    assert!(response.contains("Access-Control-Allow-Origin: chrome-extension://abcdefghijklmnop"));
    assert!(response.contains("Vary: Origin"));
    assert!(response.contains("Access-Control-Allow-Methods: GET, OPTIONS"));
    assert!(response.contains("Access-Control-Allow-Headers: Content-Type"));
}

#[test]
fn test_build_http_response_connection_close() {
    let response = lirs::build_http_response(200, "text/plain", "ok", None);
    assert!(response.contains("Connection: close\r\n"));
}

#[test]
fn test_format_payer_id_preserves_full_n_prefix() {
    let result = lirs::format_payer_id("N-55566677788");
    assert_eq!(result, "N-55566677788");
    assert!(!result.starts_with("N-N-"));
}

#[test]
fn test_format_payer_id_preserves_full_c_prefix() {
    let result = lirs::format_payer_id("C-11122233344");
    assert_eq!(result, "C-11122233344");
}

#[test]
fn test_bridge_rejects_foreign_origin_and_wrong_host() {
    let filings = r#"[{"taxpayer":{"tin":"1234567890123"}}]"#;
    let primary = r#"{"taxpayer":{"tin":"1234567890123"}}"#;

    // Foreign Origin gets 403 with empty body and no filing data
    let (resp, valid) = lirs::handle_bridge_request(
        "GET /filings HTTP/1.1\r\nHost: 127.0.0.1:19876\r\nOrigin: https://evil.example\r\n\r\n",
        19876,
        filings,
        primary,
    );
    assert!(!valid);
    assert!(resp.starts_with("HTTP/1.1 403 Forbidden\r\n"));
    assert!(!resp.contains("1234567890123"));
    assert!(!resp.contains("Access-Control-Allow-Origin"));

    // Wrong Host (DNS rebinding) gets 403 with empty body and no filing data
    let (resp, valid) = lirs::handle_bridge_request(
        "GET /filings HTTP/1.1\r\nHost: evil.example:19876\r\n\r\n",
        19876,
        filings,
        primary,
    );
    assert!(!valid);
    assert!(resp.starts_with("HTTP/1.1 403 Forbidden\r\n"));
    assert!(!resp.contains("1234567890123"));

    // Allowed portal origin echoes origin and returns data
    let (resp, valid) = lirs::handle_bridge_request(
        "GET /filings HTTP/1.1\r\nHost: 127.0.0.1:19876\r\nOrigin: https://etax.lirs.net\r\n\r\n",
        19876,
        filings,
        primary,
    );
    assert!(valid);
    assert!(resp.starts_with("HTTP/1.1 200 OK\r\n"));
    assert!(resp.contains("Access-Control-Allow-Origin: https://etax.lirs.net\r\n"));
    assert!(resp.contains("1234567890123"));

    // Extension origins allowed by scheme
    assert!(lirs::is_allowed_origin("chrome-extension://abcdef123456"));
    assert!(lirs::is_allowed_origin("moz-extension://1234-5678"));
    assert!(lirs::is_allowed_origin("https://etax.lirs.gov.ng"));
    assert!(!lirs::is_allowed_origin("https://etax.lirs.net.evil.com"));
}

#[test]
fn test_bridge_restart_serves_new_data_and_lock_stops_bridge_and_deletes_file() {
    use lagosfile_lib::{commands::auth::lock_db_in_dir, AppState};
    use std::io::{Read, Write};
    use std::net::TcpStream;

    let state = AppState::default();
    let dir = std::env::temp_dir().join(format!("lagosfile-s4-bridge-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let pending_file = dir.join("pending_filing.json");
    std::fs::write(&pending_file, r#"{"old":true}"#).unwrap();

    // Start first bridge on an ephemeral port
    let port = lirs::start_bridge_on_port(
        &state,
        0,
        r#"[{"version":1}]"#.to_string(),
        r#"{"version":1}"#.to_string(),
    )
    .expect("first bridge start");

    let fetch = |p: u16| -> Result<String, std::io::Error> {
        let mut s = TcpStream::connect(("127.0.0.1", p))?;
        let req = format!(
            "GET /filings HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nOrigin: https://etax.lirs.net\r\n\r\n",
            p
        );
        s.write_all(req.as_bytes())?;
        let mut resp = String::new();
        s.read_to_string(&mut resp)?;
        Ok(resp)
    };

    let resp1 = fetch(port).expect("fetch v1");
    assert!(resp1.contains(r#"[{"version":1}]"#));

    // Starting a second bridge on the same port stops the old one and serves new data
    let port2 = lirs::start_bridge_on_port(
        &state,
        port,
        r#"[{"version":2}]"#.to_string(),
        r#"{"version":2}"#.to_string(),
    )
    .expect("second bridge start on same port");
    assert_eq!(port, port2);

    let resp2 = fetch(port).expect("fetch v2");
    assert!(resp2.contains(r#"[{"version":2}]"#));

    // Locking the vault stops the bridge and deletes pending_filing.json
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(lock_db_in_dir(&dir, &state))
        .expect("lock_db_in_dir");

    assert!(
        !pending_file.exists(),
        "pending_filing.json must be deleted on lock"
    );
    assert!(
        TcpStream::connect(("127.0.0.1", port)).is_err(),
        "bridge port must refuse connections after lock"
    );

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn test_build_all_pending_filings_returns_error_when_all_fail_no_panic() {
    use lagosfile_lib::db::AppDb;
    use lagosfile_lib::services::filing::FilingService;
    use lagosfile_lib::services::profile::ProfileService;
    use serde_json::json;

    let db = AppDb::open_in_memory().unwrap();
    let tp = ProfileService::create(
        &db,
        json!({ "fullName": "Test User", "tin": "1234567890123" }),
    )
    .unwrap();
    let filing = FilingService::create_draft(&db, tp.id, 2024, "v1").unwrap();

    let conn = db.conn.lock().unwrap();
    // Mark filing Confirmed, then deactivate all tax_configs so build_pending_filing fails
    conn.execute(
        "UPDATE filing SET status='Confirmed' WHERE id=?1",
        rusqlite::params![filing.id.to_string()],
    )
    .unwrap();
    conn.execute("UPDATE tax_config SET is_active=0", [])
        .unwrap();

    let res = lirs::build_all_pending_filings(&conn);
    assert!(res.is_err(), "all-failing batch must return Err, not panic");
}

#[test]
fn test_s10_lirs_yoa_is_income_year_plus_one_while_accommodation_dates_stay_on_income_year() {
    use lagosfile_lib::{
        commands::{
            auth::setup_pin_in_dir,
            export::{export_filing_json_with_conn, export_filing_pdf_in_dir},
            filing::{confirm_filing_with_conn, create_draft_filing_with_conn, upsert_income_entry_with_conn},
        },
        services::profile::ProfileService,
        AppState,
    };
    use serde_json::json;

    let dir = std::env::temp_dir().join(format!("lagosfile-s10-{}", uuid::Uuid::new_v4()));
    let state = AppState::default();
    setup_pin_in_dir(&dir, "1234", &state).unwrap();

    let filing_id = {
        let guard = state.db.lock().unwrap();
        let db = guard.as_ref().unwrap();
        ProfileService::create(
            db,
            json!({ "fullName": "Ngozi Obi", "tin": "1234567890" }),
        )
        .unwrap();
        let conn = db.conn.lock().unwrap();
        let draft = create_draft_filing_with_conn(&conn, 2025).unwrap();
        let fid = draft.id.to_string();
        upsert_income_entry_with_conn(
            &conn,
            &json!({ "filingId": fid, "incomeType": "employment", "grossAmountNgn": 4_000_000.0 }),
        )
        .unwrap();
        confirm_filing_with_conn(&conn, &fid).unwrap();

        // Bridge payload for income year 2025 must report LIRS YOA 2026 and accommodation dates in 2025
        let payload = lirs::build_pending_filing(&conn, &fid).unwrap();
        assert_eq!(payload.year_of_assessment, 2026);
        assert_eq!(payload.accommodation.date_started, "2025-01-01");
        assert_eq!(payload.accommodation.date_end, "2025-12-31");

        // JSON export must show both incomeYear (2025) and yearOfAssessment (2026)
        let json_path = dir.join("out.json");
        export_filing_json_with_conn(&conn, &fid, json_path.to_str().unwrap()).unwrap();
        let exported: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&json_path).unwrap()).unwrap();
        assert_eq!(exported["filing"]["incomeYear"].as_i64(), Some(2025));
        assert_eq!(exported["filing"]["yearOfAssessment"].as_i64(), Some(2026));
        fid
    };

    // PDF export must show both Income Year 2025 and LIRS Year of Assessment 2026
    let pdf_path = dir.join("out.pdf");
    export_filing_pdf_in_dir(&dir, &filing_id, pdf_path.to_str().unwrap(), false, None, &state)
        .unwrap();
    let pdf_doc = lopdf::Document::load(&pdf_path).unwrap();
    let text: String = pdf_doc
        .get_pages()
        .keys()
        .filter_map(|p| pdf_doc.extract_text(&[*p]).ok())
        .collect::<Vec<_>>()
        .join("\n");
    assert!(text.contains("Income Year") && text.contains("2025"), "PDF missing income year 2025: {text}");
    assert!(text.contains("LIRS Year of Assessment") && text.contains("2026"), "PDF missing LIRS YOA 2026: {text}");

    let _ = std::fs::remove_dir_all(&dir);
}
