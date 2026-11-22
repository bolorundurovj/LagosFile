pub mod doc_store;
pub mod vault;

use anyhow::Result;
use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;

/// Wraps a rusqlite Connection behind a Mutex.
/// rusqlite::Connection is !Send, but we access it exclusively through
/// a Mutex — so the overall AppDb is safe to move between threads.
pub struct AppDb {
    pub conn: Mutex<Connection>,
}

// SAFETY: Access to Connection is always serialised through the Mutex.
unsafe impl Send for AppDb {}
unsafe impl Sync for AppDb {}

impl AppDb {
    pub fn open_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        let db = AppDb {
            conn: Mutex::new(conn),
        };
        db.create_schema()?;
        Ok(db)
    }

    /// Restore a serialised SQLite database from raw bytes using the
    /// sqlite3_deserialize C API (only available when built with the
    /// "serialize" feature — enabled by the "bundled" feature in rusqlite).
    pub fn load_from_bytes(&self, bytes: &[u8]) -> Result<()> {
        // We must copy the bytes into a heap buffer that SQLite can own.
        let len = bytes.len();
        let copy = unsafe {
            let ptr = rusqlite::ffi::sqlite3_malloc64(len as u64) as *mut u8;
            if ptr.is_null() {
                return Err(anyhow::anyhow!("sqlite3_malloc64 returned null"));
            }
            std::ptr::copy_nonoverlapping(bytes.as_ptr(), ptr, len);
            ptr
        };

        let conn = self.conn.lock().unwrap();
        unsafe {
            let rc = rusqlite::ffi::sqlite3_deserialize(
                conn.handle(),
                c"main".as_ptr(),
                copy,
                len as i64,
                len as i64,
                rusqlite::ffi::SQLITE_DESERIALIZE_FREEONCLOSE
                    | rusqlite::ffi::SQLITE_DESERIALIZE_RESIZEABLE,
            );
            if rc != rusqlite::ffi::SQLITE_OK {
                return Err(anyhow::anyhow!("sqlite3_deserialize failed: error {}", rc));
            }
        }
        drop(conn);
        self.create_schema()?;
        Ok(())
    }

    pub fn serialize(&self) -> Result<Vec<u8>> {
        let conn = self.conn.lock().unwrap();
        let mut size: i64 = 0;
        unsafe {
            let ptr =
                rusqlite::ffi::sqlite3_serialize(conn.handle(), c"main".as_ptr(), &mut size, 0);
            if ptr.is_null() || size == 0 {
                return Err(anyhow::anyhow!("sqlite3_serialize returned null or empty"));
            }
            let slice = std::slice::from_raw_parts(ptr, size as usize);
            let vec = slice.to_vec();
            rusqlite::ffi::sqlite3_free(ptr as *mut std::ffi::c_void);
            Ok(vec)
        }
    }

    fn create_schema(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(include_str!("schema.sql"))?;
        migrate(&conn)?;
        Ok(())
    }
}

pub const SEED_V1_CONFIG_ID: &str = "a0000000-0000-0000-0000-000000000001";
pub const SEED_V1_CONFIG_LABEL: &str = "Tax Config v1.0 — NTA 2025, effective 1 Jan 2026";
pub const NTA_2025_CONFIG_ID: &str = "a0000000-0000-0000-0000-000000000002";
pub const PITA_LEGACY_CONFIG_ID: &str = "a0000000-0000-0000-0000-000000000003";
pub const PITA_CONFIG_ID: &str = "a0000000-0000-0000-0000-000000000004";
const META_MIGRATION_NOTICES: &str = "migration_notices";
const META_NTA_MIGRATED: &str = "nta_2025_config_migrated";
const META_FOREIGN_TAX_MIGRATED: &str = "foreign_tax_relief_migrated";
const META_SHARE_GAIN_MIGRATED: &str = "share_gain_mismatch_migrated";

