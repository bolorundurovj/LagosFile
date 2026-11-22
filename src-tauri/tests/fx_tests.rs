use async_trait::async_trait;
use chrono::NaiveDate;
use lagosfile_lib::{
    commands::{
        auth::{setup_pin_in_dir, unlock_db_in_dir},
        fx::{clear_fx_cache_in_dir, resolve_fx_rate_in_dir},
    },
    models::FxResult,
    services::fx::{FxFetcher, FxService},
    AppState,
};
use rusqlite::Connection;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

fn setup_test_db() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute(
        "CREATE TABLE fx_cache (
            id TEXT PRIMARY KEY,
            base_currency TEXT,
            quote_currency TEXT,
            rate REAL,
            rate_date TEXT,
            source TEXT,
            fetched_at TEXT
        )",
        [],
    )
    .unwrap();
    conn
}

fn temp_dir(label: &str) -> std::path::PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let dir = std::env::temp_dir().join(format!(
        "lagosfile_fx_{}_{}_{}",
        label,
        std::process::id(),
        nanos
    ));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

struct StubFxFetcher {
    historical_calls: AtomicUsize,
    latest_calls: AtomicUsize,
    historical_rate: Option<f64>,
    latest_rate: Option<(f64, NaiveDate)>,
}

impl StubFxFetcher {
    fn new(historical_rate: Option<f64>, latest_rate: Option<(f64, NaiveDate)>) -> Self {
        Self {
            historical_calls: AtomicUsize::new(0),
            latest_calls: AtomicUsize::new(0),
            historical_rate,
            latest_rate,
        }
    }
}

#[async_trait]
impl FxFetcher for StubFxFetcher {
    async fn fetch_historical(
        &self,
        _base: &str,
        _quote: &str,
        date: NaiveDate,
    ) -> anyhow::Result<FxResult> {
        self.historical_calls.fetch_add(1, Ordering::SeqCst);
        match self.historical_rate {
            Some(rate) => Ok(FxResult {
                rate: Some(rate),
                source: "fawazahmed0".to_string(),
                rate_date: date,
                is_cached: false,
                cache_date: None,
            }),
            None => anyhow::bail!("historical unavailable"),
        }
    }

    async fn fetch_latest(&self, _base: &str, _quote: &str) -> anyhow::Result<FxResult> {
        self.latest_calls.fetch_add(1, Ordering::SeqCst);
        match self.latest_rate {
            Some((rate, today)) => Ok(FxResult {
                rate: Some(rate),
                source: "exchangerate-api".to_string(),
                rate_date: today,
                is_cached: false,
                cache_date: None,
            }),
            None => anyhow::bail!("latest unavailable"),
        }
    }
}

#[test]
fn test_cache_and_check() {
    let conn = setup_test_db();
    let base = "USD";
    let quote = "NGN";
    let rate = 1500.0;
    let date = NaiveDate::from_ymd_opt(2025, 1, 1).unwrap();

    // 1. Check empty cache
    let result = FxService::check_cache(&conn, base, quote);
    assert!(result.is_none());

    // 2. Cache a rate
    FxService::cache_rate(&conn, base, quote, rate, "test-source", date).unwrap();

    // 3. Check again
    let result = FxService::check_cache(&conn, base, quote).unwrap();
    assert_eq!(result.rate, Some(rate));
    assert_eq!(result.source, "cache");
    assert_eq!(result.rate_date, date);
}

