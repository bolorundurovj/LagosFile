use crate::{
    commands::auth::persist_db,
    models::*,
    services::computation::ComputationEngine,
    AppState,
};
use chrono::Utc;
use rusqlite::params;
use tauri::State;
use uuid::Uuid;

// ── helpers ──────────────────────────────────────────────────

fn row_to_filing(row: &rusqlite::Row<'_>) -> rusqlite::Result<Filing> {
    Ok(Filing {
        id: Uuid::parse_str(&row.get::<_, String>(0)?).unwrap_or_else(|_| Uuid::new_v4()),
        taxpayer_id: Uuid::parse_str(&row.get::<_, String>(1)?).unwrap_or_else(|_| Uuid::new_v4()),
        parent_filing_id: row.get::<_, Option<String>>(2)?.and_then(|s| Uuid::parse_str(&s).ok()),
        year_of_assessment: row.get(3)?,
        status: row.get(4)?,
        filing_reference: row.get(5)?,
        created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(6)?)
            .unwrap_or_else(|_| chrono::DateTime::parse_from_rfc3339("2026-01-01T00:00:00Z").unwrap())
            .with_timezone(&Utc),
        confirmed_at: row.get::<_, Option<String>>(7)?.and_then(|s| chrono::DateTime::parse_from_rfc3339(&s).ok()).map(|d| d.with_timezone(&Utc)),
        total_income_ngn: row.get(8)?,
        chargeable_income: row.get(9)?,
        tax_payable: row.get(10)?,
        wht_credit: row.get(11)?,
        net_tax_payable: row.get(12)?,
        minimum_tax: row.get(13)?,
        final_tax_payable: row.get(14)?,
        tax_config_version: row.get(15)?,
    })
}

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
                relief_caps: serde_json::from_str(&caps_json).unwrap_or(ReliefCaps { rent_relief_cap: 500_000.0, rent_relief_rate: 0.20 }),
                cgt_thresholds: serde_json::from_str(&cgt_json).unwrap_or(CgtThresholds { proceeds_threshold: 150_000_000.0, gain_threshold: 10_000_000.0 }),
                allowance_rates: serde_json::from_str(&rates_json).unwrap_or_default(),
                minimum_tax_rate: row.get(7)?,
                is_active: row.get::<_, i32>(8)? == 1,
                last_modified: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(9)?)
                    .unwrap_or_else(|_| chrono::DateTime::parse_from_rfc3339("2026-01-01T00:00:00Z").unwrap())
                    .with_timezone(&Utc),
                modified_by: row.get(10)?,
            })
        },
    )
}

// ── Filing commands ───────────────────────────────────────────

#[tauri::command]
pub async fn list_filings(state: State<'_, AppState>) -> Result<Vec<Filing>, String> {
    let guard = state.db.lock().map_err(|e| e.to_string())?;
    let db = guard.as_ref().ok_or("Database not unlocked")?;
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id,taxpayer_id,parent_filing_id,year_of_assessment,status,
                    filing_reference,created_at,confirmed_at,total_income_ngn,
                    chargeable_income,tax_payable,wht_credit,net_tax_payable,
                    minimum_tax,final_tax_payable,tax_config_version
             FROM filing ORDER BY year_of_assessment DESC, created_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let filings = stmt
        .query_map([], row_to_filing)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(filings)
}