/// Columns added after the first release. `CREATE TABLE IF NOT EXISTS` leaves
/// existing databases untouched, so they are added here when missing.
const ADDED_COLUMNS: &[(&str, &str, &str)] = &[
    ("relief_entry", "description", "TEXT"),
    ("filing", "payment_date", "TEXT"),
    ("filing", "payment_reference", "TEXT"),
    ("filing", "amount_paid", "REAL"),
    ("filing", "tax_config_id", "TEXT"),
    ("filing", "submitted_at", "TEXT"),
    ("filing", "paye_credit", "REAL"),
    ("filing", "foreign_tax_credit", "REAL"),
    ("income_entry", "bik_category", "TEXT"),
    ("income_entry", "bik_cost", "REAL"),
];

pub fn get_migration_notices(conn: &Connection) -> Vec<String> {
    conn.query_row(
        "SELECT value FROM app_meta WHERE key = ?1",
        rusqlite::params![META_MIGRATION_NOTICES],
        |r| r.get::<_, String>(0),
    )
    .ok()
    .and_then(|s| serde_json::from_str::<Vec<String>>(&s).ok())
    .unwrap_or_default()
}

pub fn add_migration_notice(conn: &Connection, notice: &str) -> Result<()> {
    let mut notices = get_migration_notices(conn);
    if !notices.iter().any(|n| n == notice) {
        notices.push(notice.to_string());
        let json = serde_json::to_string(&notices)?;
        conn.execute(
            "INSERT OR REPLACE INTO app_meta (key, value) VALUES (?1, ?2)",
            rusqlite::params![META_MIGRATION_NOTICES, json],
        )?;
    }
    Ok(())
}

pub fn clear_migration_notices(conn: &Connection) -> Result<()> {
    conn.execute(
        "DELETE FROM app_meta WHERE key = ?1",
        rusqlite::params![META_MIGRATION_NOTICES],
    )?;
    Ok(())
}

fn backfill_filing_tax_config_ids(conn: &Connection) -> Result<()> {
    let mut stmt = conn.prepare(
        "SELECT id, year_of_assessment, filing_reference, tax_config_version
         FROM filing WHERE tax_config_id IS NULL",
    )?;
    let missing: Vec<(String, i32, Option<String>, String)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?
        .filter_map(Result::ok)
        .collect();
    drop(stmt);

    if missing.is_empty() {
        return Ok(());
    }

    let seed_exists: bool = conn
        .query_row(
            "SELECT COUNT(1) FROM tax_config WHERE id = ?1",
            rusqlite::params![SEED_V1_CONFIG_ID],
            |r| r.get::<_, i32>(0),
        )
        .unwrap_or(0)
        > 0;

    let active_id: Option<String> = conn
        .query_row(
            "SELECT id FROM tax_config WHERE is_active = 1 LIMIT 1",
            [],
            |r| r.get(0),
        )
        .ok();

    let mut ambiguous_years: Vec<String> = Vec::new();

    for (filing_id, yoa, filing_ref, version_label) in missing {
        if version_label == SEED_V1_CONFIG_LABEL && seed_exists {
            conn.execute(
                "UPDATE filing SET tax_config_id = ?1 WHERE id = ?2",
                rusqlite::params![SEED_V1_CONFIG_ID, filing_id],
            )?;
            continue;
        }

        // First check whether `version_label` uniquely identifies a single saved configuration.
        let matching_ids: Vec<String> = {
            let mut mstmt = conn.prepare("SELECT id FROM tax_config WHERE version_label = ?1")?;
            let collected = mstmt
                .query_map(rusqlite::params![version_label], |r| r.get::<_, String>(0))?
                .filter_map(Result::ok)
                .collect();
            collected
        };

        if matching_ids.len() == 1 {
            conn.execute(
                "UPDATE filing SET tax_config_id = ?1 WHERE id = ?2",
                rusqlite::params![matching_ids[0], filing_id],
            )?;
        } else {
            let fallback_id = active_id.as_deref().unwrap_or(NTA_2025_CONFIG_ID);
            conn.execute(
                "UPDATE filing SET tax_config_id = ?1 WHERE id = ?2",
                rusqlite::params![fallback_id, filing_id],
            )?;
            let desc = match filing_ref {
                Some(ref r) => format!("{yoa} ({r})"),
                None => format!("{yoa} (Draft)"),
            };
            ambiguous_years.push(desc);
        }
    }

    if !ambiguous_years.is_empty() {
        let notice = format!(
            "Some older filings ({}) did not uniquely identify a saved tax configuration and were linked to your active configuration. Review them and amend if needed.",
            ambiguous_years.join(", ")
        );
        add_migration_notice(conn, &notice)?;
    }

    Ok(())
}

