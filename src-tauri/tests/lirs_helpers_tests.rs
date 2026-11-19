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
    assert!(response.contains("Access-Control-Allow-Headers: Content-Type, X-LagosFile-Token"));
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
    let token = "deadbeef0123456789abcdef0123456789abcdef0123456789abcdef01234567";

    // Foreign Origin gets 403 with empty body and no filing data
    let (resp, valid) = lirs::handle_bridge_request(
        &format!(
            "GET /filings HTTP/1.1\r\nHost: 127.0.0.1:19876\r\nOrigin: https://evil.example\r\nX-LagosFile-Token: {}\r\n\r\n",
            token
        ),
        19876,
        token,
        filings,
        primary,
    );
    assert!(!valid);
    assert!(resp.starts_with("HTTP/1.1 403 Forbidden\r\n"));
    assert!(!resp.contains("1234567890123"));
    assert!(!resp.contains("Access-Control-Allow-Origin"));

    // Wrong Host (DNS rebinding) gets 403 with empty body and no filing data
    let (resp, valid) = lirs::handle_bridge_request(
        &format!(
            "GET /filings HTTP/1.1\r\nHost: evil.example:19876\r\nX-LagosFile-Token: {}\r\n\r\n",
            token
        ),
        19876,
        token,
        filings,
        primary,
    );
    assert!(!valid);
    assert!(resp.starts_with("HTTP/1.1 403 Forbidden\r\n"));
    assert!(!resp.contains("1234567890123"));

    // Allowed portal origin with valid token echoes origin and returns data
    let (resp, valid) = lirs::handle_bridge_request(
        &format!(
            "GET /filings HTTP/1.1\r\nHost: 127.0.0.1:19876\r\nOrigin: https://etax.lirs.net\r\nX-LagosFile-Token: {}\r\n\r\n",
            token
        ),
        19876,
        token,
        filings,
        primary,
    );
    assert!(valid);
    assert!(resp.starts_with("HTTP/1.1 200 OK\r\n"));
    assert!(resp.contains("Access-Control-Allow-Origin: https://etax.lirs.net\r\n"));
    assert!(resp.contains("1234567890123"));

    // Missing token gets 403 with empty body and does not reset idle timer
    let (resp, valid) = lirs::handle_bridge_request(
        "GET /filings HTTP/1.1\r\nHost: 127.0.0.1:19876\r\nOrigin: https://etax.lirs.net\r\n\r\n",
        19876,
        token,
        filings,
        primary,
    );
    assert!(!valid);
    assert!(resp.starts_with("HTTP/1.1 403 Forbidden\r\n"));
    assert!(resp.contains("Content-Length: 0\r\n"));
    assert!(!resp.contains("1234567890123"));

    // Wrong token gets 403 with empty body and does not reset idle timer
    let (resp, valid) = lirs::handle_bridge_request(
        "GET /filings HTTP/1.1\r\nHost: 127.0.0.1:19876\r\nOrigin: https://etax.lirs.net\r\nX-LagosFile-Token: wrong-token\r\n\r\n",
        19876,
        token,
        filings,
        primary,
    );
    assert!(!valid);
    assert!(resp.starts_with("HTTP/1.1 403 Forbidden\r\n"));
    assert!(resp.contains("Content-Length: 0\r\n"));
    assert!(!resp.contains("1234567890123"));

    // OPTIONS preflight returns 200 with CORS headers but does NOT reset idle timer
    let (resp, valid) = lirs::handle_bridge_request(
        "OPTIONS /filings HTTP/1.1\r\nHost: 127.0.0.1:19876\r\nOrigin: https://etax.lirs.net\r\n\r\n",
        19876,
        token,
        filings,
        primary,
    );
    assert!(!valid);
    assert!(resp.starts_with("HTTP/1.1 200 OK\r\n"));
    assert!(resp.contains("X-LagosFile-Token"));

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
    let (port, token1) = lirs::start_bridge_on_port(
        &state,
        0,
        r#"[{"version":1}]"#.to_string(),
        r#"{"version":1}"#.to_string(),
    )
    .expect("first bridge start");
    assert_eq!(token1.len(), 64);

    let fetch = |p: u16, tok: Option<&str>| -> Result<String, std::io::Error> {
        let mut s = TcpStream::connect(("127.0.0.1", p))?;
        let token_hdr = match tok {
            Some(t) => format!("X-LagosFile-Token: {}\r\n", t),
            None => String::new(),
        };
        let req = format!(
            "GET /filings HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nOrigin: https://etax.lirs.net\r\n{}\r\n",
            p, token_hdr
        );
        s.write_all(req.as_bytes())?;
        let mut resp = String::new();
        s.read_to_string(&mut resp)?;
        Ok(resp)
    };

    // Without token -> 403 empty body, no data
    let unauth = fetch(port, None).expect("fetch without token");
    assert!(unauth.starts_with("HTTP/1.1 403 Forbidden\r\n"));
    assert!(!unauth.contains("version"));

    // With valid token -> 200 and v1 data
    let resp1 = fetch(port, Some(&token1)).expect("fetch v1");
    assert!(resp1.contains(r#"[{"version":1}]"#));

    // Starting a second bridge on the same port stops the old one, rotates the token, and serves new data
    let (port2, token2) = lirs::start_bridge_on_port(
        &state,
        port,
        r#"[{"version":2}]"#.to_string(),
        r#"{"version":2}"#.to_string(),
    )
    .expect("second bridge start on same port");
    assert_eq!(port, port2);
    assert_ne!(token1, token2, "each bridge start must generate a fresh token");

    // Old token is rejected
    let stale_tok = fetch(port, Some(&token1)).expect("fetch with old token");
    assert!(stale_tok.starts_with("HTTP/1.1 403 Forbidden\r\n"));
    assert!(!stale_tok.contains("version"));

    // New token succeeds
    let resp2 = fetch(port, Some(&token2)).expect("fetch v2");
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

#[test]
fn test_s23_landlord_tenant_foreign_currencies_bik_paye_ftc_and_batch_partial_failure() {
    use lagosfile_lib::{
        commands::filing::{
            confirm_filing_with_conn, create_draft_filing_with_conn, upsert_income_entry_with_conn,
            upsert_relief_entry_with_conn,
        },
        db::AppDb,
        services::profile::ProfileService,
    };
    use serde_json::json;

    let db = AppDb::open_in_memory().unwrap();
    ProfileService::create(
        &db,
        json!({ "fullName": "Chidi Okeke", "tin": "1234567890123" }),
    )
    .unwrap();
    let conn = db.conn.lock().unwrap();

    // 1. Landlord (2023): rental income ₦3m, NO rent relief -> owner, rent_paid = 0
    let landlord_draft = create_draft_filing_with_conn(&conn, 2023).unwrap();
    let landlord_id = landlord_draft.id.to_string();
    upsert_income_entry_with_conn(
        &conn,
        &json!({
            "filingId": landlord_id,
            "incomeType": "rental",
            "description": "Lekki flat rent income",
            "grossAmountNgn": 3_000_000.0
        }),
    )
    .unwrap();
    confirm_filing_with_conn(&conn, &landlord_id).unwrap();

    let landlord_payload = lirs::build_pending_filing(&conn, &landlord_id).unwrap();
    assert!((landlord_payload.income.rental - 3_000_000.0).abs() < 0.01);
    assert_eq!(landlord_payload.accommodation.acc_type, "owner");
    assert_eq!(landlord_payload.accommodation.ownership, "owner");
    assert_eq!(landlord_payload.accommodation.rent_paid, 0.0);

    // 2. Tenant (2024) with rent relief, capped pension, other_approved, BIK, PAYE, FTC, and 2 foreign currencies
    // Add a pension cap on the active config so we verify capped approved values in payload
    let active_cfg_id: String = conn
        .query_row("SELECT id FROM tax_config WHERE is_active = 1 LIMIT 1", [], |r| r.get(0))
        .unwrap();
    conn.execute(
        "UPDATE tax_config SET relief_caps_json = ?1 WHERE id = ?2",
        rusqlite::params![
            r#"{"rentReliefCap":500000,"rentReliefRate":0.20,"pensionCap":300000}"#,
            active_cfg_id
        ],
    )
    .unwrap();

    let tenant_draft = create_draft_filing_with_conn(&conn, 2024).unwrap();
    let tenant_id = tenant_draft.id.to_string();
    // Pin this filing to the config with pensionCap=300k
    conn.execute(
        "UPDATE filing SET tax_config_id = ?1 WHERE id = ?2",
        rusqlite::params![active_cfg_id, tenant_id],
    )
    .unwrap();

    // Employment ₦10m
    upsert_income_entry_with_conn(
        &conn,
        &json!({
            "filingId": tenant_id,
            "incomeType": "employment",
            "grossAmountNgn": 10_000_000.0
        }),
    )
    .unwrap();
    // BIK: employer-provided accommodation annual rental value ₦2.5m (capped at 20% of 10m = ₦2m)
    upsert_income_entry_with_conn(
        &conn,
        &json!({
            "filingId": tenant_id,
            "incomeType": "benefits_in_kind",
            "bikCategory": "accommodation",
            "bikCost": 2_500_000.0,
            "grossAmountNgn": 2_000_000.0
        }),
    )
    .unwrap();
    // Two GBP foreign entries + one EUR foreign entry (with foreign tax paid)
    upsert_income_entry_with_conn(
        &conn,
        &json!({
            "filingId": tenant_id,
            "incomeType": "business",
            "grossAmountNgn": 2_000_000.0,
            "isForeign": true,
            "foreignCurrency": "GBP",
            "foreignAmount": 1_000.0,
            "fxRateUsed": 2_000.0,
            "fxRateSource": "fawazahmed0",
            "foreignTaxPaidNgn": 100_000.0
        }),
    )
    .unwrap();
    upsert_income_entry_with_conn(
        &conn,
        &json!({
            "filingId": tenant_id,
            "incomeType": "business",
            "grossAmountNgn": 4_200_000.0,
            "isForeign": true,
            "foreignCurrency": "GBP",
            "foreignAmount": 2_000.0,
            "fxRateUsed": 2_100.0,
            "fxRateSource": "cbn_override"
        }),
    )
    .unwrap();
    upsert_income_entry_with_conn(
        &conn,
        &json!({
            "filingId": tenant_id,
            "incomeType": "royalty",
            "grossAmountNgn": 1_800_000.0,
            "isForeign": true,
            "foreignCurrency": "EUR",
            "foreignAmount": 1_000.0,
            "fxRateUsed": 1_800.0,
            "fxRateSource": "fawazahmed0"
        }),
    )
    .unwrap();

    // Reliefs: Rent ₦4m (relief capped at ₦500k), Pension claimed ₦600k / approved ₦500k (capped at ₦300k),
    // Other Approved ₦250k, PAYE ₦180k
    upsert_relief_entry_with_conn(
        &conn,
        &json!({
            "filingId": tenant_id,
            "reliefType": "rent",
            "claimedAmount": 4_000_000.0,
            "approvedAmount": 4_000_000.0
        }),
    )
    .unwrap();
    upsert_relief_entry_with_conn(
        &conn,
        &json!({
            "filingId": tenant_id,
            "reliefType": "pension",
            "claimedAmount": 600_000.0,
            "approvedAmount": 500_000.0
        }),
    )
    .unwrap();
    upsert_relief_entry_with_conn(
        &conn,
        &json!({
            "filingId": tenant_id,
            "reliefType": "other_approved",
            "claimedAmount": 250_000.0,
            "approvedAmount": 250_000.0
        }),
    )
    .unwrap();
    upsert_relief_entry_with_conn(
        &conn,
        &json!({
            "filingId": tenant_id,
            "reliefType": "paye",
            "claimedAmount": 180_000.0,
            "approvedAmount": 180_000.0
        }),
    )
    .unwrap();
    confirm_filing_with_conn(&conn, &tenant_id).unwrap();

    let tenant_payload = lirs::build_pending_filing(&conn, &tenant_id).unwrap();
    // Accommodation derived from rent relief + employer BIK accommodation
    assert_eq!(tenant_payload.accommodation.acc_type, "rent");
    assert_eq!(tenant_payload.accommodation.ownership, "tenant");
    assert!((tenant_payload.accommodation.rent_paid - 4_000_000.0).abs() < 0.01);
    assert!((tenant_payload.accommodation.rent_paid_by_employer - 2_500_000.0).abs() < 0.01);

    // Deductions use approved & capped values
    assert!((tenant_payload.deductions.rent_relief_applied - 500_000.0).abs() < 0.01);
    assert!((tenant_payload.deductions.pension - 300_000.0).abs() < 0.01);
    assert!((tenant_payload.deductions.other_approved - 250_000.0).abs() < 0.01);

    // BIK, PAYE, FTC populated
    assert!((tenant_payload.income.benefits_in_kind - 2_000_000.0).abs() < 0.01);
    assert!((tenant_payload.computation.paye_credits - 180_000.0).abs() < 0.01);
    assert!((tenant_payload.computation.foreign_tax_credits - 100_000.0).abs() < 0.01);

    // Foreign currencies summed per currency with real currency codes
    assert_eq!(tenant_payload.income.foreign_incomes.len(), 2);
    let eur = tenant_payload
        .income
        .foreign_incomes
        .iter()
        .find(|f| f.currency == "EUR")
        .expect("EUR summary present");
    assert!((eur.total_amount - 1_000.0).abs() < 0.01);
    assert!((eur.naira_equivalent - 1_800_000.0).abs() < 0.01);

    let gbp = tenant_payload
        .income
        .foreign_incomes
        .iter()
        .find(|f| f.currency == "GBP")
        .expect("GBP summary present");
    assert!((gbp.total_amount - 3_000.0).abs() < 0.01);
    assert!((gbp.naira_equivalent - 6_200_000.0).abs() < 0.01);
    assert!((gbp.fx_rate_used - (6_200_000.0 / 3_000.0)).abs() < 0.01);
    // Primary foreign_income uses real currency code GBP (largest NGN equivalent), not hardcoded USD
    assert_eq!(tenant_payload.income.foreign_income.currency, "GBP");
    assert!((tenant_payload.income.foreign_income.naira_equivalent - 6_200_000.0).abs() < 0.01);

    // 3. Batch with one valid filing and one failing filing reports the failure instead of dropping it
    // Break landlord filing's taxpayer_id so build_pending_filing fails for landlord while tenant succeeds
    conn.execute("PRAGMA foreign_keys = OFF", []).unwrap();
    conn.execute(
        "UPDATE filing SET taxpayer_id = '00000000-0000-0000-0000-000000000099' WHERE id = ?1",
        rusqlite::params![landlord_id],
    )
    .unwrap();
    conn.execute("PRAGMA foreign_keys = ON", []).unwrap();
    let batch = lirs::build_all_pending_filings_detailed(&conn).unwrap();
    assert_eq!(batch.filings.len(), 1);
    assert_eq!(batch.filings[0].filing_id, tenant_id);
    assert_eq!(batch.failures.len(), 1);
    assert_eq!(batch.failures[0].filing_id, landlord_id);
    assert_eq!(batch.failures[0].year_of_assessment, 2023);
    assert!(
        batch.failures[0].error.contains("Taxpayer not found"),
        "expected failure reason, got: {}",
        batch.failures[0].error
    );
}
