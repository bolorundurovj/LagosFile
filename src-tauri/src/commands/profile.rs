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