#[tauri::command]
pub async fn get_filing(id: String, state: State<'_, AppState>) -> Result<Filing, String> {
    let guard = state.db.lock().map_err(|e| e.to_string())?;
    let db = guard.as_ref().ok_or("Database not unlocked")?;
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id,taxpayer_id,parent_filing_id,year_of_assessment,status,
                filing_reference,created_at,confirmed_at,total_income_ngn,
                chargeable_income,tax_payable,wht_credit,net_tax_payable,
                minimum_tax,final_tax_payable,tax_config_version
         FROM filing WHERE id=?1",
        params![id],
        row_to_filing,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_draft_filing(
    year_of_assessment: i32,
    state: State<'_, AppState>,
) -> Result<Filing, String> {
    let id = Uuid::new_v4();
    let now = Utc::now();
    let _config_version = {
        let guard = state.db.lock().map_err(|e| e.to_string())?;
        let db = guard.as_ref().ok_or("Database not unlocked")?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let taxpayer_id: String = conn
            .query_row("SELECT id FROM taxpayer LIMIT 1", [], |r| r.get(0))
            .map_err(|_| "No profile found. Please create your taxpayer profile first.")?;

        let config = load_active_config(&conn).map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO filing (id,taxpayer_id,year_of_assessment,status,created_at,tax_config_version)
             VALUES (?1,?2,?3,'Draft',?4,?5)",
            params![id.to_string(), taxpayer_id, year_of_assessment, now.to_rfc3339(), config.version_label],
        )
        .map_err(|e| e.to_string())?;
        config.version_label
    };
    persist_db(&state).await?;
    get_filing(id.to_string(), state).await
}

#[tauri::command]
pub async fn confirm_filing(
    id: String,
    result: ComputationResult,
    state: State<'_, AppState>,
) -> Result<Filing, String> {
    let now = Utc::now();
    // Generate a filing reference: LIRS/REF/YYYY/NNNNN
    {
        let guard = state.db.lock().map_err(|e| e.to_string())?;
        let db = guard.as_ref().ok_or("Database not unlocked")?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let yoa: i32 = conn
            .query_row("SELECT year_of_assessment FROM filing WHERE id=?1", params![id], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        let count: i32 = conn
            .query_row("SELECT COUNT(*) FROM filing WHERE status IN ('Confirmed','Submitted')", [], |r| r.get(0))
            .unwrap_or(0);
        let filing_ref = format!("LIRS/REF/{}/{:05}", yoa, count + 1);
        conn.execute(
            "UPDATE filing SET status='Confirmed',confirmed_at=?1,filing_reference=?2,
             total_income_ngn=?3,chargeable_income=?4,net_tax_payable=?5,
             minimum_tax=?6,final_tax_payable=?7,wht_credit=?8
             WHERE id=?9",
            params![
                now.to_rfc3339(), filing_ref,
                result.total_gross_income, result.chargeable_income,
                result.net_tax_payable, result.minimum_tax, result.final_tax_payable,
                result.wht_credits, id,
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    persist_db(&state).await?;
    get_filing(id, state).await
}

#[tauri::command]
pub async fn mark_filing_submitted(id: String, state: State<'_, AppState>) -> Result<Filing, String> {
    {
        let guard = state.db.lock().map_err(|e| e.to_string())?;
        let db = guard.as_ref().ok_or("Database not unlocked")?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("UPDATE filing SET status='Submitted' WHERE id=?1", params![id])
            .map_err(|e| e.to_string())?;
    }
    persist_db(&state).await?;
    get_filing(id, state).await
}

#[tauri::command]
pub async fn duplicate_filing(id: String, state: State<'_, AppState>) -> Result<Filing, String> {
    let new_id = Uuid::new_v4();
    {
        let guard = state.db.lock().map_err(|e| e.to_string())?;
        let db = guard.as_ref().ok_or("Database not unlocked")?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let (taxpayer_id, yoa, config_ver): (String, i32, String) = conn
            .query_row("SELECT taxpayer_id,year_of_assessment,tax_config_version FROM filing WHERE id=?1", params![id], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?))
            })
            .map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO filing (id,taxpayer_id,parent_filing_id,year_of_assessment,status,created_at,tax_config_version)
             VALUES (?1,?2,?3,?4,'Draft',datetime('now'),?5)",
            params![new_id.to_string(), taxpayer_id, id, yoa + 1, config_ver],
        )
        .map_err(|e| e.to_string())?;
        // Duplicate income entries
        conn.execute(
            "INSERT INTO income_entry (id,filing_id,income_type,description,gross_amount_ngn,is_foreign,
             foreign_currency,foreign_amount,income_date,fx_rate_fetched,fx_rate_cbn_override,
             fx_rate_used,fx_rate_source,foreign_tax_paid_ngn,is_cgt_exempt,cgt_proceeds,cgt_gain)
             SELECT hex(randomblob(16)),?1,income_type,description,gross_amount_ngn,is_foreign,
             foreign_currency,foreign_amount,income_date,fx_rate_fetched,fx_rate_cbn_override,
             fx_rate_used,fx_rate_source,foreign_tax_paid_ngn,is_cgt_exempt,cgt_proceeds,cgt_gain
             FROM income_entry WHERE filing_id=?2",
            params![new_id.to_string(), id],
        )
        .map_err(|e| e.to_string())?;
    }
    persist_db(&state).await?;
    get_filing(new_id.to_string(), state).await
}

