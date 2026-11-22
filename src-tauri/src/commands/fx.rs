use crate::{
    commands::auth::{persist_db, persist_db_in_dir, persist_db_in_dir_async},
    db,
    models::{FxCacheEntry, FxResult},
    services::fx::{FxFetcher, FxService, LiveFxFetcher},
    AppState,
};
use chrono::Utc;
use std::path::Path;
use tauri::State;
use uuid::Uuid;

pub async fn resolve_fx_rate_in_dir(
    dir: &Path,
    base: &str,
    quote: &str,
    target_date: &str,
    state: &AppState,
    fetcher: &dyn FxFetcher,
) -> Result<FxResult, String> {
    let date = FxService::parse_target_date(target_date)?;
    let base_norm = base.trim().to_uppercase();
    let quote_norm = quote.trim().to_uppercase();

    // 1. Check cache synchronously — acquire lock, read, drop lock before any await.
    let (exact_hit, offline_fallback) = {
        let guard = state.db.lock().map_err(|e| e.to_string())?;
        let db = guard.as_ref().ok_or("Database not unlocked")?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let exact = FxService::check_cache_for_date(&conn, &base_norm, &quote_norm, date);
        let fallback = if exact.is_none() {
            FxService::check_cache(&conn, &base_norm, &quote_norm)
        } else {
            None
        };
        (exact, fallback)
        // guard + conn dropped here
    };

    // Exact date cache hit -> return immediately with zero network calls.
    if let Some(hit) = exact_hit {
        return Ok(hit);
    }

    // 2. Network waterfall — no MutexGuard held across the await points.
    let result = FxService::resolve_from_network_with_fetcher(
        &base_norm,
        &quote_norm,
        date,
        offline_fallback,
        fetcher,
    )
    .await;

    // 3. Persist live rate to cache under the date the rate is actually for, then save vault.
    let mut wrote_cache = false;
    if let Some(rate) = result.rate {
        if !result.is_cached {
            let guard = state.db.lock().map_err(|e| e.to_string())?;
            if let Some(db) = guard.as_ref() {
                let conn = db.conn.lock().map_err(|e| e.to_string())?;
                FxService::cache_rate(
                    &conn,
                    &base_norm,
                    &quote_norm,
                    rate,
                    &result.source,
                    result.rate_date,
                )
                .map_err(|e| e.to_string())?;
                wrote_cache = true;
            }
        }
    }
    if wrote_cache {
        persist_db_in_dir_async(dir.to_path_buf(), state).await?;
    }

    Ok(result)
}

#[tauri::command]
pub async fn resolve_fx_rate(
    base: String,
    quote: String,
    target_date: String,
    state: State<'_, AppState>,
) -> Result<FxResult, String> {
    let fetcher = LiveFxFetcher::new().map_err(|e| e.to_string())?;
    resolve_fx_rate_in_dir(
        &db::app_dir(),
        &base,
        &quote,
        &target_date,
        &state,
        &fetcher,
    )
    .await
}

#[tauri::command]
pub async fn list_fx_cache(state: State<'_, AppState>) -> Result<Vec<FxCacheEntry>, String> {
    let guard = state.db.lock().map_err(|e| e.to_string())?;
    let db = guard.as_ref().ok_or("Database not unlocked")?;
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, base_currency, quote_currency, rate, rate_date, source, fetched_at
             FROM fx_cache ORDER BY fetched_at DESC LIMIT 200",
        )
        .map_err(|e| e.to_string())?;
    let entries = stmt
        .query_map([], |row| {
            Ok(FxCacheEntry {
                id: Uuid::parse_str(&row.get::<_, String>(0)?).unwrap_or_else(|_| Uuid::new_v4()),
                base_currency: row.get(1)?,
                quote_currency: row.get(2)?,
                rate: row.get(3)?,
                rate_date: chrono::NaiveDate::parse_from_str(&row.get::<_, String>(4)?, "%Y-%m-%d")
                    .unwrap_or_default(),
                source: row.get(5)?,
                fetched_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(6)?)
                    .unwrap_or_else(|_| {
                        chrono::DateTime::parse_from_rfc3339("2026-01-01T00:00:00Z").unwrap()
                    })
                    .with_timezone(&Utc),
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(entries)
}

pub fn clear_fx_cache_in_dir(dir: &Path, state: &AppState) -> Result<(), String> {
    {
        let guard = state.db.lock().map_err(|e| e.to_string())?;
        let db = guard.as_ref().ok_or("Database not unlocked")?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM fx_cache", [])
            .map_err(|e| e.to_string())?;
    }
    persist_db_in_dir(dir, state)?;
    Ok(())
}

#[tauri::command]
pub async fn clear_fx_cache(state: State<'_, AppState>) -> Result<(), String> {
    {
        let guard = state.db.lock().map_err(|e| e.to_string())?;
        let db = guard.as_ref().ok_or("Database not unlocked")?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM fx_cache", [])
            .map_err(|e| e.to_string())?;
    }
    persist_db(&state).await?;
    Ok(())
}
