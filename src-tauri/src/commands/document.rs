use crate::{
    commands::auth::{persist_db, persist_db_in_dir},
    db::{self, doc_store},
    AppState,
};
use chrono::Utc;
use rusqlite::params;
use std::path::Path;
use tauri::State;
use uuid::Uuid;

const MAX_FILE_BYTES: i64 = 100 * 1024 * 1024; // 100 MB

fn validate_and_build_doc_dest(
    dir: &Path,
    parent_entry_id: &str,
    file_name: &str,
) -> Result<(String, String, std::path::PathBuf), String> {
    let safe_parent = doc_store::sanitize_file_name(parent_entry_id);
    let safe_display_name = doc_store::sanitize_file_name(file_name);
    let safe_disk_name = format!("{}_{}.enc", Uuid::new_v4(), safe_display_name);
    let rel_path = format!("documents/{}/{}", safe_parent, safe_disk_name);
    let validated = doc_store::validate_safe_rel_doc_path(&rel_path)?;
    Ok((safe_display_name, rel_path, dir.join(validated)))
}

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

    let doc_key = {
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
        let (key, _created) = doc_store::get_or_create_doc_key(db)?;
        key
    };

    let plaintext = std::fs::read(src).map_err(|e| e.to_string())?;
    let actual_size = plaintext.len() as i64;

    // Store encrypted file under <dir>/documents/<safe_parent_id>/<uuid>_<sanitized_file_name>.enc
    let (safe_display_name, rel_path, dest) =
        validate_and_build_doc_dest(dir, parent_entry_id, file_name)?;
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
                safe_display_name,
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
        "fileName": safe_display_name,
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
    if file_size_bytes > MAX_FILE_BYTES {
        return Err("File exceeds the 100MB limit. Please attach a smaller file.".to_string());
    }
    if file_path.is_empty() {
        return Err("No file path provided. Please use the file picker.".to_string());
    }
    db::ensure_dirs().map_err(|e| e.to_string())?;
    let dir = db::app_dir();

    let doc_key = {
        let guard = state.db.lock().map_err(|e| e.to_string())?;
        let db = guard.as_ref().ok_or("Database not unlocked")?;
        {
            let conn = db.conn.lock().map_err(|e| e.to_string())?;
            crate::commands::filing::require_draft_for_parent_entry(
                &conn,
                &parent_entry_id,
                &parent_entry_type,
            )?;
        }
        let (key, _created) = doc_store::get_or_create_doc_key(db)?;
        key
    };

    let (safe_display_name, rel_path, dest) =
        validate_and_build_doc_dest(&dir, &parent_entry_id, &file_name)?;
    let source_path = file_path.clone();
    let dest_for_worker = dest.clone();
    let actual_size = tokio::task::spawn_blocking(move || -> Result<i64, String> {
        let src = Path::new(&source_path);
        if !src.exists() {
            return Err(format!("Source file not found: {}", source_path));
        }
        let meta_size = std::fs::metadata(src).map_err(|e| e.to_string())?.len();
        if meta_size > MAX_FILE_BYTES as u64 {
            return Err("File exceeds the 100MB limit. Please attach a smaller file.".to_string());
        }
        let plaintext = std::fs::read(src).map_err(|e| e.to_string())?;
        let size = plaintext.len() as i64;
        doc_store::write_encrypted_doc_atomic(&dest_for_worker, &plaintext, &doc_key)?;
        Ok(size)
    })
    .await
    .map_err(|e| e.to_string())??;

    let id = Uuid::new_v4();
    let now = Utc::now();
    let insert_res: Result<(), String> = (|| {
        let guard = state.db.lock().map_err(|e| e.to_string())?;
        let db = guard.as_ref().ok_or("Database not unlocked")?;
        // Re-verify Draft status and matching document key after spawn_blocking to close TOCTOU window.
        let current_key = doc_store::get_doc_key(db)?;
        if current_key != Some(doc_key) {
            return Err("Vault changed while encrypting attachment; please retry.".to_string());
        }
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        crate::commands::filing::require_draft_for_parent_entry(
            &conn,
            &parent_entry_id,
            &parent_entry_type,
        )?;
        conn.execute(
            "INSERT INTO document
             (id,parent_entry_id,parent_entry_type,file_path,file_name,file_type,file_size_bytes,uploaded_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            params![
                id.to_string(),
                parent_entry_id,
                parent_entry_type,
                rel_path,
                safe_display_name,
                file_type,
                actual_size,
                now.to_rfc3339(),
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })();

    if let Err(e) = insert_res {
        let _ = std::fs::remove_file(&dest);
        return Err(e);
    }

    if let Err(e) = persist_db(&state).await {
        // Best-effort rollback of row & file if persist fails.
        // Only remove `dest` if the in-memory DELETE actually removed the row; if `lock_db`
        // ran concurrently and already persisted the new row to disk, `state.db` is None and
        // `dest` must stay on disk so the persisted row does not point to a missing file.
        let mut row_deleted = false;
        if let Ok(guard) = state.db.lock() {
            if let Some(db) = guard.as_ref() {
                if let Ok(conn) = db.conn.lock() {
                    if let Ok(n) =
                        conn.execute("DELETE FROM document WHERE id=?1", params![id.to_string()])
                    {
                        row_deleted = n > 0;
                    }
                }
            }
        }
        if row_deleted {
            let _ = std::fs::remove_file(&dest);
        }
        return Err(e);
    }

    Ok(serde_json::json!({
        "id": id.to_string(),
        "fileName": safe_display_name,
        "filePath": rel_path,
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
            crate::commands::filing::require_draft_for_parent_entry(&tx, parent_id, parent_type)?;
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
    let dir = db::app_dir();
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
            crate::commands::filing::require_draft_for_parent_entry(&tx, parent_id, parent_type)?;
        }
        tx.execute("DELETE FROM document WHERE id=?1", params![id])
            .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        doc_meta.map(|(p, _, _)| p)
    };
    persist_db(&state).await?;

    if let Some(path) = candidate_path {
        let guard = state.db.lock().map_err(|e| e.to_string())?;
        if let Some(db) = guard.as_ref() {
            let conn = db.conn.lock().map_err(|e| e.to_string())?;
            doc_store::remove_unreferenced_doc_files(&dir, &conn, &[path]);
        }
    }
    Ok(())
}
