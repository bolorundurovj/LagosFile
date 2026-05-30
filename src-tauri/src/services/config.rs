use crate::db::AppDb;
use crate::models::*;
use anyhow::Result;
use chrono::Utc;
use rusqlite::params;
use uuid::Uuid;

pub struct ConfigService;

impl ConfigService {
    pub fn get_active(db: &AppDb) -> Result<TaxConfig> {
        let conn = db.conn.lock().unwrap();
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

    pub fn save(db: &AppDb, config: serde_json::Value) -> Result<TaxConfig> {
        let id = Uuid::new_v4();
        let now = Utc::now();
        let conn = db.conn.lock().unwrap();

        conn.execute("UPDATE tax_config SET is_active=0", [])?;
        conn.execute(
            "INSERT INTO tax_config
             (id,version_label,governed_by,bands_json,relief_caps_json,
              cgt_thresholds_json,allowance_rates_json,minimum_tax_rate,
              is_active,last_modified,modified_by)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,1,?9,'user')",
            params![
                id.to_string(),
                config["versionLabel"].as_str().unwrap_or("Tax Config"),
                config["governedBy"].as_str().unwrap_or("NTA 2025"),
                config["bands"].to_string(),
                config["reliefCaps"].to_string(),
                config["cgtThresholds"].to_string(),
                config["allowanceRates"].to_string(),
                config["minimumTaxRate"].as_f64().unwrap_or(0.01),
                now.to_rfc3339(),
            ],
        )?;
        drop(conn);
        Self::get_active(db)
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
            relief_caps: serde_json::from_str(&caps_json).unwrap_or(ReliefCaps {
                rent_relief_cap: 500_000.0,
                rent_relief_rate: 0.20,
            }),
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
