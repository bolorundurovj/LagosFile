use crate::{commands::auth::persist_db, AppState};
use chrono::Utc;
use rusqlite::params;
use tauri::State;
use uuid::Uuid;

const MAX_FILE_BYTES: i64 = 100 * 1024 * 1024; // 100 MB

/// Copy the source file into ~/LagosFile/documents/<parent_entry_id>/
/// and return the destination path.
fn copy_to_store(
    source_path: &str,
    parent_entry_id: &str,
    file_name: &str,
) -> Result<std::path::PathBuf, String> {
    if source_path.is_empty() {
        return Err("No file path provided — drag-and-drop is not yet supported. Please use the file picker.".to_string());
    }
    let src = std::path::Path::new(source_path);
    if !src.exists() {
        return Err(format!("Source file not found: {}", source_path));
    }

    let home = dirs::home_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    let dest_dir = home
        .join("LagosFile")
        .join("documents")
        .join(parent_entry_id);
    std::fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;

    // Prefix with UUID so duplicate filenames never collide
    let safe_name = format!("{}_{}", Uuid::new_v4(), file_name);
    let dest = dest_dir.join(&safe_name);
    std::fs::copy(src, &dest).map_err(|e| e.to_string())?;
    Ok(dest)
}

#[tauri::command]
pub async fn attach_document(
    parent_entry_id: String,
    parent_entry_type: String,
    file_path: String,       // original path selected by the user
    file_name: String,
    file_type: String,
    file_size_bytes: i64,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    if file_size_bytes > MAX_FILE_BYTES {
        return Err("File exceeds the 100MB limit. Please attach a smaller file.".to_string());
    }

    // Copy the file into the LagosFile document store so it is safe even if the
    // original is moved or deleted.
    let stored_path = copy_to_store(&file_path, &parent_entry_id, &file_name)?;
    let stored_path_str = stored_path.to_string_lossy().to_string();

    // Get the actual size from the copied file (the Angular side may have sent 0
    // for files opened via the native dialog, which doesn't provide size).
    let actual_size = std::fs::metadata(&stored_path)
        .map(|m| m.len() as i64)
        .unwrap_or(file_size_bytes);

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
                stored_path_str, file_name, file_type, actual_size, now.to_rfc3339(),
            ],
        ).map_err(|e| e.to_string())?;
    }
    persist_db(&state).await?;
    Ok(serde_json::json!({
        "id": id.to_string(),
        "fileName": file_name,
        "filePath": stored_path_str,
        "fileSizeBytes": actual_size,
    }))
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
    // Fetch the stored path before deleting the record so we can remove the file too.
    let stored_path: Option<String> = {
        let guard = state.db.lock().map_err(|e| e.to_string())?;
        let db = guard.as_ref().ok_or("Database not unlocked")?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT file_path FROM document WHERE id=?1",
            params![id],
            |r| r.get(0),
        ).ok()
    };

    {
        let guard = state.db.lock().map_err(|e| e.to_string())?;
        let db = guard.as_ref().ok_or("Database not unlocked")?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM document WHERE id=?1", params![id])
            .map_err(|e| e.to_string())?;
    }
    persist_db(&state).await?;

    // Best-effort: remove the stored file from disk.
    if let Some(path) = stored_path {
        let _ = std::fs::remove_file(path);
    }
    Ok(())
}
