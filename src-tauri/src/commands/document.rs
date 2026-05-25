use crate::{commands::auth::persist_db, AppState};
use chrono::Utc;
use rusqlite::params;
use tauri::State;
use uuid::Uuid;

const MAX_FILE_BYTES: i64 = 100 * 1024 * 1024; // 100 MB

#[tauri::command]
pub async fn attach_document(
    parent_entry_id: String,
    parent_entry_type: String,
    file_path: String,
    file_name: String,
    file_type: String,
    file_size_bytes: i64,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    if file_size_bytes > MAX_FILE_BYTES {
        return Err("File exceeds the 100MB limit. Please attach a smaller file.".to_string());
    }
    let id = Uuid::new_v4();
    let now = Utc::now();
    {
        let guard = state.db.lock().map_err(|e| e.to_string())?;
        let db = guard.as_ref().ok_or("Database not unlocked")?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO document
             (id,parent_entry_id,parent_entry_type,file_path,file_name,file_type,file_size_bytes,uploaded_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            params![
                id.to_string(), parent_entry_id, parent_entry_type,
                file_path, file_name, file_type, file_size_bytes, now.to_rfc3339(),
            ],
        ).map_err(|e| e.to_string())?;
    }
    persist_db(&state).await?;
    Ok(serde_json::json!({ "id": id.to_string(), "fileName": file_name, "fileSizeBytes": file_size_bytes }))
}

#[tauri::command]
pub async fn list_documents(
    parent_entry_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let guard = state.db.lock().map_err(|e| e.to_string())?;
    let db = guard.as_ref().ok_or("Database not unlocked")?;
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id,parent_entry_id,parent_entry_type,file_path,file_name,file_type,file_size_bytes,uploaded_at
         FROM document WHERE parent_entry_id=?1"
    ).map_err(|e| e.to_string())?;
    let docs = stmt.query_map(params![parent_entry_id], |row| {
        Ok(serde_json::json!({
            "id": row.get::<_,String>(0)?,
            "parentEntryId": row.get::<_,String>(1)?,
            "parentEntryType": row.get::<_,String>(2)?,
            "filePath": row.get::<_,String>(3)?,
            "fileName": row.get::<_,String>(4)?,
            "fileType": row.get::<_,String>(5)?,
            "fileSizeBytes": row.get::<_,i64>(6)?,
            "uploadedAt": row.get::<_,String>(7)?,
        }))
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok()).collect();
    Ok(docs)
}

#[tauri::command]
pub async fn delete_document(id: String, state: State<'_, AppState>) -> Result<(), String> {
    {
        let guard = state.db.lock().map_err(|e| e.to_string())?;
        let db = guard.as_ref().ok_or("Database not unlocked")?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM document WHERE id=?1", params![id]).map_err(|e| e.to_string())?;
    }
    persist_db(&state).await
}
