use crate::{commands::auth::persist_db, models::*, AppState};
use chrono::Utc;
use rusqlite::params;
use tauri::State;
use uuid::Uuid;

fn row_to_config(row: &rusqlite::Row<'_>) -> rusqlite::Result<TaxConfig> {
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
}

#[tauri::command]
pub async fn get_active_config(state: State<'_, AppState>) -> Result<TaxConfig, String> {
    let guard = state.db.lock().map_err(|e| e.to_string())?;
    let db = guard.as_ref().ok_or("Database not unlocked")?;
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id,version_label,governed_by,bands_json,relief_caps_json,
                cgt_thresholds_json,allowance_rates_json,minimum_tax_rate,
                is_active,last_modified,modified_by
         FROM tax_config WHERE is_active=1 LIMIT 1",
        [],
        row_to_config,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_configs(state: State<'_, AppState>) -> Result<Vec<TaxConfig>, String> {
    let guard = state.db.lock().map_err(|e| e.to_string())?;
    let db = guard.as_ref().ok_or("Database not unlocked")?;
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id,version_label,governed_by,bands_json,relief_caps_json,
                cgt_thresholds_json,allowance_rates_json,minimum_tax_rate,
                is_active,last_modified,modified_by
         FROM tax_config ORDER BY last_modified DESC",
        )
        .map_err(|e| e.to_string())?;
    let configs = stmt
        .query_map([], row_to_config)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(configs)
}

#[tauri::command]
pub async fn save_config(
    config: serde_json::Value,
    state: State<'_, AppState>,
) -> Result<TaxConfig, String> {
    let id = Uuid::new_v4();
    let now = Utc::now();
    {
        let guard = state.db.lock().map_err(|e| e.to_string())?;
        let db = guard.as_ref().ok_or("Database not unlocked")?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        // Deactivate all existing configs
        conn.execute("UPDATE tax_config SET is_active=0", [])
            .map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO tax_config
             (id,version_label,governed_by,bands_json,relief_caps_json,
              cgt_thresholds_json,allowance_rates_json,minimum_tax_rate,
              is_active,last_modified,modified_by)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,1,?9,'user')",
            params![
                id.to_string(),
                config["versionLabel"].as_str().unwrap_or("Tax Config"),
                config["governedBy"].as_str().unwrap_or("NTA 2025"),
                config["bands"].to_string(),
                config["reliefCaps"].to_string(),
                config["cgtThresholds"].to_string(),
                config["allowanceRates"].to_string(),
                config["minimumTaxRate"].as_f64().unwrap_or(0.01),
                now.to_rfc3339(),
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    persist_db(&state).await?;
    get_active_config(state).await
}

#[tauri::command]
pub async fn export_config_json(id: String, state: State<'_, AppState>) -> Result<String, String> {
    let guard = state.db.lock().map_err(|e| e.to_string())?;
    let db = guard.as_ref().ok_or("Database not unlocked")?;
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let cfg = conn
        .query_row(
            "SELECT id,version_label,governed_by,bands_json,relief_caps_json,
                cgt_thresholds_json,allowance_rates_json,minimum_tax_rate,
                is_active,last_modified,modified_by
         FROM tax_config WHERE id=?1",
            params![id],
            row_to_config,
        )
        .map_err(|e| e.to_string())?;
    serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_config_json(
    json: String,
    state: State<'_, AppState>,
) -> Result<TaxConfig, String> {
    // Validate structure
    let _: TaxConfig =
        serde_json::from_str(&json).map_err(|e| format!("Invalid config JSON: {}", e))?;
    let value: serde_json::Value = serde_json::from_str(&json).unwrap();
    save_config(value, state).await
}
