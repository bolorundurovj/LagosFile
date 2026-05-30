use crate::db::AppDb;
use crate::models::*;
use anyhow::Result;
use chrono::Utc;
use rusqlite::params;
use uuid::Uuid;

pub struct FilingService;

impl FilingService {
    pub fn create_draft(
        db: &AppDb,
        taxpayer_id: Uuid,
        year: i32,
        config_version: &str,
    ) -> Result<Filing> {
        let filing = Filing {
            id: Uuid::new_v4(),
            taxpayer_id,
            parent_filing_id: None,
            year_of_assessment: year,
            status: "Draft".to_string(),
            filing_reference: None,
            created_at: Utc::now(),
            confirmed_at: None,
            total_income_ngn: None,
            chargeable_income: None,
            tax_payable: None,
            wht_credit: None,
            net_tax_payable: None,
            minimum_tax: None,
            final_tax_payable: None,
            tax_config_version: config_version.to_string(),
        };

        let conn = db.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO filing (id, taxpayer_id, year_of_assessment, status, created_at, tax_config_version)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                filing.id.to_string(),
                filing.taxpayer_id.to_string(),
                filing.year_of_assessment,
                filing.status,
                filing.created_at.to_rfc3339(),
                filing.tax_config_version,
            ],
        )?;
        Ok(filing)
    }

    pub fn list(db: &AppDb) -> Result<Vec<Filing>> {
        let conn = db.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, taxpayer_id, parent_filing_id, year_of_assessment, status, filing_reference, 
                    created_at, confirmed_at, total_income_ngn, chargeable_income, tax_payable, 
                    wht_credit, net_tax_payable, minimum_tax, final_tax_payable, tax_config_version 
             FROM filing ORDER BY year_of_assessment DESC, created_at DESC"
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(Filing {
                id: Uuid::parse_str(&row.get::<_, String>(0)?).unwrap_or_else(|_| Uuid::new_v4()),
                taxpayer_id: Uuid::parse_str(&row.get::<_, String>(1)?)
                    .unwrap_or_else(|_| Uuid::new_v4()),
                parent_filing_id: row
                    .get::<_, Option<String>>(2)?
                    .and_then(|s| Uuid::parse_str(&s).ok()),
                year_of_assessment: row.get(3)?,
                status: row.get(4)?,
                filing_reference: row.get(5)?,
                created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(6)?)
                    .unwrap()
                    .with_timezone(&Utc),
                confirmed_at: row
                    .get::<_, Option<String>>(7)?
                    .and_then(|s| chrono::DateTime::parse_from_rfc3339(&s).ok())
                    .map(|d| d.with_timezone(&Utc)),
                total_income_ngn: row.get(8)?,
                chargeable_income: row.get(9)?,
                tax_payable: row.get(10)?,
                wht_credit: row.get(11)?,
                net_tax_payable: row.get(12)?,
                minimum_tax: row.get(13)?,
                final_tax_payable: row.get(14)?,
                tax_config_version: row.get(15)?,
            })
        })?;

        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    pub fn delete(db: &AppDb, id: &str) -> Result<()> {
        let conn = db.conn.lock().unwrap();
        let status: String =
            conn.query_row("SELECT status FROM filing WHERE id=?1", params![id], |r| {
                r.get(0)
            })?;
        if status != "Draft" {
            return Err(anyhow::anyhow!("Only Draft filings can be deleted."));
        }
        conn.execute("DELETE FROM filing WHERE id=?1", params![id])?;
        Ok(())
    }

    pub fn mark_submitted(db: &AppDb, id: &str) -> Result<()> {
        let conn = db.conn.lock().unwrap();
        conn.execute(
            "UPDATE filing SET status='Submitted' WHERE id=?1",
            params![id],
        )?;
        Ok(())
    }
}
