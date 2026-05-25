use crate::{models::FxCacheEntry, services::fx::FxService, AppState};
use chrono::Utc;
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub async fn resolve_fx_rate(
    base: String,
    quote: String,
    target_date: String,
    state: State<'_, AppState>,
) -> Result<crate::models::FxResult, String> {
    let date = chrono::NaiveDate::parse_from_str(&target_date, "%Y-%m-%d")
        .unwrap_or_else(|_| chrono::Local::now().date_naive());

    // 1. Check cache synchronously — acquire lock, read, drop lock before any await.
    let cached = {
        let guard = state.db.lock().map_err(|e| e.to_string())?;
        let db = guard.as_ref().ok_or("Database not unlocked")?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        FxService::check_cache(&conn, &base, &quote)
        // guard + conn dropped here
    };

    // 2. Network waterfall — no MutexGuard held across the await points.
    let result = FxService::resolve_from_network(&base, &quote, date, cached).await;

    // 3. Persist live rate to cache — re-acquire lock briefly.
    if let Some(rate) = result.rate {
        if !result.is_cached {
            let guard = state.db.lock().map_err(|e| e.to_string())?;
            if let Some(db) = guard.as_ref() {
                let conn = db.conn.lock().map_err(|e| e.to_string())?;
                let _ = FxService::cache_rate(&conn, &base, &quote, rate, &result.source, date);
            }
        }
    }

    Ok(result)
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
                id: Uuid::parse_str(&row.get::<_, String>(0)?)
                    .unwrap_or_else(|_| Uuid::new_v4()),
                base_currency: row.get(1)?,
                quote_currency: row.get(2)?,
                rate: row.get(3)?,
                rate_date: chrono::NaiveDate::parse_from_str(
                    &row.get::<_, String>(4)?,
                    "%Y-%m-%d",
                )
                .unwrap_or_default(),
                source: row.get(5)?,
                fetched_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(6)?)
                    .unwrap_or_else(|_| chrono::DateTime::parse_from_rfc3339("2026-01-01T00:00:00Z").unwrap())
                    .with_timezone(&Utc),
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(entries)
}