#[tauri::command]
pub async fn amend_filing(id: String, state: State<'_, AppState>) -> Result<Filing, String> {
    let new_id = Uuid::new_v4();
    {
        let guard = state.db.lock().map_err(|e| e.to_string())?;
        let db = guard.as_ref().ok_or("Database not unlocked")?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let (taxpayer_id, yoa, config_ver): (String, i32, String) = conn
            .query_row("SELECT taxpayer_id,year_of_assessment,tax_config_version FROM filing WHERE id=?1", params![id], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?))
            })
            .map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO filing (id,taxpayer_id,parent_filing_id,year_of_assessment,status,created_at,tax_config_version)
             VALUES (?1,?2,?3,?4,'Draft',datetime('now'),?5)",
            params![new_id.to_string(), taxpayer_id, id, yoa, config_ver],
        )
        .map_err(|e| e.to_string())?;
    }
    persist_db(&state).await?;
    get_filing(new_id.to_string(), state).await
}

// ── Income entries ────────────────────────────────────────────

#[tauri::command]
pub async fn list_income_entries(filing_id: String, state: State<'_, AppState>) -> Result<Vec<IncomeEntry>, String> {
    let guard = state.db.lock().map_err(|e| e.to_string())?;
    let db = guard.as_ref().ok_or("Database not unlocked")?;
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id,filing_id,income_type,description,gross_amount_ngn,is_foreign,
                foreign_currency,foreign_amount,income_date,fx_rate_fetched,
                fx_rate_cbn_override,fx_rate_used,fx_rate_source,foreign_tax_paid_ngn,
                is_cgt_exempt,cgt_proceeds,cgt_gain
         FROM income_entry WHERE filing_id=?1",
    ).map_err(|e| e.to_string())?;
    let entries = stmt.query_map(params![filing_id], |row| {
        Ok(IncomeEntry {
            id: Uuid::parse_str(&row.get::<_, String>(0)?).unwrap_or_else(|_| Uuid::new_v4()),
            filing_id: Uuid::parse_str(&row.get::<_, String>(1)?).unwrap_or_else(|_| Uuid::new_v4()),
            income_type: row.get(2)?,
            description: row.get(3)?,
            gross_amount_ngn: row.get(4)?,
            is_foreign: row.get::<_, i32>(5)? == 1,
            foreign_currency: row.get(6)?,
            foreign_amount: row.get(7)?,
            income_date: row.get::<_, Option<String>>(8)?.and_then(|s| chrono::NaiveDate::parse_from_str(&s, "%Y-%m-%d").ok()),
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
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok()).collect();
    Ok(entries)
}

#[tauri::command]
pub async fn upsert_income_entry(entry: serde_json::Value, state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let id = entry["id"].as_str().unwrap_or(&Uuid::new_v4().to_string()).to_string();
    {
        let guard = state.db.lock().map_err(|e| e.to_string())?;
        let db = guard.as_ref().ok_or("Database not unlocked")?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO income_entry
             (id,filing_id,income_type,description,gross_amount_ngn,is_foreign,
              foreign_currency,foreign_amount,income_date,fx_rate_fetched,
              fx_rate_cbn_override,fx_rate_used,fx_rate_source,foreign_tax_paid_ngn,
              is_cgt_exempt,cgt_proceeds,cgt_gain)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)",
            params![
                id,
                entry["filingId"].as_str().unwrap_or(""),
                entry["incomeType"].as_str().unwrap_or("other"),
                entry["description"].as_str(),
                entry["grossAmountNgn"].as_f64().unwrap_or(0.0),
                entry["isForeign"].as_bool().unwrap_or(false) as i32,
                entry["foreignCurrency"].as_str(),
                entry["foreignAmount"].as_f64(),
                entry["incomeDate"].as_str(),
                entry["fxRateFetched"].as_f64(),
                entry["fxRateCbnOverride"].as_f64(),
                entry["fxRateUsed"].as_f64(),
                entry["fxRateSource"].as_str(),
                entry["foreignTaxPaidNgn"].as_f64(),
                entry["isCgtExempt"].as_bool().unwrap_or(false) as i32,
                entry["cgtProceeds"].as_f64(),
                entry["cgtGain"].as_f64(),
            ],
        ).map_err(|e| e.to_string())?;
    }
    persist_db(&state).await?;
    Ok(serde_json::json!({ "id": id }))
}