fn seed_filing_ref_counter(conn: &Connection) -> Result<()> {
    let mut stmt = conn.prepare(
        "SELECT year_of_assessment, filing_reference FROM filing
         WHERE filing_reference IS NOT NULL AND filing_reference != ''",
    )?;
    let mut max_by_year: std::collections::HashMap<i32, i64> = std::collections::HashMap::new();
    let rows = stmt.query_map([], |r| Ok((r.get::<_, i32>(0)?, r.get::<_, String>(1)?)))?;
    for row in rows.flatten() {
        let (yoa, reference) = row;
        let parsed_seq = reference
            .rsplit('/')
            .next()
            .and_then(|s| s.parse::<i64>().ok())
            .unwrap_or(0);
        let entry = max_by_year.entry(yoa).or_insert(0);
        if parsed_seq > *entry {
            *entry = parsed_seq;
        }
    }
    drop(stmt);

    for (yoa, seq) in max_by_year {
        conn.execute(
            "INSERT INTO filing_ref_counter (year_of_assessment, last_seq) VALUES (?1, ?2)
             ON CONFLICT(year_of_assessment) DO UPDATE SET last_seq = MAX(last_seq, excluded.last_seq)",
            rusqlite::params![yoa, seq],
        )?;
    }
    Ok(())
}

