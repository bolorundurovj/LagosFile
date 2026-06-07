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
    let response = lirs::build_http_response(200, "application/json", r#"{"status":"ok"}"#);
    assert!(response.starts_with("HTTP/1.1 200 OK\r\n"));
    assert!(response.contains("Content-Type: application/json\r\n"));
    assert!(response.contains("Content-Length: 15\r\n"));
    assert!(response.contains("Access-Control-Allow-Origin: *"));
    assert!(response.contains(r#"{"status":"ok"}"#));
}

#[test]
fn test_build_http_response_not_found() {
    let response = lirs::build_http_response(404, "text/plain", "not found");
    assert!(response.starts_with("HTTP/1.1 404 Not Found\r\n"));
    assert!(response.contains("Content-Type: text/plain\r\n"));
    assert!(response.contains("not found"));
}

#[test]
fn test_build_http_response_unknown_status() {
    let response = lirs::build_http_response(500, "text/html", "<h1>Error</h1>");
    assert!(response.starts_with("HTTP/1.1 500 Error\r\n"));
    assert!(response.contains("Content-Type: text/html\r\n"));
    assert!(response.contains("<h1>Error</h1>"));
}

#[test]
fn test_build_http_response_content_length_matches_body() {
    let body = r#"{"key":"value"}"#;
    let response = lirs::build_http_response(200, "application/json", body);
    let expected_len = body.len();
    assert!(response.contains(&format!("Content-Length: {}\r\n", expected_len)));
}

#[test]
fn test_build_http_response_empty_body() {
    let response = lirs::build_http_response(200, "text/plain", "");
    assert!(response.contains("Content-Length: 0\r\n"));
}

#[test]
fn test_build_http_response_cors_headers() {
    let response = lirs::build_http_response(200, "text/plain", "ok");
    assert!(response.contains("Access-Control-Allow-Origin: *"));
    assert!(response.contains("Access-Control-Allow-Methods: GET, OPTIONS"));
    assert!(response.contains("Access-Control-Allow-Headers: Content-Type"));
}

#[test]
fn test_build_http_response_connection_close() {
    let response = lirs::build_http_response(200, "text/plain", "ok");
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
