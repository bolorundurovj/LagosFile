use crate::models::FxResult;
use anyhow::Result;
use async_trait::async_trait;
use chrono::NaiveDate;
use rusqlite::{params, Connection};
use std::time::Duration;

const FX_CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
const FX_REQUEST_TIMEOUT: Duration = Duration::from_secs(10);

#[async_trait]
pub trait FxFetcher: Send + Sync {
    async fn fetch_historical(&self, base: &str, quote: &str, date: NaiveDate) -> Result<FxResult>;
    async fn fetch_latest(&self, base: &str, quote: &str) -> Result<FxResult>;
}

pub struct LiveFxFetcher {
    client: reqwest::Client,
}

impl LiveFxFetcher {
    pub fn new() -> Result<Self> {
        let client = reqwest::Client::builder()
            .connect_timeout(FX_CONNECT_TIMEOUT)
            .timeout(FX_REQUEST_TIMEOUT)
            .build()?;
        Ok(Self { client })
    }
}

#[async_trait]
impl FxFetcher for LiveFxFetcher {
    async fn fetch_historical(&self, base: &str, quote: &str, date: NaiveDate) -> Result<FxResult> {
        let base_lower = base.to_lowercase();
        let quote_lower = quote.to_lowercase();
        let url = format!(
            "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@{}/v1/currencies/{}.json",
            date.format("%Y-%m-%d"),
            base_lower
        );
        let resp = self
            .client
            .get(&url)
            .send()
            .await?
            .error_for_status()?
            .json::<serde_json::Value>()
            .await?;
        let rate = resp[base_lower][quote_lower]
            .as_f64()
            .ok_or_else(|| anyhow::anyhow!("Rate not found in fawazahmed0 response"))?;
        Ok(FxResult {
            rate: Some(rate),
            source: "fawazahmed0".to_string(),
            rate_date: date,
            is_cached: false,
            cache_date: None,
        })
    }

    async fn fetch_latest(&self, base: &str, quote: &str) -> Result<FxResult> {
        let url = format!("https://open.er-api.com/v6/latest/{}", base.to_uppercase());
        let resp = self
            .client
            .get(&url)
            .send()
            .await?
            .error_for_status()?
            .json::<serde_json::Value>()
            .await?;
        let rate = resp["rates"][quote.to_uppercase()]
            .as_f64()
            .ok_or_else(|| anyhow::anyhow!("Rate not found in exchangerate-api response"))?;
        Ok(FxResult {
            rate: Some(rate),
            source: "exchangerate-api".to_string(),
            rate_date: chrono::Local::now().date_naive(),
            is_cached: false,
            cache_date: None,
        })
    }
}

pub struct FxService;

impl FxService {
    /// Strictly parse `YYYY-MM-DD`; returns an error instead of silently falling back to today.
    pub fn parse_target_date(target_date: &str) -> Result<NaiveDate, String> {
        let trimmed = target_date.trim();
        NaiveDate::parse_from_str(trimmed, "%Y-%m-%d")
            .map_err(|_| format!("Invalid FX target date '{}': expected YYYY-MM-DD", trimmed))
    }

    /// Check the local cache for an exact `(base, quote, date)` hit — synchronous, no await.
    pub fn check_cache_for_date(
        conn: &Connection,
        base: &str,
        quote: &str,
        target_date: NaiveDate,
    ) -> Option<FxResult> {
        let date_str = target_date.format("%Y-%m-%d").to_string();
        conn.query_row(
            "SELECT rate, rate_date FROM fx_cache
             WHERE base_currency = ?1 AND quote_currency = ?2 AND rate_date = ?3
             ORDER BY fetched_at DESC LIMIT 1",
            params![base, quote, date_str],
            |row| {
                let rate: f64 = row.get(0)?;
                let cached_date_str: String = row.get(1)?;
                Ok((rate, cached_date_str))
            },
        )
        .ok()
        .map(|(rate, cached_date_str)| {
            let cache_date =
                NaiveDate::parse_from_str(&cached_date_str, "%Y-%m-%d").unwrap_or(target_date);
            FxResult {
                rate: Some(rate),
                source: "cache".to_string(),
                rate_date: cache_date,
                is_cached: true,
                cache_date: Some(cache_date),
            }
        })
    }

    /// Check the local cache for the most recent rate for `(base, quote)` (offline fallback).
    pub fn check_cache(conn: &Connection, base: &str, quote: &str) -> Option<FxResult> {
        conn.query_row(
            "SELECT rate, rate_date FROM fx_cache
             WHERE base_currency = ?1 AND quote_currency = ?2
             ORDER BY rate_date DESC, fetched_at DESC LIMIT 1",
            params![base, quote],
            |row| {
                let rate: f64 = row.get(0)?;
                let date_str: String = row.get(1)?;
                Ok((rate, date_str))
            },
        )
        .ok()
        .map(|(rate, date_str)| {
            let cache_date = NaiveDate::parse_from_str(&date_str, "%Y-%m-%d").ok();
            FxResult {
                rate: Some(rate),
                source: "cache".to_string(),
                rate_date: cache_date.unwrap_or_else(|| chrono::Local::now().date_naive()),
                is_cached: true,
                cache_date,
            }
        })
    }

    /// Network waterfall using an injected fetcher — **no DB connection held** across await points.
    /// Falls back to `offline_cached` only if both network sources fail.
    pub async fn resolve_from_network_with_fetcher(
        base: &str,
        quote: &str,
        target_date: NaiveDate,
        offline_cached: Option<FxResult>,
        fetcher: &dyn FxFetcher,
    ) -> FxResult {
        if let Ok(result) = fetcher.fetch_historical(base, quote, target_date).await {
            return result;
        }
        if let Ok(result) = fetcher.fetch_latest(base, quote).await {
            return result;
        }
        if let Some(c) = offline_cached {
            return c;
        }
        FxResult {
            rate: None,
            source: "manual".to_string(),
            rate_date: target_date,
            is_cached: false,
            cache_date: None,
        }
    }

    /// Network waterfall using the live HTTP fetcher with request timeouts.
    pub async fn resolve_from_network(
        base: &str,
        quote: &str,
        target_date: NaiveDate,
        offline_cached: Option<FxResult>,
    ) -> FxResult {
        match LiveFxFetcher::new() {
            Ok(fetcher) => {
                Self::resolve_from_network_with_fetcher(
                    base,
                    quote,
                    target_date,
                    offline_cached,
                    &fetcher,
                )
                .await
            }
            Err(_) => offline_cached.unwrap_or(FxResult {
                rate: None,
                source: "manual".to_string(),
                rate_date: target_date,
                is_cached: false,
                cache_date: None,
            }),
        }
    }

    /// Write a rate back to the cache — synchronous, no await.
    pub fn cache_rate(
        conn: &Connection,
        base: &str,
        quote: &str,
        rate: f64,
        source: &str,
        date: NaiveDate,
    ) -> Result<()> {
        conn.execute(
            "INSERT OR REPLACE INTO fx_cache
             (id, base_currency, quote_currency, rate, rate_date, source, fetched_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                uuid::Uuid::new_v4().to_string(),
                base,
                quote,
                rate,
                date.format("%Y-%m-%d").to_string(),
                source,
                chrono::Utc::now().to_rfc3339(),
            ],
        )?;
        Ok(())
    }
}
