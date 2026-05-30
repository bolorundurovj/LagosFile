use crate::db::AppDb;
use crate::models::Taxpayer;
use anyhow::Result;
use chrono::Utc;
use rusqlite::params;
use uuid::Uuid;

pub struct ProfileService;

impl ProfileService {
    pub fn create(db: &AppDb, profile: serde_json::Value) -> Result<Taxpayer> {
        let id = Uuid::new_v4();
        let now = Utc::now();
        let taxpayer = Taxpayer {
            id,
            full_name: profile["fullName"].as_str().unwrap_or("").to_string(),
            tin: profile["tin"].as_str().unwrap_or("").to_string(),
            address: profile["address"].as_str().map(String::from),
            phone: profile["phone"].as_str().map(String::from),
            email: profile["email"].as_str().map(String::from),
            filing_agent: profile["filingAgent"].as_str().map(String::from),
            created_at: now,
        };

        let conn = db.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO taxpayer (id, full_name, tin, address, phone, email, filing_agent, created_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            params![
                taxpayer.id.to_string(), taxpayer.full_name, taxpayer.tin,
                taxpayer.address, taxpayer.phone, taxpayer.email,
                taxpayer.filing_agent, taxpayer.created_at.to_rfc3339(),
            ],
        )?;
        Ok(taxpayer)
    }

    pub fn get(db: &AppDb) -> Result<Option<Taxpayer>> {
        let conn = db.conn.lock().unwrap();
        Ok(conn
            .query_row(
                "SELECT id,full_name,tin,address,phone,email,filing_agent,created_at
                 FROM taxpayer LIMIT 1",
                [],
                |row| {
                    Ok(Taxpayer {
                        id: uuid::Uuid::parse_str(&row.get::<_, String>(0)?)
                            .unwrap_or_else(|_| uuid::Uuid::new_v4()),
                        full_name: row.get(1)?,
                        tin: row.get(2)?,
                        address: row.get(3)?,
                        phone: row.get(4)?,
                        email: row.get(5)?,
                        filing_agent: row.get(6)?,
                        created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(7)?)
                            .unwrap_or_else(|_| {
                                chrono::DateTime::parse_from_rfc3339("2026-01-01T00:00:00Z")
                                    .unwrap()
                            })
                            .with_timezone(&chrono::Utc),
                    })
                },
            )
            .ok())
    }
}