#[tokio::test]
async fn test_cached_date_makes_zero_network_calls_and_persists_vault() {
    let dir = temp_dir("cache_hit");
    let state = AppState::default();
    setup_pin_in_dir(&dir, "1234", &state).unwrap();

    let fetcher = StubFxFetcher::new(Some(1520.0), None);

    // First lookup misses cache and hits historical provider once.
    let first = resolve_fx_rate_in_dir(&dir, "USD", "NGN", "2025-03-15", &state, &fetcher)
        .await
        .unwrap();
    assert_eq!(first.rate, Some(1520.0));
    assert!(!first.is_cached);
    assert_eq!(fetcher.historical_calls.load(Ordering::SeqCst), 1);

    // Second lookup for the SAME date must hit cache with ZERO network calls.
    let second = resolve_fx_rate_in_dir(&dir, "usd", "ngn", "2025-03-15", &state, &fetcher)
        .await
        .unwrap();
    assert_eq!(second.rate, Some(1520.0));
    assert!(second.is_cached);
    assert_eq!(
        second.rate_date,
        NaiveDate::from_ymd_opt(2025, 3, 15).unwrap()
    );
    assert_eq!(fetcher.historical_calls.load(Ordering::SeqCst), 1);
    assert_eq!(fetcher.latest_calls.load(Ordering::SeqCst), 0);

    // Lookup for a DIFFERENT date must NOT return 2025-03-15 from cache; it fetches live.
    let fetcher2 = StubFxFetcher::new(Some(1590.0), None);
    let other_day = resolve_fx_rate_in_dir(&dir, "USD", "NGN", "2025-06-20", &state, &fetcher2)
        .await
        .unwrap();
    assert_eq!(other_day.rate, Some(1590.0));
    assert!(!other_day.is_cached);
    assert_eq!(fetcher2.historical_calls.load(Ordering::SeqCst), 1);

    // Reopen the vault from disk without calling lock_db -> cache writes must already be persisted.
    let reloaded_state = AppState::default();
    unlock_db_in_dir(&dir, "1234", &reloaded_state).unwrap();
    let zero_net = StubFxFetcher::new(None, None);
    let persisted =
        resolve_fx_rate_in_dir(&dir, "USD", "NGN", "2025-03-15", &reloaded_state, &zero_net)
            .await
            .unwrap();
    assert_eq!(persisted.rate, Some(1520.0));
    assert!(persisted.is_cached);
    assert_eq!(zero_net.historical_calls.load(Ordering::SeqCst), 0);

    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn test_latest_fallback_caches_under_today_not_requested_date() {
    let dir = temp_dir("latest_fallback");
    let state = AppState::default();
    setup_pin_in_dir(&dir, "1234", &state).unwrap();

    let today = NaiveDate::from_ymd_opt(2026, 4, 1).unwrap();
    let requested = NaiveDate::from_ymd_opt(2024, 2, 10).unwrap();
    let fetcher = StubFxFetcher::new(None, Some((1610.0, today)));

    let result = resolve_fx_rate_in_dir(&dir, "USD", "NGN", "2024-02-10", &state, &fetcher)
        .await
        .unwrap();
    assert_eq!(result.rate, Some(1610.0));
    assert_eq!(result.source, "exchangerate-api");
    assert_eq!(result.rate_date, today);
    assert_eq!(fetcher.historical_calls.load(Ordering::SeqCst), 1);
    assert_eq!(fetcher.latest_calls.load(Ordering::SeqCst), 1);

    // Confirm fx_cache stored it under `today`, NOT under `requested`.
    let guard = state.db.lock().unwrap();
    let conn = guard.as_ref().unwrap().conn.lock().unwrap();
    assert!(
        FxService::check_cache_for_date(&conn, "USD", "NGN", requested).is_none(),
        "fallback rate must not be cached under the requested historical date"
    );
    let cached_today = FxService::check_cache_for_date(&conn, "USD", "NGN", today)
        .expect("fallback rate should be cached under today's date");
    assert_eq!(cached_today.rate, Some(1610.0));
    assert_eq!(cached_today.rate_date, today);

    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn test_bad_date_returns_error_and_clear_cache_persists() {
    let dir = temp_dir("bad_date_clear");
    let state = AppState::default();
    setup_pin_in_dir(&dir, "1234", &state).unwrap();

    let fetcher = StubFxFetcher::new(Some(1500.0), None);
    let err = resolve_fx_rate_in_dir(&dir, "USD", "NGN", "not-a-date", &state, &fetcher)
        .await
        .unwrap_err();
    assert!(
        err.contains("Invalid FX target date"),
        "unexpected error: {}",
        err
    );
    assert_eq!(fetcher.historical_calls.load(Ordering::SeqCst), 0);
    assert_eq!(fetcher.latest_calls.load(Ordering::SeqCst), 0);

    // Populate cache then clear it; reload from disk to confirm clear persisted.
    resolve_fx_rate_in_dir(&dir, "USD", "NGN", "2025-05-01", &state, &fetcher)
        .await
        .unwrap();
    clear_fx_cache_in_dir(&dir, &state).unwrap();

    let reloaded = AppState::default();
    unlock_db_in_dir(&dir, "1234", &reloaded).unwrap();
    let guard = reloaded.db.lock().unwrap();
    let conn = guard.as_ref().unwrap().conn.lock().unwrap();
    assert!(FxService::check_cache(&conn, "USD", "NGN").is_none());

    let _ = std::fs::remove_dir_all(&dir);
}