fn ensure_nta_and_pita_configs(conn: &Connection) -> Result<()> {
    // Never mutate existing PITA_LEGACY_CONFIG_ID in place — Confirmed/Submitted returns
    // pinned to it stay immutable, while Drafts re-pin to the new PITA_CONFIG_ID (with CRA).
    let active: Option<(String, String)> = conn
        .query_row(
            "SELECT id, modified_by FROM tax_config WHERE is_active = 1 LIMIT 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .ok();

    match active {
        None => {
            // Fresh install: activate NTA 2025 config and mark migration complete so later
            // user-saved configs never trigger a bogus legacy upgrade notice.
            conn.execute(
                "UPDATE tax_config SET is_active = 1 WHERE id = ?1",
                rusqlite::params![NTA_2025_CONFIG_ID],
            )?;
            conn.execute(
                "INSERT OR REPLACE INTO app_meta (key, value) VALUES (?1, '1')",
                rusqlite::params![META_NTA_MIGRATED],
            )?;
        }
        Some((ref id, ref modified_by)) if id == SEED_V1_CONFIG_ID && modified_by == "system" => {
            // Existing vault still on untouched v1.0 seed: upgrade active config to NTA 2025.
            conn.execute("UPDATE tax_config SET is_active = 0", [])?;
            conn.execute(
                "UPDATE tax_config SET is_active = 1 WHERE id = ?1",
                rusqlite::params![NTA_2025_CONFIG_ID],
            )?;
            conn.execute(
                "INSERT OR REPLACE INTO app_meta (key, value) VALUES (?1, '1')",
                rusqlite::params![META_NTA_MIGRATED],
            )?;
        }
        Some((ref id, ref modified_by)) if id != NTA_2025_CONFIG_ID && modified_by != "system" => {
            // User-edited config stays active; emit a one-time notice.
            let already_notified: bool = conn
                .query_row(
                    "SELECT COUNT(1) FROM app_meta WHERE key = ?1",
                    rusqlite::params![META_NTA_MIGRATED],
                    |r| r.get::<_, i32>(0),
                )
                .unwrap_or(0)
                > 0;
            if !already_notified {
                add_migration_notice(
                    conn,
                    "Updated NTA 2025 tax rates (0%–25%, 0% minimum tax) and PITA rates (with Consolidated Relief Allowance) for <=2025 income were added, but your custom active configuration was kept active.",
                )?;
                conn.execute(
                    "INSERT OR REPLACE INTO app_meta (key, value) VALUES (?1, '1')",
                    rusqlite::params![META_NTA_MIGRATED],
                )?;
            }
        }
        _ => {
            // Already on a modern system config (e.g. NTA_2025_CONFIG_ID): mark migrated so a
            // subsequent user-edited config never emits a spurious legacy upgrade notice.
            conn.execute(
                "INSERT OR IGNORE INTO app_meta (key, value) VALUES (?1, '1')",
                rusqlite::params![META_NTA_MIGRATED],
            )?;
        }
    }

    // Re-pin existing Draft filings still attached to the broken legacy v1.0 seed or pre-CRA
    // PITA config so they compute with the corrected regime for their income year (PITA+CRA <= 2025,
    // NTA 2025 >= 2026). Confirmed and Submitted filings remain untouched per the immutability rule.
    let draft_seed_rows: Vec<(String, i32)> = {
        let mut stmt = conn.prepare(
            "SELECT id, year_of_assessment FROM filing
             WHERE status = 'Draft'
               AND (tax_config_id IN (?1, ?2) OR tax_config_id IS NULL)",
        )?;
        let rows = stmt
            .query_map(
                rusqlite::params![SEED_V1_CONFIG_ID, PITA_LEGACY_CONFIG_ID],
                |r| Ok((r.get::<_, String>(0)?, r.get::<_, i32>(1)?)),
            )?
            .filter_map(Result::ok)
            .collect();
        rows
    };

    for (draft_id, yoa) in draft_seed_rows {
        if let Ok(target_cfg) =
            crate::services::config::ConfigService::get_for_income_year(conn, yoa)
        {
            conn.execute(
                "UPDATE filing SET tax_config_id = ?1, tax_config_version = ?2 WHERE id = ?3",
                rusqlite::params![
                    target_cfg.id.to_string(),
                    target_cfg.version_label,
                    draft_id
                ],
            )?;
        }
    }

    // If any Confirmed/Submitted returns were pinned to the legacy v1.0 seed or pre-CRA PITA seed,
    // surface distinct one-time notices suggesting an amendment (without altering their stored figures).
    for (cfg_id, meta_key, rule_desc) in [
        (
            SEED_V1_CONFIG_ID,
            "seed_v1_filed_notified",
            "the legacy v1.0 tax rates",
        ),
        (
            PITA_LEGACY_CONFIG_ID,
            "pita_legacy_filed_notified",
            "pre-CRA PITA tax rules",
        ),
    ] {
        let filed_rows: Vec<String> = {
            let mut stmt = conn.prepare(
                "SELECT year_of_assessment, filing_reference FROM filing
                 WHERE status != 'Draft' AND tax_config_id = ?1",
            )?;
            let rows = stmt
                .query_map(rusqlite::params![cfg_id], |r| {
                    let yoa: i32 = r.get(0)?;
                    let fref: Option<String> = r.get(1)?;
                    Ok(match fref {
                        Some(ref s) if !s.is_empty() => format!("{yoa} ({s})"),
                        _ => format!("{yoa}"),
                    })
                })?
                .filter_map(Result::ok)
                .collect();
            rows
        };

        if !filed_rows.is_empty() {
            let already: bool = conn
                .query_row(
                    "SELECT COUNT(1) FROM app_meta WHERE key = ?1",
                    rusqlite::params![meta_key],
                    |r| r.get::<_, i32>(0),
                )
                .unwrap_or(0)
                > 0;
            if !already {
                add_migration_notice(
                    conn,
                    &format!(
                        "Filed returns ({}) were originally computed with {}. Their stored figures have been preserved; create an amendment if you want to recompute them under updated PITA/NTA 2025 rates.",
                        filed_rows.join(", "),
                        rule_desc
                    ),
                )?;
                conn.execute(
                    "INSERT OR REPLACE INTO app_meta (key, value) VALUES (?1, '1')",
                    rusqlite::params![meta_key],
                )?;
            }
        }
    }

    Ok(())
}

/// Chooses which income entries receive a legacy foreign-tax amount: positive foreign
/// entries, else any positive entries, else the first entry with unit weight.
pub(crate) fn foreign_tax_targets(entries: &[(String, f64, bool)]) -> Vec<(String, f64)> {
    let pick = |foreign_only: bool| -> Vec<(String, f64)> {
        entries
            .iter()
            .filter(|(_, g, is_f)| *g > 0.0 && (*is_f || !foreign_only))
            .map(|(id, g, _)| (id.clone(), *g))
            .collect()
    };
    let foreign = pick(true);
    if !foreign.is_empty() {
        return foreign;
    }
    let positive = pick(false);
    if !positive.is_empty() {
        return positive;
    }
    entries
        .first()
        .map(|(id, _, _)| vec![(id.clone(), 1.0)])
        .unwrap_or_default()
}

/// Splits `amount` across `targets` by weight (rounded to kobo, remainder on the last
/// target) and adds each share to the entry's foreign_tax_paid_ngn.
pub(crate) fn distribute_foreign_tax(
    conn: &Connection,
    amount: f64,
    targets: &[(String, f64)],
) -> Result<()> {
    let total_weight: f64 = targets.iter().map(|(_, g)| *g).sum();
    let mut remaining = amount;
    for (idx, (entry_id, weight)) in targets.iter().enumerate() {
        let share = if idx + 1 == targets.len() || total_weight <= 0.0 {
            remaining.max(0.0)
        } else {
            let s = ((amount * (*weight / total_weight) * 100.0).round() / 100.0)
                .min(remaining.max(0.0));
            remaining = (remaining - s).max(0.0);
            s
        };
        if share > 0.0 {
            conn.execute(
                "UPDATE income_entry
                 SET foreign_tax_paid_ngn = COALESCE(foreign_tax_paid_ngn, 0.0) + ?1
                 WHERE id = ?2",
                rusqlite::params![share, entry_id],
            )?;
        }
    }
    Ok(())
}

struct ForeignTaxRow {
    relief_id: String,
    filing_id: String,
    claimed: f64,
    approved: f64,
    status: String,
    yoa: i32,
    filing_ref: Option<String>,
}

fn load_income_weights(conn: &Connection, filing_id: &str) -> Result<Vec<(String, f64, bool)>> {
    let mut stmt = conn.prepare(
        "SELECT id, gross_amount_ngn, is_foreign FROM income_entry
         WHERE filing_id = ?1
         ORDER BY is_foreign DESC, gross_amount_ngn DESC",
    )?;
    let list = stmt
        .query_map(rusqlite::params![filing_id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, f64>(1)?,
                r.get::<_, i32>(2)? != 0,
            ))
        })?
        .filter_map(Result::ok)
        .collect();
    Ok(list)
}

