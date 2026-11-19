use crate::db::AppDb;
use crate::models::*;
use anyhow::Result;
use chrono::Utc;
use rusqlite::params;
use uuid::Uuid;

pub struct ConfigService;

impl ConfigService {
    pub fn get_active_conn(conn: &rusqlite::Connection) -> Result<TaxConfig> {
        conn.query_row(
            "SELECT id,version_label,governed_by,bands_json,relief_caps_json,
                    cgt_thresholds_json,allowance_rates_json,minimum_tax_rate,
                    is_active,last_modified,modified_by
             FROM tax_config WHERE is_active=1 LIMIT 1",
            [],
            Self::row_to_config,
        )
        .map_err(|e| e.into())
    }

    pub fn get_by_id(conn: &rusqlite::Connection, id: &str) -> Result<TaxConfig> {
        conn.query_row(
            "SELECT id,version_label,governed_by,bands_json,relief_caps_json,
                    cgt_thresholds_json,allowance_rates_json,minimum_tax_rate,
                    is_active,last_modified,modified_by
             FROM tax_config WHERE id=?1 LIMIT 1",
            params![id],
            Self::row_to_config,
        )
        .map_err(|e| e.into())
    }

    /// Loads the tax configuration pinned to `filing_id` via `filing.tax_config_id`.
    /// Falls back to the active configuration only if `tax_config_id` is absent or cannot be found.
    pub fn get_for_filing(conn: &rusqlite::Connection, filing_id: &str) -> Result<TaxConfig> {
        let pinned_id: Option<String> = conn
            .query_row(
                "SELECT tax_config_id FROM filing WHERE id=?1",
                params![filing_id],
                |r| r.get(0),
            )
            .ok()
            .flatten();
        if let Some(cfg_id) = pinned_id {
            if let Ok(cfg) = Self::get_by_id(conn, &cfg_id) {
                return Ok(cfg);
            }
        }
        Self::get_active_conn(conn)
    }

    /// Selects the appropriate tax configuration for a newly created draft of `income_year`.
    /// Per D1: if the active config is system-managed, income years <= 2025 use PITA and >= 2026 use NTA 2025.
    /// If the user has saved a custom active config, that custom config is respected.
    pub fn get_for_income_year(
        conn: &rusqlite::Connection,
        income_year: i32,
    ) -> Result<TaxConfig> {
        let active = Self::get_active_conn(conn)?;
        if active.modified_by == "user" {
            return Ok(active);
        }
        let target_id = if income_year <= 2025 {
            crate::db::PITA_CONFIG_ID
        } else {
            crate::db::NTA_2025_CONFIG_ID
        };
        Self::get_by_id(conn, target_id).or(Ok(active))
    }

    pub fn get_active(db: &AppDb) -> Result<TaxConfig> {
        let conn = db.conn.lock().unwrap();
        Self::get_active_conn(&conn)
    }

    pub fn save_with_conn(
        conn: &rusqlite::Connection,
        config: &serde_json::Value,
    ) -> Result<TaxConfig> {
        let label = config["versionLabel"].as_str().unwrap_or("").trim();
        if label.is_empty() {
            return Err(anyhow::anyhow!(
                "Version label is required when saving a tax configuration."
            ));
        }

        let exists: i32 = conn.query_row(
            "SELECT COUNT(1) FROM tax_config WHERE version_label = ?1",
            params![label],
            |r| r.get(0),
        )?;
        if exists > 0 {
            return Err(anyhow::anyhow!(
                "A tax configuration named '{}' already exists. Please choose a unique version label.",
                label
            ));
        }

        let id = Uuid::new_v4();
        let now = Utc::now();

        conn.execute("UPDATE tax_config SET is_active=0", [])?;
        conn.execute(
            "INSERT INTO tax_config
             (id,version_label,governed_by,bands_json,relief_caps_json,
              cgt_thresholds_json,allowance_rates_json,minimum_tax_rate,
              is_active,last_modified,modified_by)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,1,?9,'user')",
            params![
                id.to_string(),
                label,
                config["governedBy"].as_str().unwrap_or("NTA 2025"),
                config["bands"].to_string(),
                config["reliefCaps"].to_string(),
                config["cgtThresholds"].to_string(),
                config["allowanceRates"].to_string(),
                config["minimumTaxRate"].as_f64().unwrap_or(0.01),
                now.to_rfc3339(),
            ],
        )?;
        Self::get_active_conn(conn)
    }

    pub fn save(db: &AppDb, config: serde_json::Value) -> Result<TaxConfig> {
        let conn = db.conn.lock().unwrap();
        Self::save_with_conn(&conn, &config)
    }

    fn row_to_config(row: &rusqlite::Row<'_>) -> rusqlite::Result<TaxConfig> {
        let bands_json: String = row.get(3)?;
        let caps_json: String = row.get(4)?;
        let cgt_json: String = row.get(5)?;
        let rates_json: String = row.get(6)?;
        Ok(TaxConfig {
            id: Uuid::parse_str(&row.get::<_, String>(0)?).unwrap_or_else(|_| Uuid::new_v4()),
            version_label: row.get(1)?,
            governed_by: row.get(2)?,
            bands: serde_json::from_str(&bands_json).unwrap_or_default(),
            relief_caps: serde_json::from_str(&caps_json).unwrap_or_default(),
            cgt_thresholds: serde_json::from_str(&cgt_json).unwrap_or(CgtThresholds {
                proceeds_threshold: 150_000_000.0,
                gain_threshold: 10_000_000.0,
            }),
            allowance_rates: serde_json::from_str(&rates_json).unwrap_or_default(),
            minimum_tax_rate: row.get(7)?,
            is_active: row.get::<_, i32>(8)? == 1,
            last_modified: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(9)?)
                .unwrap_or_else(|_| {
                    chrono::DateTime::parse_from_rfc3339("2026-01-01T00:00:00Z").unwrap()
                })
                .with_timezone(&Utc),
            modified_by: row.get(10)?,
        })
    }
}
