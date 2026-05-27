use crate::models::FxResult;
use anyhow::Result;
use chrono::NaiveDate;
use rusqlite::{params, Connection};

pub struct FxService;

impl FxService {
    /// Check the local cache **synchronously** — never holds the connection across an await.
    pub fn check_cache(conn: &Connection, base: &str, quote: &str) -> Option<FxResult> {
        conn.query_row(
            "SELECT rate, rate_date FROM fx_cache
             WHERE base_currency = ?1 AND quote_currency = ?2
             ORDER BY rate_date DESC LIMIT 1",
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

    /// Network waterfall — **no DB connection held** so awaits are safe across threads.
    /// Falls back to the pre-fetched cached result if both HTTP sources fail.
    pub async fn resolve_from_network(
        base: &str,
        quote: &str,
        target_date: NaiveDate,
        cached: Option<FxResult>,
    ) -> FxResult {
        if let Ok(result) = Self::try_fawazahmed0(base, quote, target_date).await {
            return result;
        }
        if let Ok(result) = Self::try_exchangerate_api(base, quote).await {
            return result;
        }
        if let Some(c) = cached {
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
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))",
            params![
                uuid::Uuid::new_v4().to_string(),
                base,
                quote,
                rate,
                date.format("%Y-%m-%d").to_string(),
                source,
            ],
        )?;
        Ok(())
    }

    async fn try_fawazahmed0(base: &str, quote: &str, date: NaiveDate) -> Result<FxResult> {
        let url = format!(
            "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@{}/v1/currencies/{}.json",
            date.format("%Y-%m-%d"),
            base.to_lowercase()
        );
        let resp = reqwest::get(&url)
            .await?
            .json::<serde_json::Value>()
            .await?;
        let rate = resp[base.to_lowercase()][quote.to_lowercase()]
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

    async fn try_exchangerate_api(base: &str, quote: &str) -> Result<FxResult> {
        let url = format!("https://open.er-api.com/v6/latest/{}", base);
        let resp = reqwest::get(&url)
            .await?
            .json::<serde_json::Value>()
            .await?;
        let rate = resp["rates"][quote]
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
