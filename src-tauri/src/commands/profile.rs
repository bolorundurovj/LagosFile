use crate::{
    commands::auth::persist_db, models::Taxpayer, services::profile::ProfileService, AppState,
};
use rusqlite::params;
use tauri::State;

#[tauri::command]
pub async fn create_profile(
    profile: serde_json::Value,
    state: State<'_, AppState>,
) -> Result<Taxpayer, String> {
    let taxpayer = {
        let guard = state.db.lock().map_err(|e| e.to_string())?;
        let db = guard.as_ref().ok_or("Database not unlocked")?;
        ProfileService::create(db, profile).map_err(|e| e.to_string())?
    };
    persist_db(&state).await?;
    Ok(taxpayer)
}

#[tauri::command]
pub async fn get_profile(state: State<'_, AppState>) -> Result<Option<Taxpayer>, String> {
    let guard = state.db.lock().map_err(|e| e.to_string())?;
    let db = guard.as_ref().ok_or("Database not unlocked")?;
    ProfileService::get(db).map_err(|e| e.to_string())
}

pub fn update_profile_with_conn(
    conn: &rusqlite::Connection,
    profile: &serde_json::Value,
) -> Result<Taxpayer, String> {
    let target_id: String = match profile["id"].as_str().filter(|s| !s.is_empty()) {
        Some(id) => id.to_string(),
        None => conn
            .query_row("SELECT id FROM taxpayer LIMIT 1", [], |r| r.get(0))
            .map_err(|_| "Taxpayer profile not found.".to_string())?,
    };
    let existing_tin: String = conn
        .query_row(
            "SELECT tin FROM taxpayer WHERE id=?1",
            params![target_id],
            |r| r.get(0),
        )
        .map_err(|_| "Taxpayer profile not found.".to_string())?;
    let tin = profile["tin"]
        .as_str()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or(&existing_tin);

    conn.execute(
        "UPDATE taxpayer SET full_name=?1,tin=?2,address=?3,phone=?4,email=?5,filing_agent=?6 WHERE id=?7",
        params![
            profile["fullName"].as_str().unwrap_or(""),
            tin,
            profile["address"].as_str(),
            profile["phone"].as_str(),
            profile["email"].as_str(),
            profile["filingAgent"].as_str(),
            target_id,
        ],
    )
    .map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT id,full_name,tin,address,phone,email,filing_agent,created_at FROM taxpayer WHERE id=?1",
        params![target_id],
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
                    .map(|d| d.with_timezone(&chrono::Utc))
                    .unwrap_or_else(|_| chrono::Utc::now()),
            })
        },
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_profile(
    profile: serde_json::Value,
    state: State<'_, AppState>,
) -> Result<Taxpayer, String> {
    let updated = {
        let guard = state.db.lock().map_err(|e| e.to_string())?;
        let db = guard.as_ref().ok_or("Database not unlocked")?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        update_profile_with_conn(&conn, &profile)?
    };
    persist_db(&state).await?;
    Ok(updated)
}
