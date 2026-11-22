mod common;

use common::{app_locked, app_with_db, seed_draft, seed_profile, with_conn, NOT_PERSISTED};
use lagosfile_lib::{
    commands::{
        filing::{
            confirm_filing_with_conn, upsert_allowance_with_conn, upsert_income_entry_with_conn,
        },
        lirs::{
            build_http_response, build_pending_filing, handle_bridge_request, open_lirs_portal,
            open_lirs_portal_all,
        },
    },
    AppState,
};
use rusqlite::params;
use serde_json::json;
use tauri::Manager;

const TOKEN: &str = "tok-123";

fn request(method: &str, path: &str, extra: &str) -> String {
    format!("{method} {path} HTTP/1.1\r\nHost: 127.0.0.1:4100\r\n{extra}\r\n")
}

#[tokio::test]
async fn portal_commands_fail_before_starting_bridge_when_nothing_is_ready() {
    let locked = app_locked();
    assert_eq!(
        open_lirs_portal("x".into(), locked.state::<AppState>())
            .await
            .unwrap_err(),
        NOT_PERSISTED
    );
    assert_eq!(
        open_lirs_portal_all(locked.state::<AppState>())
            .await
            .unwrap_err(),
        NOT_PERSISTED
    );

    let app = app_with_db();
    let s = || app.state::<AppState>();
    let missing = open_lirs_portal("nope".into(), s()).await.unwrap_err();
    assert!(missing.starts_with("Filing not found"), "{missing}");

    seed_profile(&app);
    let fid = seed_draft(&app, 2024);
    let draft = open_lirs_portal(fid, s()).await.unwrap_err();
    assert!(draft.contains("is not Confirmed"), "{draft}");

    let none = open_lirs_portal_all(s()).await.unwrap_err();
    assert!(none.contains("No confirmed filings"), "{none}");
    assert!(s().bridge.lock().unwrap().is_none());
}

#[test]
fn bridge_routes_filing_health_and_unknown_paths() {
    let auth = format!("X-LagosFile-Token: {TOKEN}\r\n");
    let (resp, reset) = handle_bridge_request(
        &request("GET", "/filing?x=1", &auth),
        4100,
        TOKEN,
        "[1,2]",
        "{\"p\":1}",
    );
    assert!(resp.starts_with("HTTP/1.1 200 OK"));
    assert!(resp.ends_with("{\"p\":1}"));
    assert!(reset);

    let (resp, reset) =
        handle_bridge_request(&request("GET", "/health", &auth), 4100, TOKEN, "[]", "{}");
    assert!(resp.ends_with(r#"{"status":"ok"}"#));
    assert!(reset);

    let (resp, reset) =
        handle_bridge_request(&request("POST", "/filings", &auth), 4100, TOKEN, "[]", "{}");
    assert!(resp.starts_with("HTTP/1.1 404 Not Found"));
    assert!(!reset);

    let dup_origin =
        format!("{auth}Origin: https://etax.lirs.net\r\nOrigin: https://etax.lirs.net\r\n");
    let (resp, _) = handle_bridge_request(
        &request("GET", "/filing", &dup_origin),
        4100,
        TOKEN,
        "[]",
        "{}",
    );
    assert!(resp.starts_with("HTTP/1.1 403"));

    let dup_token = format!("{auth}{auth}");
    let (resp, _) = handle_bridge_request(
        &request("GET", "/filing", &dup_token),
        4100,
        TOKEN,
        "[]",
        "{}",
    );
    assert!(resp.starts_with("HTTP/1.1 403"));

    let (resp, _) = handle_bridge_request(&request("GET", "/filing", &auth), 4100, "", "[]", "{}");
    assert!(
        resp.starts_with("HTTP/1.1 403"),
        "empty expected token never authenticates"
    );

    let wrong_len = "X-LagosFile-Token: tok-1234\r\n";
    let (resp, _) = handle_bridge_request(
        &request("GET", "/filing", wrong_len),
        4100,
        TOKEN,
        "[]",
        "{}",
    );
    assert!(resp.starts_with("HTTP/1.1 403"));
}

#[test]
fn http_response_labels_unknown_status_as_error() {
    let resp = build_http_response(500, "text/plain", "boom", None);
    assert!(resp.starts_with("HTTP/1.1 500 Error\r\n"));
    assert!(resp.contains("Content-Length: 4\r\n"));
    let bad = build_http_response(400, "text/plain", "", None);
    assert!(bad.starts_with("HTTP/1.1 400 Bad Request"));
}

#[test]
fn pending_filing_includes_allowances_and_recomputes_when_stored_figures_missing() {
    let app = app_with_db();
    seed_profile(&app);
    let fid = seed_draft(&app, 2024);
    let payload = with_conn(&app, |c| {
        upsert_income_entry_with_conn(
            c,
            &json!({ "filingId": fid, "incomeType": "business", "grossAmountNgn": 12_000_000.0 }),
        )
        .unwrap();
        upsert_allowance_with_conn(
            c,
            &json!({ "filingId": fid, "assetDescription": "Generator", "assetType": "plant_machinery",
                     "assetCost": 2_000_000.0, "acquisitionDate": "2024-01-15", "annualAllowanceRate": 0.25 }),
        )
        .unwrap();
        confirm_filing_with_conn(c, &fid).unwrap();
        let stored = build_pending_filing(c, &fid).unwrap();
        c.execute(
            "UPDATE filing SET final_tax_payable=NULL, total_income_ngn=NULL WHERE id=?1",
            params![fid],
        )
        .unwrap();
        let recomputed = build_pending_filing(c, &fid).unwrap();
        (stored, recomputed)
    });
    let (stored, recomputed) = payload;
    let s = serde_json::to_value(&stored).unwrap();
    let r = serde_json::to_value(&recomputed).unwrap();
    for key in [
        "finalTaxPayable",
        "chargeableIncome",
        "graduatedTax",
        "netTaxPayable",
    ] {
        assert_eq!(s["computation"][key], r["computation"][key], "{key}");
    }
    assert_eq!(r["computation"]["totalGrossIncome"], 12_000_000.0);
    assert!(r["computation"]["totalCapitalAllowances"].as_f64().unwrap() > 0.0);
}
