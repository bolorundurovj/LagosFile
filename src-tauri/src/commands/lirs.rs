use crate::{models::*, services::computation::ComputationEngine, AppState};
use chrono::Utc;
use rusqlite::params;
use std::{
    io::{Read, Write},
    net::TcpListener,
    time::{Duration, Instant},
};
use tauri::State;
use uuid::Uuid;

const LIRS_BRIDGE_PORT: u16 = 19876;
const LIRS_BRIDGE_TIMEOUT_SECS: u64 = 600; // 10 minutes

fn load_active_config(conn: &rusqlite::Connection) -> rusqlite::Result<TaxConfig> {
    conn.query_row(
        "SELECT id,version_label,governed_by,bands_json,relief_caps_json,
                cgt_thresholds_json,allowance_rates_json,minimum_tax_rate,
                is_active,last_modified,modified_by
         FROM tax_config WHERE is_active=1 LIMIT 1",
        [],
        |row| {
            let bands_json: String = row.get(3)?;
            let caps_json: String = row.get(4)?;
            let cgt_json: String = row.get(5)?;
            let rates_json: String = row.get(6)?;
            Ok(TaxConfig {
                id: Uuid::parse_str(&row.get::<_, String>(0)?).unwrap_or_else(|_| Uuid::new_v4()),
                version_label: row.get(1)?,
                governed_by: row.get(2)?,
                bands: serde_json::from_str(&bands_json).unwrap_or_default(),
                relief_caps: serde_json::from_str(&caps_json).unwrap_or(ReliefCaps {
                    rent_relief_cap: 500_000.0,
                    rent_relief_rate: 0.20,
                }),
                cgt_thresholds: serde_json::from_str(&cgt_json).unwrap_or(CgtThresholds {
                    proceeds_threshold: 150_000_000.0,
                    gain_threshold: 10_000_000.0,
                }),
                allowance_rates: serde_json::from_str(&rates_json).unwrap_or_default(),
                minimum_tax_rate: row.get(7)?,
                is_active: row.get::<_, i32>(8)? == 1,
                last_modified: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(9)?)
                    .unwrap_or_else(|_| {
                        chrono::DateTime::parse_from_rfc3339("2026-01-01T00:00:00Z").unwrap()
                    })
                    .with_timezone(&Utc),
                modified_by: row.get(10)?,
            })
        },
    )
}

pub fn format_payer_id(tin: &str) -> String {
    if tin.starts_with("N-") || tin.starts_with("C-") {
        tin.to_string()
    } else {
        format!("N-{}", tin)
    }
}

fn lirs_data_dir() -> std::path::PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    home.join("LagosFile")
}

