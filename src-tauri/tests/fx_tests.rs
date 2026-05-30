use chrono::NaiveDate;
use lagosfile_lib::services::fx::FxService;
use rusqlite::Connection;

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
