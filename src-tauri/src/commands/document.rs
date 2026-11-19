use crate::{
    commands::auth::persist_db_in_dir,
    db::{self, doc_store},
    AppState,
};
use chrono::Utc;
use rusqlite::params;
use std::path::Path;
use tauri::State;
use uuid::Uuid;

const MAX_FILE_BYTES: i64 = 100 * 1024 * 1024; // 100 MB

#[allow(clippy::too_many_arguments)]
pub fn attach_document_in_dir(
    dir: &Path,
    parent_entry_id: &str,
    parent_entry_type: &str,
    source_path: &str,
    file_name: &str,
    file_type: &str,
    file_size_bytes: i64,
    state: &AppState,
) -> Result<serde_json::Value, String> {
    if file_size_bytes > MAX_FILE_BYTES {
        return Err("File exceeds the 100MB limit. Please attach a smaller file.".to_string());
    }
    if source_path.is_empty() {
        return Err("No file path provided. Please use the file picker.".to_string());
    }
    let src = Path::new(source_path);
    if !src.exists() {
        return Err(format!("Source file not found: {}", source_path));
    }
    let meta_size = std::fs::metadata(src).map_err(|e| e.to_string())?.len();
    if meta_size > MAX_FILE_BYTES as u64 {
        return Err("File exceeds the 100MB limit. Please attach a smaller file.".to_string());
    }

    let (doc_key, plaintext, actual_size) = {
        let guard = state.db.lock().map_err(|e| e.to_string())?;
        let db = guard.as_ref().ok_or("Database not unlocked")?;
        {
            let conn = db.conn.lock().map_err(|e| e.to_string())?;
            crate::commands::filing::require_draft_for_parent_entry(
                &conn,
                parent_entry_id,
                parent_entry_type,
            )?;
        }
        let plaintext = std::fs::read(src).map_err(|e| e.to_string())?;
        let actual_size = plaintext.len() as i64;
        let (key, _created) = doc_store::get_or_create_doc_key(db)?;
        (key, plaintext, actual_size)
    };

    // Store encrypted file under <dir>/documents/<parent_entry_id>/<uuid>_<file_name>.enc
    let safe_name = format!("{}_{}.enc", Uuid::new_v4(), file_name);
    let rel_path = format!("documents/{}/{}", parent_entry_id, safe_name);
    let dest = dir.join(&rel_path);
    doc_store::write_encrypted_doc_atomic(&dest, &plaintext, &doc_key)?;

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
                id.to_string(),
                parent_entry_id,
                parent_entry_type,
                rel_path,
                file_name,
                file_type,
                actual_size,
                now.to_rfc3339(),
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    persist_db_in_dir(dir, state)?;

    Ok(serde_json::json!({
        "id": id.to_string(),
        "fileName": file_name,
        "filePath": rel_path,
        "fileSizeBytes": actual_size,
    }))
}

#[tauri::command]
pub async fn attach_document(
    parent_entry_id: String,
    parent_entry_type: String,
    file_path: String, // original path selected by the user
    file_name: String,
    file_type: String,
    file_size_bytes: i64,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    db::ensure_dirs().map_err(|e| e.to_string())?;
    attach_document_in_dir(
        &db::app_dir(),
        &parent_entry_id,
        &parent_entry_type,
        &file_path,
        &file_name,
        &file_type,
        file_size_bytes,
        &state,
    )
}

#[tauri::command]
pub async fn list_documents(
    parent_entry_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let guard = state.db.lock().map_err(|e| e.to_string())?;
    let db = guard.as_ref().ok_or("Database not unlocked")?;
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id,parent_entry_id,parent_entry_type,file_path,file_name,file_type,file_size_bytes,uploaded_at
             FROM document WHERE parent_entry_id=?1",
        )
        .map_err(|e| e.to_string())?;
    let docs = stmt
        .query_map(params![parent_entry_id], |row| {
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
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(docs)
}

pub fn delete_document_in_dir(dir: &Path, id: &str, state: &AppState) -> Result<(), String> {
    let candidate_path: Option<String> = {
        let guard = state.db.lock().map_err(|e| e.to_string())?;
        let db = guard.as_ref().ok_or("Database not unlocked")?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

        let doc_meta: Option<(String, String, String)> = tx
            .query_row(
                "SELECT file_path, parent_entry_id, parent_entry_type FROM document WHERE id=?1",
                params![id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .ok();

        if let Some((_, ref parent_id, ref parent_type)) = doc_meta {
            crate::commands::filing::require_draft_for_parent_entry(
                &tx,
                parent_id,
                parent_type,
            )?;
        }
        tx.execute("DELETE FROM document WHERE id=?1", params![id])
            .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        doc_meta.map(|(p, _, _)| p)
    };
    persist_db_in_dir(dir, state)?;

    if let Some(path) = candidate_path {
        let guard = state.db.lock().map_err(|e| e.to_string())?;
        if let Some(db) = guard.as_ref() {
            let conn = db.conn.lock().map_err(|e| e.to_string())?;
            doc_store::remove_unreferenced_doc_files(dir, &conn, &[path]);
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn delete_document(id: String, state: State<'_, AppState>) -> Result<(), String> {
    delete_document_in_dir(&db::app_dir(), &id, &state)
}