fn build_pending_filing(conn: &rusqlite::Connection, id: &str) -> Result<PendingFiling, String> {
    let filing = conn
        .query_row(
            "SELECT id,taxpayer_id,parent_filing_id,year_of_assessment,status,
                    filing_reference,created_at,confirmed_at,total_income_ngn,
                    chargeable_income,tax_payable,wht_credit,net_tax_payable,
                    minimum_tax,final_tax_payable,tax_config_version
             FROM filing WHERE id=?1",
            params![id],
            |row| {
                Ok(Filing {
                    id: Uuid::parse_str(&row.get::<_, String>(0)?)
                        .unwrap_or_else(|_| Uuid::new_v4()),
                    taxpayer_id: Uuid::parse_str(&row.get::<_, String>(1)?)
                        .unwrap_or_else(|_| Uuid::new_v4()),
                    parent_filing_id: row
                        .get::<_, Option<String>>(2)?
                        .and_then(|s| Uuid::parse_str(&s).ok()),
                    year_of_assessment: row.get(3)?,
                    status: row.get(4)?,
                    filing_reference: row.get(5)?,
                    created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(6)?)
                        .unwrap_or_else(|_| {
                            chrono::DateTime::parse_from_rfc3339("2026-01-01T00:00:00Z").unwrap()
                        })
                        .with_timezone(&Utc),
                    confirmed_at: row
                        .get::<_, Option<String>>(7)?
                        .and_then(|s| chrono::DateTime::parse_from_rfc3339(&s).ok())
                        .map(|d| d.with_timezone(&Utc)),
                    total_income_ngn: row.get(8)?,
                    chargeable_income: row.get(9)?,
                    tax_payable: row.get(10)?,
                    wht_credit: row.get(11)?,
                    net_tax_payable: row.get(12)?,
                    minimum_tax: row.get(13)?,
                    final_tax_payable: row.get(14)?,
                    tax_config_version: row.get(15)?,
                })
            },
        )
        .map_err(|e| format!("Filing not found: {}", e))?;

    if filing.status != "Confirmed" {
        return Err(format!(
            "Filing {} is not Confirmed (status: {}).",
            id, filing.status
        ));
    }

    let taxpayer = conn
        .query_row(
            "SELECT full_name, tin FROM taxpayer WHERE id=?1",
            params![filing.taxpayer_id.to_string()],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .map_err(|e| format!("Taxpayer not found: {}", e))?;

    let mut ie_stmt = conn
        .prepare(
            "SELECT income_type,gross_amount_ngn,is_foreign,foreign_currency,
                    foreign_amount,fx_rate_used,fx_rate_source
             FROM income_entry WHERE filing_id=?1",
        )
        .map_err(|e| e.to_string())?;

    #[allow(clippy::type_complexity)]
    let income_rows: Vec<(
        String,
        f64,
        bool,
        Option<String>,
        Option<f64>,
        Option<f64>,
        Option<String>,
    )> = ie_stmt
        .query_map(params![id], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get::<_, i32>(2)? == 1,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
                row.get(6)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut employment = 0.0_f64;
    let mut business = 0.0_f64;
    let mut rental = 0.0_f64;
    let mut dividend = 0.0_f64;
    let mut interest = 0.0_f64;
    let mut capital_gain = 0.0_f64;
    let mut digital_asset = 0.0_f64;
    let mut royalty = 0.0_f64;
    let mut prize = 0.0_f64;
    let mut other = 0.0_f64;
    let mut foreign_total_usd = 0.0_f64;
    let mut foreign_naira = 0.0_f64;
    let mut foreign_rate = 0.0_f64;
    let mut foreign_source = String::new();

    for (in_type, amt, is_foreign, _curr, f_amt, fx_used, fx_src) in &income_rows {
        match in_type.as_str() {
            "employment" => employment += amt,
            "business" => business += amt,
            "rental" => rental += amt,
            "dividend" => dividend += amt,
            "interest" => interest += amt,
            "capital_gain_shares" => capital_gain += amt,
            "digital_asset" => digital_asset += amt,
            "royalty" => royalty += amt,
            "prize" => prize += amt,
            _ => other += amt,
        }
        if *is_foreign {
            foreign_total_usd += f_amt.unwrap_or(0.0);
            if let (Some(r), Some(s)) = (fx_used, fx_src) {
                foreign_naira = *r * f_amt.unwrap_or(0.0);
                foreign_rate = *r;
                foreign_source = s.clone();
            }
        }
    }

    let mut re_stmt = conn
        .prepare("SELECT relief_type,claimed_amount FROM relief_entry WHERE filing_id=?1")
        .map_err(|e| e.to_string())?;

    let mut pension = 0.0_f64;
    let mut nhf = 0.0_f64;
    let mut nhis = 0.0_f64;
    let mut life_assurance = 0.0_f64;
    let mut rent_relief_applied = 0.0_f64;

    let relief_rows: Vec<(String, f64)> = re_stmt
        .query_map(params![id], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    for (r_type, amt) in &relief_rows {
        match r_type.as_str() {
            "pension" => pension += amt,
            "nhf" => nhf += amt,
            "nhis" => nhis += amt,
            "life_assurance" => life_assurance += amt,
            "rent" => rent_relief_applied += amt,
            _ => {}
        }
    }

    let config = load_active_config(conn).map_err(|e| e.to_string())?;

    let mut ie_full_stmt = conn
        .prepare(
            "SELECT id,filing_id,income_type,description,gross_amount_ngn,is_foreign,
                    foreign_currency,foreign_amount,income_date,fx_rate_fetched,
                    fx_rate_cbn_override,fx_rate_used,fx_rate_source,foreign_tax_paid_ngn,
                    is_cgt_exempt,cgt_proceeds,cgt_gain
             FROM income_entry WHERE filing_id=?1",
        )
        .map_err(|e| e.to_string())?;

    let income_entries: Vec<IncomeEntry> = ie_full_stmt
        .query_map(params![id], |row| {
            Ok(IncomeEntry {
                id: Uuid::parse_str(&row.get::<_, String>(0)?).unwrap_or_else(|_| Uuid::new_v4()),
                filing_id: Uuid::parse_str(&row.get::<_, String>(1)?)
                    .unwrap_or_else(|_| Uuid::new_v4()),
                income_type: row.get(2)?,
                description: row.get(3)?,
                gross_amount_ngn: row.get(4)?,
                is_foreign: row.get::<_, i32>(5)? == 1,
                foreign_currency: row.get(6)?,
                foreign_amount: row.get(7)?,
                income_date: row
                    .get::<_, Option<String>>(8)?
                    .and_then(|s| chrono::NaiveDate::parse_from_str(&s, "%Y-%m-%d").ok()),
                fx_rate_fetched: row.get(9)?,
                fx_rate_cbn_override: row.get(10)?,
                fx_rate_used: row.get(11)?,
                fx_rate_source: row.get(12)?,
                foreign_tax_paid_ngn: row.get(13)?,
                is_cgt_exempt: row.get::<_, i32>(14)? == 1,
                cgt_proceeds: row.get(15)?,
                cgt_gain: row.get(16)?,
                documents: vec![],
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut ca_stmt = conn
        .prepare(
            "SELECT id,filing_id,asset_description,asset_type,asset_cost,acquisition_date,
                    tax_written_down_value,annual_allowance_rate,annual_allowance_amount
             FROM capital_allowance WHERE filing_id=?1",
        )
        .map_err(|e| e.to_string())?;

    let allowances: Vec<CapitalAllowance> = ca_stmt
        .query_map(params![id], |row| {
            Ok(CapitalAllowance {
                id: Uuid::parse_str(&row.get::<_, String>(0)?).unwrap_or_else(|_| Uuid::new_v4()),
                filing_id: Uuid::parse_str(&row.get::<_, String>(1)?)
                    .unwrap_or_else(|_| Uuid::new_v4()),
                asset_description: row.get(2)?,
                asset_type: row.get(3)?,
                asset_cost: row.get(4)?,
                acquisition_date: chrono::NaiveDate::parse_from_str(
                    &row.get::<_, String>(5)?,
                    "%Y-%m-%d",
                )
                .unwrap_or_default(),
                tax_written_down_value: row.get(6)?,
                annual_allowance_rate: row.get(7)?,
                annual_allowance_amount: row.get(8)?,
                documents: vec![],
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut re_full_stmt = conn
        .prepare(
            "SELECT id,filing_id,relief_type,claimed_amount,approved_amount,
                    wht_ref,wht_income_type,wht_date
             FROM relief_entry WHERE filing_id=?1",
        )
        .map_err(|e| e.to_string())?;

    let reliefs: Vec<ReliefEntry> = re_full_stmt
        .query_map(params![id], |row| {
            Ok(ReliefEntry {
                id: Uuid::parse_str(&row.get::<_, String>(0)?).unwrap_or_else(|_| Uuid::new_v4()),
                filing_id: Uuid::parse_str(&row.get::<_, String>(1)?)
                    .unwrap_or_else(|_| Uuid::new_v4()),
                relief_type: row.get(2)?,
                claimed_amount: row.get(3)?,
                approved_amount: row.get(4)?,
                wht_ref: row.get(5)?,
                wht_income_type: row.get(6)?,
                wht_date: row
                    .get::<_, Option<String>>(7)?
                    .and_then(|s| chrono::NaiveDate::parse_from_str(&s, "%Y-%m-%d").ok()),
                documents: vec![],
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let computation = ComputationEngine::compute(&income_entries, &allowances, &reliefs, &config)
        .map_err(|e| e.to_string())?;

    let yoa = filing.year_of_assessment;

    Ok(PendingFiling {
        filing_id: filing.id.to_string(),
        taxpayer: PendingFilingTaxpayer {
            full_name: taxpayer.0,
            tin: taxpayer.1.clone(),
            payer_id: format_payer_id(&taxpayer.1),
        },
        year_of_assessment: yoa,
        filing_reference: filing.filing_reference.clone(),
        income: PendingFilingIncome {
            employment,
            business,
            rental,
            dividend,
            interest,
            capital_gain,
            digital_asset,
            royalty,
            prize,
            other,
            foreign_income: PendingFilingForeignIncome {
                total_usd: foreign_total_usd,
                currency: if foreign_total_usd > 0.0 {
                    "USD".to_string()
                } else {
                    String::new()
                },
                fx_rate_used: foreign_rate,
                fx_rate_source: foreign_source,
                naira_equivalent: foreign_naira,
            },
        },
        accommodation: PendingFilingAccommodation {
            acc_type: if rental > 0.0 {
                "rent".to_string()
            } else {
                "owner".to_string()
            },
            ownership: if rental > 0.0 {
                "tenant".to_string()
            } else {
                "owner".to_string()
            },
            rent_paid: rental,
            rent_paid_by_employer: 0.0,
            date_started: format!("{}-01-01", yoa),
            date_end: format!("{}-12-31", yoa),
        },
        deductions: PendingFilingDeductions {
            pension,
            nhf,
            nhis,
            life_assurance,
            rent_relief_applied,
        },
        computation: PendingFilingComputation {
            total_gross_income: computation.total_gross_income,
            total_capital_allowances: computation.prorated_capital_allowances,
            chargeable_income: computation.chargeable_income,
            graduated_tax: computation.graduated_tax,
            wht_credits: computation.wht_credits,
            net_tax_payable: computation.net_tax_payable,
            minimum_tax: computation.minimum_tax,
            final_tax_payable: computation.final_tax_payable,
            config_version: computation.config_version.clone(),
        },
        generated_at: Utc::now().to_rfc3339(),
    })
}

pub fn build_http_response(status: u16, content_type: &str, body: &str) -> String {
    let status_text = match status {
        200 => "OK",
        404 => "Not Found",
        _ => "Error",
    };
    let cors = "Access-Control-Allow-Origin: *\r\n\
                Access-Control-Allow-Methods: GET, OPTIONS\r\n\
                Access-Control-Allow-Headers: Content-Type\r\n";
    format!(
        "HTTP/1.1 {} {}\r\nContent-Type: {}\r\n{}Content-Length: {}\r\nConnection: close\r\n\r\n{}",
        status,
        status_text,
        content_type,
        cors,
        body.len(),
        body
    )
}

fn start_bridge_server(filings_array_json: String, primary_json: String) {
    std::thread::spawn(move || {
        let listener = match TcpListener::bind(("127.0.0.1", LIRS_BRIDGE_PORT)) {
            Ok(l) => l,
            Err(e) => {
                eprintln!(
                    "[LagosFile] LIRS bridge port {} already in use: {}",
                    LIRS_BRIDGE_PORT, e
                );
                return;
            }
        };
        listener.set_nonblocking(true).ok();
        println!(
            "[LagosFile] LIRS bridge started on http://127.0.0.1:{}",
            LIRS_BRIDGE_PORT
        );

        let mut last_request = Instant::now();

        loop {
            if last_request.elapsed() > Duration::from_secs(LIRS_BRIDGE_TIMEOUT_SECS) {
                println!("[LagosFile] LIRS bridge idle timeout — shutting down.");
                break;
            }

            match listener.accept() {
                Ok((mut stream, _addr)) => {
                    last_request = Instant::now();

                    let mut buf = [0u8; 2048];
                    let n = stream.read(&mut buf).unwrap_or(0);
                    if n == 0 {
                        continue;
                    }

                    let request = String::from_utf8_lossy(&buf[..n]);
                    let first_line = request.lines().next().unwrap_or("");

                    let response = if first_line.starts_with("OPTIONS") {
                        build_http_response(200, "text/plain", "")
                    } else if first_line.starts_with("GET /filings") {
                        build_http_response(200, "application/json", &filings_array_json)
                    } else if first_line.starts_with("GET /filing") {
                        build_http_response(200, "application/json", &primary_json)
                    } else if first_line.starts_with("GET /health") {
                        build_http_response(200, "application/json", r#"{"status":"ok"}"#)
                    } else {
                        build_http_response(404, "text/plain", "not found")
                    };

                    let _ = stream.write_all(response.as_bytes());
                    let _ = stream.flush();
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(200));
                }
                Err(_) => {
                    std::thread::sleep(Duration::from_millis(200));
                }
            }
        }
    });
}

#[tauri::command]
pub async fn open_lirs_portal(
    id: String,
    state: State<'_, AppState>,
) -> Result<LIRSAutomationResult, String> {
    let (primary, all_filings, filing_ref) = {
        let guard = state.db.lock().map_err(|e| e.to_string())?;
        let db = guard.as_ref().ok_or("Database not unlocked")?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;

        let primary = build_pending_filing(&conn, &id)?;
        let filing_ref = primary.filing_reference.clone();

        let all_ids: Vec<String> = conn
            .prepare(
                "SELECT id FROM filing WHERE status='Confirmed' ORDER BY year_of_assessment DESC",
            )
            .map_err(|e| e.to_string())?
            .query_map([], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        let mut all_filings: Vec<PendingFiling> = all_ids
            .iter()
            .filter(|fid| *fid != &id)
            .filter_map(|fid| build_pending_filing(&conn, fid).ok())
            .collect();

        all_filings.insert(0, primary.clone());

        (primary, all_filings, filing_ref)
    };

    let data_dir = lirs_data_dir();
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let path = data_dir.join("pending_filing.json");
    let primary_json = serde_json::to_string(&primary).map_err(|e| e.to_string())?;
    let file_json = serde_json::to_string_pretty(&primary).map_err(|e| e.to_string())?;
    std::fs::write(&path, &file_json).map_err(|e| e.to_string())?;

    let filings_json = serde_json::to_string(&all_filings).map_err(|e| e.to_string())?;

    start_bridge_server(filings_json, primary_json);

    let portal_url = "https://etax.lirs.net/user/assessments/tax-calculator";
    open::that(portal_url).map_err(|e| format!("Failed to open browser: {}", e))?;

    Ok(LIRSAutomationResult {
        success: true,
        fallback_active: false,
        message: format!(
            "LIRS portal opened. {} filing(s) available in the extension. Reference: {}.",
            all_filings.len(),
            filing_ref.unwrap_or_else(|| "N/A".to_string())
        ),
        pending_filing_path: Some(path.to_string_lossy().to_string()),
        filing_id: id,
    })
}

#[tauri::command]
pub async fn open_lirs_portal_all(
    state: State<'_, AppState>,
) -> Result<LIRSAutomationResult, String> {
    let filings = {
        let guard = state.db.lock().map_err(|e| e.to_string())?;
        let db = guard.as_ref().ok_or("Database not unlocked")?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;

        let ids: Vec<String> = conn
            .prepare(
                "SELECT id FROM filing WHERE status='Confirmed' ORDER BY year_of_assessment DESC",
            )
            .map_err(|e| e.to_string())?
            .query_map([], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        if ids.is_empty() {
            return Err(
                "No confirmed filings found. Confirm a filing before using the LIRS extension."
                    .to_string(),
            );
        }

        ids.iter()
            .filter_map(|id| build_pending_filing(&conn, id).ok())
            .collect::<Vec<_>>()
    };

    let count = filings.len();
    let primary_json = serde_json::to_string(&filings[0]).map_err(|e| e.to_string())?;
    let filings_json = serde_json::to_string(&filings).map_err(|e| e.to_string())?;

    start_bridge_server(filings_json, primary_json);

    let portal_url = "https://etax.lirs.net/user/assessments/tax-calculator";
    open::that(portal_url).map_err(|e| format!("Failed to open browser: {}", e))?;

    Ok(LIRSAutomationResult {
        success: true,
        fallback_active: false,
        message: format!("{} confirmed filing(s) ready in the LIRS extension.", count),
        pending_filing_path: None,
        filing_id: String::new(),
    })
}