/// Moves a Draft filing's legacy foreign_tax relief onto its income entries, re-parents
/// its attachments to the primary entry and deletes the relief row. A ₦0 row is deleted
/// only when nothing is attached to it.
fn migrate_draft_foreign_tax_relief(
    conn: &Connection,
    relief_id: &str,
    filing_id: &str,
    amount: f64,
) -> Result<()> {
    if amount <= 0.0 {
        let doc_count: i32 = conn
            .query_row(
                "SELECT COUNT(1) FROM document WHERE parent_entry_id = ?1",
                rusqlite::params![relief_id],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if doc_count == 0 {
            conn.execute(
                "DELETE FROM relief_entry WHERE id = ?1",
                rusqlite::params![relief_id],
            )?;
        }
        return Ok(());
    }

    let targets = foreign_tax_targets(&load_income_weights(conn, filing_id)?);
    let Some((primary_entry_id, _)) = targets.first() else {
        return Ok(());
    };
    let tx = conn.unchecked_transaction()?;
    distribute_foreign_tax(&tx, amount, &targets)?;
    tx.execute(
        "UPDATE document
         SET parent_entry_id = ?1, parent_entry_type = 'income_entry'
         WHERE parent_entry_id = ?2 AND parent_entry_type IN ('relief_entry', 'relief')",
        rusqlite::params![primary_entry_id, relief_id],
    )?;
    tx.execute(
        "DELETE FROM relief_entry WHERE id = ?1",
        rusqlite::params![relief_id],
    )?;
    tx.commit()?;
    Ok(())
}

fn add_filed_foreign_tax_notice(conn: &Connection, filed_returns: &[String]) -> Result<()> {
    if filed_returns.is_empty() {
        return Ok(());
    }
    let already: bool = conn
        .query_row(
            "SELECT COUNT(1) FROM app_meta WHERE key = ?1",
            rusqlite::params![META_FOREIGN_TAX_MIGRATED],
            |r| r.get::<_, i32>(0),
        )
        .unwrap_or(0)
        > 0;
    if already {
        return Ok(());
    }
    add_migration_notice(
        conn,
        &format!(
            "Filed returns ({}) recorded foreign tax paid in Step 3 for reference only. Foreign tax is now credited per income entry — create an amendment if you want to claim it.",
            filed_returns.join(", ")
        ),
    )?;
    conn.execute(
        "INSERT OR REPLACE INTO app_meta (key, value) VALUES (?1, '1')",
        rusqlite::params![META_FOREIGN_TAX_MIGRATED],
    )?;
    Ok(())
}

fn migrate_foreign_tax_reliefs(conn: &Connection) -> Result<()> {
    let mut stmt = conn.prepare(
        "SELECT r.id, r.filing_id, r.claimed_amount, r.approved_amount, f.status, f.year_of_assessment, f.filing_reference
         FROM relief_entry r
         JOIN filing f ON f.id = r.filing_id
         WHERE r.relief_type = 'foreign_tax'",
    )?;
    let rows: Vec<ForeignTaxRow> = stmt
        .query_map([], |r| {
            Ok(ForeignTaxRow {
                relief_id: r.get(0)?,
                filing_id: r.get(1)?,
                claimed: r.get(2)?,
                approved: r.get(3)?,
                status: r.get(4)?,
                yoa: r.get(5)?,
                filing_ref: r.get(6)?,
            })
        })?
        .filter_map(Result::ok)
        .collect();
    drop(stmt);

    if rows.is_empty() {
        return Ok(());
    }

    let mut filed_returns: Vec<String> = Vec::new();
    for row in rows {
        let amount = if row.approved > 0.0 {
            row.approved
        } else {
            row.claimed
        };
        if row.status == "Draft" {
            migrate_draft_foreign_tax_relief(conn, &row.relief_id, &row.filing_id, amount)?;
        } else if amount > 0.0 {
            let desc = match row.filing_ref {
                Some(ref r) => format!("{} ({r})", row.yoa),
                None => format!("{}", row.yoa),
            };
            if !filed_returns.contains(&desc) {
                filed_returns.push(desc);
            }
        }
    }
    add_filed_foreign_tax_notice(conn, &filed_returns)
}

fn migrate_share_gain_rows(conn: &Connection) -> Result<()> {
    struct ShareGainMismatch {
        entry_id: String,
        cgt_gain: f64,
        status: String,
        yoa: i32,
        filing_ref: Option<String>,
    }

    let mut stmt = conn.prepare(
        "SELECT ie.id, ie.cgt_gain, f.status, f.year_of_assessment, f.filing_reference
         FROM income_entry ie
         JOIN filing f ON f.id = ie.filing_id
         WHERE ie.income_type = 'capital_gain_shares'
           AND ie.cgt_gain IS NOT NULL
           AND ABS(ie.gross_amount_ngn - ie.cgt_gain) > 0.01",
    )?;
    let rows: Vec<ShareGainMismatch> = stmt
        .query_map([], |r| {
            Ok(ShareGainMismatch {
                entry_id: r.get(0)?,
                cgt_gain: r.get(1)?,
                status: r.get(2)?,
                yoa: r.get(3)?,
                filing_ref: r.get(4)?,
            })
        })?
        .filter_map(Result::ok)
        .collect();
    drop(stmt);

    if rows.is_empty() {
        return Ok(());
    }

    let mut filed_notice: Vec<String> = Vec::new();
    for row in rows {
        if row.status == "Draft" {
            conn.execute(
                "UPDATE income_entry SET gross_amount_ngn = ?1 WHERE id = ?2",
                rusqlite::params![row.cgt_gain, row.entry_id],
            )?;
        } else {
            let desc = match row.filing_ref {
                Some(ref r) => format!("{} ({})", row.yoa, r),
                None => format!("{}", row.yoa),
            };
            if !filed_notice.contains(&desc) {
                filed_notice.push(desc);
            }
        }
    }

    if !filed_notice.is_empty() {
        let already: bool = conn
            .query_row(
                "SELECT COUNT(1) FROM app_meta WHERE key = ?1",
                rusqlite::params![META_SHARE_GAIN_MIGRATED],
                |r| r.get::<_, i32>(0),
            )
            .unwrap_or(0)
            > 0;
        if !already {
            add_migration_notice(
                conn,
                &format!(
                    "Filed returns ({}) contain share-disposal entries whose stored gross amount differs from the capital gain. Review and amend if needed.",
                    filed_notice.join(", ")
                ),
            )?;
            conn.execute(
                "INSERT OR REPLACE INTO app_meta (key, value) VALUES (?1, '1')",
                rusqlite::params![META_SHARE_GAIN_MIGRATED],
            )?;
        }
    }
    Ok(())
}

fn migrate_timestamps_to_rfc3339(conn: &Connection) -> Result<()> {
    const LEGACY_SQLITE_TS_GLOB: &str =
        "[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]";
    for (table, col) in [
        ("filing", "created_at"),
        ("filing", "confirmed_at"),
        ("filing", "submitted_at"),
        ("fx_cache", "fetched_at"),
        ("document", "uploaded_at"),
    ] {
        conn.execute(
            &format!(
                "UPDATE {table}
                 SET {col} = replace({col}, ' ', 'T') || 'Z'
                 WHERE {col} GLOB '{LEGACY_SQLITE_TS_GLOB}'"
            ),
            [],
        )?;
    }
    Ok(())
}

fn migrate_filing_parent_on_delete_set_null(conn: &Connection) -> Result<()> {
    let ddl: Option<String> = conn
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='filing'",
            [],
            |r| r.get(0),
        )
        .ok();
    let Some(ddl) = ddl else {
        return Ok(());
    };
    if ddl.to_ascii_uppercase().contains("ON DELETE SET NULL") {
        return Ok(());
    }

    conn.execute_batch("PRAGMA foreign_keys=OFF;")?;
    let rebuild_res: Result<()> = (|| {
        conn.execute_batch(
            "BEGIN IMMEDIATE;
             CREATE TABLE filing_new (
                 id                  TEXT PRIMARY KEY,
                 taxpayer_id         TEXT NOT NULL REFERENCES taxpayer(id),
                 parent_filing_id    TEXT REFERENCES filing(id) ON DELETE SET NULL,
                 year_of_assessment  INTEGER NOT NULL,
                 status              TEXT NOT NULL DEFAULT 'Draft',
                 filing_reference    TEXT,
                 created_at          TEXT NOT NULL,
                 confirmed_at        TEXT,
                 submitted_at        TEXT,
                 total_income_ngn    REAL,
                 chargeable_income   REAL,
                 tax_payable         REAL,
                 wht_credit          REAL,
                 paye_credit         REAL,
                 foreign_tax_credit  REAL,
                 net_tax_payable     REAL,
                 minimum_tax         REAL,
                 final_tax_payable   REAL,
                 tax_config_version  TEXT NOT NULL DEFAULT 'default',
                 tax_config_id       TEXT REFERENCES tax_config(id),
                 payment_date        TEXT,
                 payment_reference   TEXT,
                 amount_paid         REAL
             );
             INSERT INTO filing_new (
                 id, taxpayer_id, parent_filing_id, year_of_assessment, status,
                 filing_reference, created_at, confirmed_at, submitted_at,
                 total_income_ngn, chargeable_income, tax_payable, wht_credit,
                 paye_credit, foreign_tax_credit, net_tax_payable, minimum_tax,
                 final_tax_payable, tax_config_version, tax_config_id,
                 payment_date, payment_reference, amount_paid
             )
             SELECT
                 id, taxpayer_id, parent_filing_id, year_of_assessment, status,
                 filing_reference, created_at, confirmed_at, submitted_at,
                 total_income_ngn, chargeable_income, tax_payable, wht_credit,
                 paye_credit, foreign_tax_credit, net_tax_payable, minimum_tax,
                 final_tax_payable, tax_config_version, tax_config_id,
                 payment_date, payment_reference, amount_paid
             FROM filing;
             DROP TABLE filing;
             ALTER TABLE filing_new RENAME TO filing;
             COMMIT;",
        )?;
        Ok(())
    })();
    if rebuild_res.is_err() {
        let _ = conn.execute_batch("ROLLBACK;");
    }
    let _ = conn.execute_batch("PRAGMA foreign_keys=ON;");
    rebuild_res
}