#[tauri::command]
pub async fn delete_income_entry(id: String, state: State<'_, AppState>) -> Result<(), String> {
    {
        let guard = state.db.lock().map_err(|e| e.to_string())?;
        let db = guard.as_ref().ok_or("Database not unlocked")?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM income_entry WHERE id=?1", params![id]).map_err(|e| e.to_string())?;
    }
    persist_db(&state).await
}

// ── Capital Allowances ────────────────────────────────────────

#[tauri::command]
pub async fn list_allowances(filing_id: String, state: State<'_, AppState>) -> Result<Vec<CapitalAllowance>, String> {
    let guard = state.db.lock().map_err(|e| e.to_string())?;
    let db = guard.as_ref().ok_or("Database not unlocked")?;
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id,filing_id,asset_description,asset_type,asset_cost,acquisition_date,
                tax_written_down_value,annual_allowance_rate,annual_allowance_amount
         FROM capital_allowance WHERE filing_id=?1"
    ).map_err(|e| e.to_string())?;
    let entries = stmt.query_map(params![filing_id], |row| {
        Ok(CapitalAllowance {
            id: Uuid::parse_str(&row.get::<_, String>(0)?).unwrap_or_else(|_| Uuid::new_v4()),
            filing_id: Uuid::parse_str(&row.get::<_, String>(1)?).unwrap_or_else(|_| Uuid::new_v4()),
            asset_description: row.get(2)?,
            asset_type: row.get(3)?,
            asset_cost: row.get(4)?,
            acquisition_date: chrono::NaiveDate::parse_from_str(&row.get::<_, String>(5)?, "%Y-%m-%d").unwrap_or_default(),
            tax_written_down_value: row.get(6)?,
            annual_allowance_rate: row.get(7)?,
            annual_allowance_amount: row.get(8)?,
            documents: vec![],
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok()).collect();
    Ok(entries)
}

#[tauri::command]
pub async fn upsert_allowance(entry: serde_json::Value, state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let id = entry["id"].as_str().unwrap_or(&Uuid::new_v4().to_string()).to_string();
    {
        let guard = state.db.lock().map_err(|e| e.to_string())?;
        let db = guard.as_ref().ok_or("Database not unlocked")?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO capital_allowance
             (id,filing_id,asset_description,asset_type,asset_cost,acquisition_date,
              tax_written_down_value,annual_allowance_rate,annual_allowance_amount)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
            params![
                id, entry["filingId"].as_str().unwrap_or(""),
                entry["assetDescription"].as_str().unwrap_or(""),
                entry["assetType"].as_str().unwrap_or("other"),
                entry["assetCost"].as_f64().unwrap_or(0.0),
                entry["acquisitionDate"].as_str().unwrap_or(""),
                entry["taxWrittenDownValue"].as_f64().unwrap_or(0.0),
                entry["annualAllowanceRate"].as_f64().unwrap_or(0.0),
                entry["annualAllowanceAmount"].as_f64().unwrap_or(0.0),
            ],
        ).map_err(|e| e.to_string())?;
    }
    persist_db(&state).await?;
    Ok(serde_json::json!({ "id": id }))
}

#[tauri::command]
pub async fn delete_allowance(id: String, state: State<'_, AppState>) -> Result<(), String> {
    {
        let guard = state.db.lock().map_err(|e| e.to_string())?;
        let db = guard.as_ref().ok_or("Database not unlocked")?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM capital_allowance WHERE id=?1", params![id]).map_err(|e| e.to_string())?;
    }
    persist_db(&state).await
}

// ── Relief entries ────────────────────────────────────────────

#[tauri::command]
pub async fn list_relief_entries(filing_id: String, state: State<'_, AppState>) -> Result<Vec<ReliefEntry>, String> {
    let guard = state.db.lock().map_err(|e| e.to_string())?;
    let db = guard.as_ref().ok_or("Database not unlocked")?;
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id,filing_id,relief_type,claimed_amount,approved_amount,wht_ref,wht_income_type,wht_date
         FROM relief_entry WHERE filing_id=?1"
    ).map_err(|e| e.to_string())?;
    let entries = stmt.query_map(params![filing_id], |row| {
        Ok(ReliefEntry {
            id: Uuid::parse_str(&row.get::<_, String>(0)?).unwrap_or_else(|_| Uuid::new_v4()),
            filing_id: Uuid::parse_str(&row.get::<_, String>(1)?).unwrap_or_else(|_| Uuid::new_v4()),
            relief_type: row.get(2)?,
            claimed_amount: row.get(3)?,
            approved_amount: row.get(4)?,
            wht_ref: row.get(5)?,
            wht_income_type: row.get(6)?,
            wht_date: row.get::<_, Option<String>>(7)?.and_then(|s| chrono::NaiveDate::parse_from_str(&s, "%Y-%m-%d").ok()),
            documents: vec![],
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok()).collect();
    Ok(entries)
}

#[tauri::command]
pub async fn upsert_relief_entry(entry: serde_json::Value, state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let id = entry["id"].as_str().unwrap_or(&Uuid::new_v4().to_string()).to_string();
    {
        let guard = state.db.lock().map_err(|e| e.to_string())?;
        let db = guard.as_ref().ok_or("Database not unlocked")?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO relief_entry
             (id,filing_id,relief_type,claimed_amount,approved_amount,wht_ref,wht_income_type,wht_date)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            params![
                id, entry["filingId"].as_str().unwrap_or(""),
                entry["reliefType"].as_str().unwrap_or("other_approved"),
                entry["claimedAmount"].as_f64().unwrap_or(0.0),
                entry["approvedAmount"].as_f64().unwrap_or(0.0),
                entry["whtRef"].as_str(),
                entry["whtIncomeType"].as_str(),
                entry["whtDate"].as_str(),
            ],
        ).map_err(|e| e.to_string())?;
    }
    persist_db(&state).await?;
    Ok(serde_json::json!({ "id": id }))
}

#[tauri::command]
pub async fn delete_relief_entry(id: String, state: State<'_, AppState>) -> Result<(), String> {
    {
        let guard = state.db.lock().map_err(|e| e.to_string())?;
        let db = guard.as_ref().ok_or("Database not unlocked")?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM relief_entry WHERE id=?1", params![id]).map_err(|e| e.to_string())?;
    }
    persist_db(&state).await
}

// ── Computation ───────────────────────────────────────────────

#[tauri::command]
pub async fn compute_filing(filing_id: String, state: State<'_, AppState>) -> Result<ComputationResult, String> {
    let guard = state.db.lock().map_err(|e| e.to_string())?;
    let db = guard.as_ref().ok_or("Database not unlocked")?;
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let config = load_active_config(&conn).map_err(|e| e.to_string())?;

    let mut ie_stmt = conn.prepare(
        "SELECT id,filing_id,income_type,description,gross_amount_ngn,is_foreign,
                foreign_currency,foreign_amount,income_date,fx_rate_fetched,
                fx_rate_cbn_override,fx_rate_used,fx_rate_source,foreign_tax_paid_ngn,
                is_cgt_exempt,cgt_proceeds,cgt_gain
         FROM income_entry WHERE filing_id=?1"
    ).map_err(|e| e.to_string())?;
    let income_entries: Vec<IncomeEntry> = ie_stmt.query_map(params![filing_id], |row| {
        Ok(IncomeEntry {
            id: Uuid::parse_str(&row.get::<_, String>(0)?).unwrap_or_else(|_| Uuid::new_v4()),
            filing_id: Uuid::parse_str(&row.get::<_, String>(1)?).unwrap_or_else(|_| Uuid::new_v4()),
            income_type: row.get(2)?, description: row.get(3)?,
            gross_amount_ngn: row.get(4)?,
            is_foreign: row.get::<_, i32>(5)? == 1,
            foreign_currency: row.get(6)?, foreign_amount: row.get(7)?,
            income_date: row.get::<_, Option<String>>(8)?.and_then(|s| chrono::NaiveDate::parse_from_str(&s, "%Y-%m-%d").ok()),
            fx_rate_fetched: row.get(9)?, fx_rate_cbn_override: row.get(10)?,
            fx_rate_used: row.get(11)?, fx_rate_source: row.get(12)?,
            foreign_tax_paid_ngn: row.get(13)?,
            is_cgt_exempt: row.get::<_, i32>(14)? == 1,
            cgt_proceeds: row.get(15)?, cgt_gain: row.get(16)?,
            documents: vec![],
        })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    let mut ca_stmt = conn.prepare(
        "SELECT id,filing_id,asset_description,asset_type,asset_cost,acquisition_date,
                tax_written_down_value,annual_allowance_rate,annual_allowance_amount
         FROM capital_allowance WHERE filing_id=?1"
    ).map_err(|e| e.to_string())?;
    let allowances: Vec<CapitalAllowance> = ca_stmt.query_map(params![filing_id], |row| {
        Ok(CapitalAllowance {
            id: Uuid::parse_str(&row.get::<_, String>(0)?).unwrap_or_else(|_| Uuid::new_v4()),
            filing_id: Uuid::parse_str(&row.get::<_, String>(1)?).unwrap_or_else(|_| Uuid::new_v4()),
            asset_description: row.get(2)?, asset_type: row.get(3)?,
            asset_cost: row.get(4)?,
            acquisition_date: chrono::NaiveDate::parse_from_str(&row.get::<_, String>(5)?, "%Y-%m-%d").unwrap_or_default(),
            tax_written_down_value: row.get(6)?, annual_allowance_rate: row.get(7)?,
            annual_allowance_amount: row.get(8)?, documents: vec![],
        })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    let mut re_stmt = conn.prepare(
        "SELECT id,filing_id,relief_type,claimed_amount,approved_amount,wht_ref,wht_income_type,wht_date
         FROM relief_entry WHERE filing_id=?1"
    ).map_err(|e| e.to_string())?;
    let reliefs: Vec<ReliefEntry> = re_stmt.query_map(params![filing_id], |row| {
        Ok(ReliefEntry {
            id: Uuid::parse_str(&row.get::<_, String>(0)?).unwrap_or_else(|_| Uuid::new_v4()),
            filing_id: Uuid::parse_str(&row.get::<_, String>(1)?).unwrap_or_else(|_| Uuid::new_v4()),
            relief_type: row.get(2)?, claimed_amount: row.get(3)?,
            approved_amount: row.get(4)?, wht_ref: row.get(5)?,
            wht_income_type: row.get(6)?,
            wht_date: row.get::<_, Option<String>>(7)?.and_then(|s| chrono::NaiveDate::parse_from_str(&s, "%Y-%m-%d").ok()),
            documents: vec![],
        })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    ComputationEngine::compute(&income_entries, &allowances, &reliefs, &config)
        .map_err(|e| e.to_string())
}
