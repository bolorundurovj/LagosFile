use crate::{
    models::*,
    services::{
        computation::{bik_taxable_value, ComputationEngine},
        config::ConfigService,
    },
    AppState,
};
use chrono::Utc;
use rusqlite::params;
use std::{
    collections::BTreeMap,
    io::{Read, Write},
    net::TcpListener,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};
use tauri::State;
use uuid::Uuid;

const LIRS_BRIDGE_PORT: u16 = 19876;
const LIRS_BRIDGE_IDLE_TIMEOUT_SECS: u64 = 600; // 10 minutes
const LIRS_BRIDGE_MAX_LIFETIME_SECS: u64 = 3600; // 60 minutes hard cap

pub struct BridgeHandle {
    stop: Arc<AtomicBool>,
    handle: Option<std::thread::JoinHandle<()>>,
    pub port: u16,
    pub token: String,
}

fn generate_bridge_token() -> String {
    use rand::RngCore;
    let mut bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    hex::encode(bytes)
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

impl BridgeHandle {
    pub fn stop(mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(h) = self.handle.take() {
            let _ = h.join();
        }
    }
}

impl Drop for BridgeHandle {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(h) = self.handle.take() {
            let _ = h.join();
        }
    }
}

pub fn stop_bridge(state: &AppState) {
    let existing = state.bridge.lock().unwrap().take();
    if let Some(handle) = existing {
        handle.stop();
    }
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

pub fn build_pending_filing(conn: &rusqlite::Connection, id: &str) -> Result<PendingFiling, String> {
    let filing = conn
        .query_row(
            "SELECT id,taxpayer_id,parent_filing_id,year_of_assessment,status,
                    filing_reference,created_at,confirmed_at,total_income_ngn,
                    chargeable_income,tax_payable,wht_credit,net_tax_payable,
                    minimum_tax,final_tax_payable,tax_config_version,tax_config_id
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
                    submitted_at: None,
                    total_income_ngn: row.get(8)?,
                    chargeable_income: row.get(9)?,
                    tax_payable: row.get(10)?,
                    wht_credit: row.get(11)?,
                    paye_credit: None,
                    foreign_tax_credit: None,
                    net_tax_payable: row.get(12)?,
                    minimum_tax: row.get(13)?,
                    final_tax_payable: row.get(14)?,
                    tax_config_version: row.get(15)?,
                    tax_config_id: row
                        .get::<_, Option<String>>(16)?
                        .and_then(|s| Uuid::parse_str(&s).ok()),
                    payment_date: None,
                    payment_reference: None,
                    amount_paid: None,
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

    let config = ConfigService::get_for_filing(conn, id).map_err(|e| e.to_string())?;

    let mut ie_full_stmt = conn
        .prepare(
            "SELECT id,filing_id,income_type,description,gross_amount_ngn,is_foreign,
                    foreign_currency,foreign_amount,income_date,fx_rate_fetched,
                    fx_rate_cbn_override,fx_rate_used,fx_rate_source,foreign_tax_paid_ngn,
                    is_cgt_exempt,cgt_proceeds,cgt_gain,bik_category,bik_cost
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
                bik_category: row.get(17)?,
                bik_cost: row.get(18)?,
                documents: vec![],
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let total_employment_income: f64 = income_entries
        .iter()
        .filter(|e| e.income_type == "employment")
        .map(|e| e.gross_amount_ngn.max(0.0))
        .sum();
    let mut remaining_accommodation_cap = total_employment_income * 0.20;

    let mut employment = 0.0_f64;
    let mut benefits_in_kind = 0.0_f64;
    let mut rent_paid_by_employer = 0.0_f64;
    let mut business = 0.0_f64;
    let mut rental = 0.0_f64;
    let mut dividend = 0.0_f64;
    let mut interest = 0.0_f64;
    let mut capital_gain = 0.0_f64;
    let mut digital_asset = 0.0_f64;
    let mut royalty = 0.0_f64;
    let mut prize = 0.0_f64;
    let mut other = 0.0_f64;

    struct ForeignAcc {
        total_amount: f64,
        naira_equivalent: f64,
        last_rate: f64,
        sources: Vec<String>,
    }
    let mut foreign_by_currency: BTreeMap<String, ForeignAcc> = BTreeMap::new();

    for entry in &income_entries {
        match entry.income_type.as_str() {
            "employment" => employment += entry.gross_amount_ngn,
            "benefits_in_kind" => {
                if entry.bik_category.as_deref() == Some("accommodation") {
                    rent_paid_by_employer +=
                        entry.bik_cost.unwrap_or(entry.gross_amount_ngn).max(0.0);
                }
                let val = match (entry.bik_category.as_deref(), entry.bik_cost) {
                    (Some("accommodation"), Some(cost)) => {
                        let capped = cost.max(0.0).min(remaining_accommodation_cap);
                        remaining_accommodation_cap =
                            (remaining_accommodation_cap - capped).max(0.0);
                        capped
                    }
                    _ => bik_taxable_value(entry, total_employment_income),
                };
                benefits_in_kind += val;
            }
            "business" => business += entry.gross_amount_ngn,
            "rental" => rental += entry.gross_amount_ngn,
            "dividend" => dividend += entry.gross_amount_ngn,
            "interest" => interest += entry.gross_amount_ngn,
            "capital_gain_shares" => {
                capital_gain += entry.cgt_gain.unwrap_or(entry.gross_amount_ngn)
            }
            "digital_asset" => digital_asset += entry.gross_amount_ngn,
            "royalty" => royalty += entry.gross_amount_ngn,
            "prize" => prize += entry.gross_amount_ngn,
            _ => other += entry.gross_amount_ngn,
        }
        if entry.is_foreign {
            let curr = entry
                .foreign_currency
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .unwrap_or("USD")
                .to_uppercase();
            let amt = entry.foreign_amount.unwrap_or(0.0).max(0.0);
            let ngn = if entry.gross_amount_ngn > 0.0 {
                entry.gross_amount_ngn
            } else {
                entry.fx_rate_used.unwrap_or(0.0) * amt
            };
            let acc = foreign_by_currency.entry(curr).or_insert(ForeignAcc {
                total_amount: 0.0,
                naira_equivalent: 0.0,
                last_rate: 0.0,
                sources: Vec::new(),
            });
            acc.total_amount += amt;
            acc.naira_equivalent += ngn;
            if let Some(r) = entry.fx_rate_used {
                acc.last_rate = r;
            }
            if let Some(ref s) = entry.fx_rate_source {
                let s_trim = s.trim();
                if !s_trim.is_empty() && !acc.sources.iter().any(|existing| existing == s_trim) {
                    acc.sources.push(s_trim.to_string());
                }
            }
        }
    }

    let foreign_incomes: Vec<PendingFilingForeignCurrencySummary> = foreign_by_currency
        .into_iter()
        .map(|(currency, acc)| {
            let fx_rate_used = if acc.total_amount > 0.0 {
                acc.naira_equivalent / acc.total_amount
            } else {
                acc.last_rate
            };
            PendingFilingForeignCurrencySummary {
                currency,
                total_amount: acc.total_amount,
                fx_rate_used,
                fx_rate_source: acc.sources.join(", "),
                naira_equivalent: acc.naira_equivalent,
            }
        })
        .collect();

    let primary_foreign = foreign_incomes
        .iter()
        .max_by(|a, b| a.naira_equivalent.total_cmp(&b.naira_equivalent))
        .map(|f| PendingFilingForeignIncome {
            total_usd: f.total_amount,
            currency: f.currency.clone(),
            fx_rate_used: f.fx_rate_used,
            fx_rate_source: f.fx_rate_source.clone(),
            naira_equivalent: f.naira_equivalent,
        })
        .unwrap_or(PendingFilingForeignIncome {
            total_usd: 0.0,
            currency: String::new(),
            fx_rate_used: 0.0,
            fx_rate_source: String::new(),
            naira_equivalent: 0.0,
        });

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
                description: None,
                documents: vec![],
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let computation = ComputationEngine::compute(&income_entries, &allowances, &reliefs, &config)
        .map_err(|e| e.to_string())?;

    let mut pension_raw = 0.0_f64;
    let mut nhf_raw = 0.0_f64;
    let mut nhis_raw = 0.0_f64;
    let mut life_assurance = 0.0_f64;
    let mut other_approved = 0.0_f64;
    let mut rent_paid = 0.0_f64;

    for r in &reliefs {
        let approved = r.approved_amount.max(0.0);
        match r.relief_type.as_str() {
            "pension" => pension_raw += approved,
            "nhf" => nhf_raw += approved,
            "nhis" => nhis_raw += approved,
            "life_assurance" => life_assurance += approved,
            "other_approved" => other_approved += approved,
            "rent" => {
                rent_paid += if approved > 0.0 {
                    approved
                } else {
                    r.claimed_amount.max(0.0)
                };
            }
            _ => {}
        }
    }

    let apply_cap = |v: f64, cap: Option<f64>| match cap {
        Some(limit) => v.min(limit),
        None => v,
    };
    let pension = apply_cap(pension_raw, config.relief_caps.pension_cap);
    let nhf = apply_cap(nhf_raw, config.relief_caps.nhf_cap);
    let nhis = apply_cap(nhis_raw, config.relief_caps.nhis_cap);

    let (acc_type, ownership) = if rent_paid > 0.0 {
        ("rent".to_string(), "tenant".to_string())
    } else if rent_paid_by_employer > 0.0 {
        ("employer_provided".to_string(), "tenant".to_string())
    } else {
        ("owner".to_string(), "owner".to_string())
    };

    let income_year = filing.year_of_assessment;
    let lirs_yoa = income_year + 1;

    Ok(PendingFiling {
        filing_id: filing.id.to_string(),
        taxpayer: PendingFilingTaxpayer {
            full_name: taxpayer.0,
            tin: taxpayer.1.clone(),
            payer_id: format_payer_id(&taxpayer.1),
        },
        year_of_assessment: lirs_yoa,
        filing_reference: filing.filing_reference.clone(),
        income: PendingFilingIncome {
            employment,
            benefits_in_kind,
            business,
            rental,
            dividend,
            interest,
            capital_gain,
            digital_asset,
            royalty,
            prize,
            other,
            foreign_income: primary_foreign,
            foreign_incomes,
        },
        accommodation: PendingFilingAccommodation {
            acc_type,
            ownership,
            rent_paid,
            rent_paid_by_employer,
            date_started: format!("{}-01-01", income_year),
            date_end: format!("{}-12-31", income_year),
        },
        deductions: PendingFilingDeductions {
            pension,
            nhf,
            nhis,
            life_assurance,
            rent_relief_applied: computation.rent_relief_applied,
            other_approved,
        },
        computation: PendingFilingComputation {
            total_gross_income: computation.total_gross_income,
            total_capital_allowances: computation.prorated_capital_allowances,
            chargeable_income: computation.chargeable_income,
            graduated_tax: computation.graduated_tax,
            wht_credits: computation.wht_credits,
            paye_credits: computation.paye_credits,
            foreign_tax_credits: computation.foreign_tax_credits,
            net_tax_payable: computation.net_tax_payable,
            minimum_tax: computation.minimum_tax,
            final_tax_payable: computation.final_tax_payable,
            config_version: computation.config_version.clone(),
        },
        generated_at: Utc::now().to_rfc3339(),
    })
}

/// Append an automation failure event to ~/LagosFile/automation-errors.log.
/// Never panics — errors are swallowed so a logging failure never crashes the command.
pub fn log_automation_failure(filing_id: &str, reason: &str) {
    let dir = lirs_data_dir();
    let _ = std::fs::create_dir_all(&dir);
    let log_path = dir.join("automation-errors.log");
    let timestamp = Utc::now().format("%Y-%m-%dT%H:%M:%SZ");
    let line = format!(
        "[{}] filing_id={} reason={}\n",
        timestamp, filing_id, reason
    );
    // Append to log file (create if absent)
    use std::io::Write;
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
    {
        let _ = f.write_all(line.as_bytes());
    }
}

pub fn is_allowed_origin(origin: &str) -> bool {
    if origin.contains('\r') || origin.contains('\n') {
        return false;
    }
    origin == "https://etax.lirs.net"
        || origin == "https://etax.lirs.gov.ng"
        || (origin.starts_with("chrome-extension://") && origin.len() > "chrome-extension://".len())
        || (origin.starts_with("moz-extension://") && origin.len() > "moz-extension://".len())
}

pub fn is_allowed_host(host: &str, port: u16) -> bool {
    host.eq_ignore_ascii_case(&format!("127.0.0.1:{}", port))
}

pub fn build_http_response(
    status: u16,
    content_type: &str,
    body: &str,
    allowed_origin: Option<&str>,
) -> String {
    let status_text = match status {
        200 => "OK",
        403 => "Forbidden",
        404 => "Not Found",
        _ => "Error",
    };
    let cors = match allowed_origin {
        Some(orig) => format!(
            "Access-Control-Allow-Origin: {}\r\n\
             Vary: Origin\r\n\
             Access-Control-Allow-Methods: GET, OPTIONS\r\n\
             Access-Control-Allow-Headers: Content-Type, X-LagosFile-Token\r\n",
            orig
        ),
        None => String::new(),
    };
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

pub fn handle_bridge_request(
    request: &str,
    port: u16,
    expected_token: &str,
    filings_array_json: &str,
    primary_json: &str,
) -> (String, bool) {
    let mut lines = request.lines();
    let first_line = lines.next().unwrap_or("");

    let mut host: Option<&str> = None;
    let mut origin: Option<&str> = None;
    let mut token: Option<&str> = None;

    for line in lines {
        if line.is_empty() {
            break;
        }
        if let Some((name, value)) = line.split_once(':') {
            let name_trimmed = name.trim();
            let val_trimmed = value.trim();
            if name_trimmed.eq_ignore_ascii_case("host") {
                host = Some(val_trimmed);
            } else if name_trimmed.eq_ignore_ascii_case("origin") {
                origin = Some(val_trimmed);
            } else if name_trimmed.eq_ignore_ascii_case("x-lagosfile-token") {
                token = Some(val_trimmed);
            }
        }
    }

    match host {
        Some(h) if is_allowed_host(h, port) => {}
        _ => return (build_http_response(403, "text/plain", "", None), false),
    }

    let cors_origin = match origin {
        Some(orig) => {
            if is_allowed_origin(orig) {
                Some(orig)
            } else {
                return (build_http_response(403, "text/plain", "", None), false);
            }
        }
        None => None,
    };

    // Preflight OPTIONS does not carry the custom token and must NOT reset the idle timer.
    if first_line.starts_with("OPTIONS") {
        return (build_http_response(200, "text/plain", "", cors_origin), false);
    }

    // Every data/health request must present the current session token.
    let token_valid = match token {
        Some(provided) if !expected_token.is_empty() => {
            constant_time_eq(provided.as_bytes(), expected_token.as_bytes())
        }
        _ => false,
    };
    if !token_valid {
        return (build_http_response(403, "text/plain", "", cors_origin), false);
    }

    let (response, reset_idle) = if first_line.starts_with("GET /filings") {
        (
            build_http_response(200, "application/json", filings_array_json, cors_origin),
            true,
        )
    } else if first_line.starts_with("GET /filing") {
        (
            build_http_response(200, "application/json", primary_json, cors_origin),
            true,
        )
    } else if first_line.starts_with("GET /health") {
        (
            build_http_response(200, "application/json", r#"{"status":"ok"}"#, cors_origin),
            true,
        )
    } else {
        (
            build_http_response(404, "text/plain", "not found", cors_origin),
            false,
        )
    };

    (response, reset_idle)
}

pub fn start_bridge_on_port(
    state: &AppState,
    port: u16,
    filings_array_json: String,
    primary_json: String,
) -> Result<(u16, String), String> {
    stop_bridge(state);

    let listener = TcpListener::bind(("127.0.0.1", port))
        .map_err(|e| format!("Failed to bind LIRS bridge on port {}: {}", port, e))?;
    let bound_port = listener.local_addr().map_err(|e| e.to_string())?.port();
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;

    let token = generate_bridge_token();
    let thread_token = token.clone();
    let stop = Arc::new(AtomicBool::new(false));
    let stop_flag = Arc::clone(&stop);

    println!(
        "[LagosFile] LIRS bridge started on http://127.0.0.1:{}",
        bound_port
    );

    let handle = std::thread::spawn(move || {
        let started_at = Instant::now();
        let mut last_request = Instant::now();

        loop {
            if stop_flag.load(Ordering::SeqCst) {
                println!("[LagosFile] LIRS bridge stopped.");
                break;
            }
            if started_at.elapsed() > Duration::from_secs(LIRS_BRIDGE_MAX_LIFETIME_SECS)
                || last_request.elapsed() > Duration::from_secs(LIRS_BRIDGE_IDLE_TIMEOUT_SECS)
            {
                println!("[LagosFile] LIRS bridge timeout — shutting down.");
                break;
            }

            match listener.accept() {
                Ok((mut stream, _addr)) => {
                    let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
                    let mut buf = [0u8; 4096];
                    let n = stream.read(&mut buf).unwrap_or(0);
                    if n == 0 {
                        continue;
                    }

                    let request = String::from_utf8_lossy(&buf[..n]);
                    let (response, authenticated) = handle_bridge_request(
                        &request,
                        bound_port,
                        &thread_token,
                        &filings_array_json,
                        &primary_json,
                    );
                    if authenticated {
                        last_request = Instant::now();
                    }

                    let _ = stream.write_all(response.as_bytes());
                    let _ = stream.flush();
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(50));
                }
                Err(_) => {
                    std::thread::sleep(Duration::from_millis(50));
                }
            }
        }
    });

    *state.bridge.lock().unwrap() = Some(BridgeHandle {
        stop,
        handle: Some(handle),
        port: bound_port,
        token: token.clone(),
    });
    Ok((bound_port, token))
}

pub fn build_all_pending_filings_detailed(
    conn: &rusqlite::Connection,
) -> Result<PendingFilingBatch, String> {
    let rows: Vec<(String, i32)> = conn
        .prepare(
            "SELECT id, year_of_assessment FROM filing WHERE status='Confirmed' ORDER BY year_of_assessment DESC",
        )
        .map_err(|e| e.to_string())?
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    if rows.is_empty() {
        return Err(
            "No confirmed filings found. Confirm a filing before using the LIRS extension."
                .to_string(),
        );
    }

    let mut filings = Vec::new();
    let mut failures = Vec::new();
    for (id, yoa) in rows {
        match build_pending_filing(conn, &id) {
            Ok(f) => filings.push(f),
            Err(e) => {
                log_automation_failure(&id, &e);
                failures.push(FailedPendingFiling {
                    filing_id: id,
                    year_of_assessment: yoa,
                    error: e,
                });
            }
        }
    }

    if filings.is_empty() {
        let reasons: Vec<String> = failures
            .iter()
            .map(|f| format!("{} ({}): {}", f.year_of_assessment, f.filing_id, f.error))
            .collect();
        return Err(format!(
            "Could not build any confirmed filings for LIRS: {}",
            reasons.join("; ")
        ));
    }

    Ok(PendingFilingBatch { filings, failures })
}

pub fn build_all_pending_filings(conn: &rusqlite::Connection) -> Result<Vec<PendingFiling>, String> {
    build_all_pending_filings_detailed(conn).map(|b| b.filings)
}

fn format_failure_warnings(failures: &[FailedPendingFiling]) -> Vec<String> {
    failures
        .iter()
        .map(|f| {
            format!(
                "Filing {} (income year {}) skipped: {}",
                f.filing_id, f.year_of_assessment, f.error
            )
        })
        .collect()
}

#[tauri::command]
pub async fn open_lirs_portal(
    id: String,
    state: State<'_, AppState>,
) -> Result<LIRSAutomationResult, String> {
    let (primary, all_filings, filing_ref, failures) = {
        let guard = state.db.lock().map_err(|e| e.to_string())?;
        let db = guard.as_ref().ok_or("Database not unlocked")?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;

        let primary = build_pending_filing(&conn, &id)?;
        let filing_ref = primary.filing_reference.clone();

        let all_rows: Vec<(String, i32)> = conn
            .prepare(
                "SELECT id, year_of_assessment FROM filing WHERE status='Confirmed' ORDER BY year_of_assessment DESC",
            )
            .map_err(|e| e.to_string())?
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        let mut all_filings: Vec<PendingFiling> = Vec::new();
        let mut failures: Vec<FailedPendingFiling> = Vec::new();
        for (fid, yoa) in all_rows {
            if fid == id {
                continue;
            }
            match build_pending_filing(&conn, &fid) {
                Ok(f) => all_filings.push(f),
                Err(e) => {
                    log_automation_failure(&fid, &e);
                    failures.push(FailedPendingFiling {
                        filing_id: fid,
                        year_of_assessment: yoa,
                        error: e,
                    });
                }
            }
        }

        all_filings.insert(0, primary.clone());

        (primary, all_filings, filing_ref, failures)
    };

    let data_dir = lirs_data_dir();
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let path = data_dir.join("pending_filing.json");
    let primary_json = serde_json::to_string(&primary).map_err(|e| e.to_string())?;
    let file_json = serde_json::to_string_pretty(&primary).map_err(|e| e.to_string())?;
    std::fs::write(&path, &file_json).map_err(|e| e.to_string())?;

    let filings_json = serde_json::to_string(&all_filings).map_err(|e| e.to_string())?;

    let (_port, token) = start_bridge_on_port(&state, LIRS_BRIDGE_PORT, filings_json, primary_json)?;

    let portal_url = format!(
        "https://etax.lirs.net/user/assessments/tax-calculator#lagosfile={}",
        token
    );
    if let Err(e) = open::that(&portal_url) {
        let reason = format!("Failed to open browser: {}", e);
        log_automation_failure(&id, &reason);
        return Err(reason);
    }

    let warnings = format_failure_warnings(&failures);
    let mut message = format!(
        "LIRS portal opened. {} filing(s) available in the extension. Reference: {}.",
        all_filings.len(),
        filing_ref.unwrap_or_else(|| "N/A".to_string())
    );
    if !warnings.is_empty() {
        message.push_str(&format!(
            " {} other confirmed filing(s) could not be prepared: {}",
            warnings.len(),
            warnings.join("; ")
        ));
    }

    Ok(LIRSAutomationResult {
        success: true,
        fallback_active: false,
        message,
        pending_filing_path: Some(path.to_string_lossy().to_string()),
        filing_id: id,
        warnings,
    })
}

#[tauri::command]
pub async fn open_lirs_portal_all(
    state: State<'_, AppState>,
) -> Result<LIRSAutomationResult, String> {
    let batch = {
        let guard = state.db.lock().map_err(|e| e.to_string())?;
        let db = guard.as_ref().ok_or("Database not unlocked")?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        build_all_pending_filings_detailed(&conn)?
    };

    let count = batch.filings.len();
    let primary_json = serde_json::to_string(&batch.filings[0]).map_err(|e| e.to_string())?;
    let filings_json = serde_json::to_string(&batch.filings).map_err(|e| e.to_string())?;

    let (_port, token) = start_bridge_on_port(&state, LIRS_BRIDGE_PORT, filings_json, primary_json)?;

    let portal_url = format!(
        "https://etax.lirs.net/user/assessments/tax-calculator#lagosfile={}",
        token
    );
    if let Err(e) = open::that(&portal_url) {
        let reason = format!("Failed to open browser: {}", e);
        log_automation_failure("batch", &reason);
        return Err(reason);
    }

    let warnings = format_failure_warnings(&batch.failures);
    let mut message = format!("{} confirmed filing(s) ready in the LIRS extension.", count);
    if !warnings.is_empty() {
        message.push_str(&format!(
            " {} filing(s) failed: {}",
            warnings.len(),
            warnings.join("; ")
        ));
    }

    Ok(LIRSAutomationResult {
        success: true,
        fallback_active: false,
        message,
        pending_filing_path: None,
        filing_id: String::new(),
        warnings,
    })
}