fn ensure_indexes(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_income_entry_filing_id ON income_entry(filing_id);
         CREATE INDEX IF NOT EXISTS idx_capital_allowance_filing_id ON capital_allowance(filing_id);
         CREATE INDEX IF NOT EXISTS idx_relief_entry_filing_id ON relief_entry(filing_id);
         CREATE INDEX IF NOT EXISTS idx_document_parent_entry_id ON document(parent_entry_id);",
    )?;
    Ok(())
}

fn migrate(conn: &Connection) -> Result<()> {
    for (table, column, ty) in ADDED_COLUMNS {
        // pragma_table_info crashes on a freshly deserialized connection, so
        // read the column list from a prepared statement instead.
        let exists = conn
            .prepare(&format!("SELECT * FROM {table} LIMIT 0"))?
            .column_names()
            .contains(column);
        if !exists {
            conn.execute_batch(&format!("ALTER TABLE {table} ADD COLUMN {column} {ty}"))?;
        }
    }
    migrate_filing_parent_on_delete_set_null(conn)?;
    ensure_indexes(conn)?;
    backfill_filing_tax_config_ids(conn)?;
    ensure_nta_and_pita_configs(conn)?;
    migrate_foreign_tax_reliefs(conn)?;
    migrate_share_gain_rows(conn)?;
    migrate_timestamps_to_rfc3339(conn)?;
    seed_filing_ref_counter(conn)?;
    Ok(())
}

pub fn app_dir() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join("LagosFile")
}

pub fn db_path() -> PathBuf {
    app_dir().join("lagosfile.db.enc")
}

pub fn salt_path() -> PathBuf {
    app_dir().join(".salt")
}

pub fn ensure_dirs() -> Result<()> {
    let dir = app_dir();
    std::fs::create_dir_all(&dir)?;
    std::fs::create_dir_all(dir.join("documents"))?;
    Ok(())
}
