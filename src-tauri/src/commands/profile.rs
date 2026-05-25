use crate::{commands::auth::persist_db, models::Taxpayer, AppState};
use chrono::Utc;
use rusqlite::params;
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub async fn create_profile(
    profile: serde_json::Value,
    state: State<'_, AppState>,
) -> Result<Taxpayer, String> {
    let id = Uuid::new_v4();
    let now = Utc::now();
    let taxpayer = Taxpayer {
        id,
        full_name: profile["fullName"].as_str().unwrap_or("").to_string(),
        tin: profile["tin"].as_str().unwrap_or("").to_string(),
        address: profile["address"].as_str().map(String::from),
        phone: profile["phone"].as_str().map(String::from),
        email: profile["email"].as_str().map(String::from),
        filing_agent: profile["filingAgent"].as_str().map(String::from),
        created_at: now,
    };

    {
        let guard = state.db.lock().map_err(|e| e.to_string())?;
        let db = guard.as_ref().ok_or("Database not unlocked")?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO taxpayer (id, full_name, tin, address, phone, email, filing_agent, created_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            params![
                taxpayer.id.to_string(), taxpayer.full_name, taxpayer.tin,
                taxpayer.address, taxpayer.phone, taxpayer.email,
                taxpayer.filing_agent, taxpayer.created_at.to_rfc3339(),
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    persist_db(&state).await?;
    Ok(taxpayer)
}

#[tauri::command]
pub async fn get_profile(state: State<'_, AppState>) -> Result<Option<Taxpayer>, String> {
    let guard = state.db.lock().map_err(|e| e.to_string())?;
    let db = guard.as_ref().ok_or("Database not unlocked")?;
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    Ok(conn
        .query_row(
            "SELECT id,full_name,tin,address,phone,email,filing_agent,created_at
             FROM taxpayer LIMIT 1",
            [],
            |row| {
                Ok(Taxpayer {
                    id: uuid::Uuid::parse_str(&row.get::<_, String>(0)?)
                        .unwrap_or_else(|_| uuid::Uuid::new_v4()),
                    full_name: row.get(1)?,
                    tin: row.get(2)?,
                    address: row.get(3)?,
                    phone: row.get(4)?,
                    email: row.get(5)?,
                    filing_agent: row.get(6)?,
                    created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(7)?)
                        .unwrap_or_else(|_| chrono::DateTime::parse_from_rfc3339("2026-01-01T00:00:00Z").unwrap())
                        .with_timezone(&chrono::Utc),
                })
            },
        )
        .ok())
}

#[tauri::command]
pub async fn update_profile(
    profile: serde_json::Value,
    state: State<'_, AppState>,
) -> Result<Taxpayer, String> {
    {
        let guard = state.db.lock().map_err(|e| e.to_string())?;
        let db = guard.as_ref().ok_or("Database not unlocked")?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE taxpayer SET full_name=?1,address=?2,phone=?3,email=?4,filing_agent=?5",
            params![
                profile["fullName"].as_str().unwrap_or(""),
                profile["address"].as_str(),
                profile["phone"].as_str(),
                profile["email"].as_str(),
                profile["filingAgent"].as_str(),
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    persist_db(&state).await?;
    get_profile(state).await.map(|o| o.unwrap())
}
