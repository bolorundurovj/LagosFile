use lagosfile_lib::db::AppDb;
use lagosfile_lib::services::filing::FilingService;
use lagosfile_lib::services::profile::ProfileService;
use serde_json::json;
use uuid::Uuid;

fn setup() -> (AppDb, uuid::Uuid, lagosfile_lib::models::Filing) {
    let db = AppDb::open_in_memory().unwrap();
    let input = json!({
        "fullName": "Entry Test Taxpayer",
        "tin": "99988877766"
    });
    let taxpayer = ProfileService::create(&db, input).unwrap();
    let filing = FilingService::create_draft(&db, taxpayer.id, 2024, "v1").unwrap();
    (db, taxpayer.id, filing)
}

#[test]
fn test_add_income_entry_and_list() {
    let (db, _, filing) = setup();
    let filing_id = filing.id.to_string();
    let entry_id = Uuid::new_v4().to_string();

    let conn = db.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO income_entry (id, filing_id, income_type, description, gross_amount_ngn, is_foreign)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![entry_id, filing_id, "employment", "Annual salary", 5_000_000.0, 0],
    ).unwrap();

    let count: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM income_entry WHERE filing_id = ?1",
            rusqlite::params![filing_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(count, 1);

    let (income_type, gross): (String, f64) = conn
        .query_row(
            "SELECT income_type, gross_amount_ngn FROM income_entry WHERE id = ?1",
            rusqlite::params![entry_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert_eq!(income_type, "employment");
    assert_eq!(gross, 5_000_000.0);
}

#[test]
fn test_update_income_entry_amount() {
    let (db, _, filing) = setup();
    let filing_id = filing.id.to_string();
    let entry_id = Uuid::new_v4().to_string();

    let conn = db.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO income_entry (id, filing_id, income_type, description, gross_amount_ngn, is_foreign)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![entry_id, filing_id, "employment", "Salary", 3_000_000.0, 0],
    ).unwrap();

    conn.execute(
        "UPDATE income_entry SET gross_amount_ngn = ?1 WHERE id = ?2",
        rusqlite::params![6_500_000.0, entry_id],
    )
    .unwrap();

    let gross: f64 = conn
        .query_row(
            "SELECT gross_amount_ngn FROM income_entry WHERE id = ?1",
            rusqlite::params![entry_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(gross, 6_500_000.0);
}

#[test]
fn test_delete_income_entry() {
    let (db, _, filing) = setup();
    let filing_id = filing.id.to_string();
    let entry_id = Uuid::new_v4().to_string();

    let conn = db.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO income_entry (id, filing_id, income_type, description, gross_amount_ngn, is_foreign)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![entry_id, filing_id, "business", "Consulting", 2_000_000.0, 0],
    ).unwrap();

    let count_before: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM income_entry WHERE filing_id = ?1",
            rusqlite::params![filing_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(count_before, 1);

    conn.execute(
        "DELETE FROM income_entry WHERE id = ?1",
        rusqlite::params![entry_id],
    )
    .unwrap();

    let count_after: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM income_entry WHERE filing_id = ?1",
            rusqlite::params![filing_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(count_after, 0);
}

#[test]
fn test_add_capital_allowance() {
    let (db, _, filing) = setup();
    let filing_id = filing.id.to_string();
    let entry_id = Uuid::new_v4().to_string();

    let conn = db.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO capital_allowance (id, filing_id, asset_description, asset_type, asset_cost, acquisition_date, tax_written_down_value, annual_allowance_rate, annual_allowance_amount)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![
            entry_id, filing_id, "Office generator", "computer_laptop",
            500_000.0, "2024-03-01", 500_000.0, 0.25, 125_000.0
        ],
    ).unwrap();

    let (desc, cost, amount): (String, f64, f64) = conn
        .query_row(
            "SELECT asset_description, asset_cost, annual_allowance_amount FROM capital_allowance WHERE id = ?1",
            rusqlite::params![entry_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .unwrap();
    assert_eq!(desc, "Office generator");
    assert_eq!(cost, 500_000.0);
    assert_eq!(amount, 125_000.0);
}

#[test]
fn test_delete_capital_allowance() {
    let (db, _, filing) = setup();
    let filing_id = filing.id.to_string();
    let entry_id = Uuid::new_v4().to_string();

    let conn = db.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO capital_allowance (id, filing_id, asset_description, asset_type, asset_cost, acquisition_date, tax_written_down_value, annual_allowance_rate, annual_allowance_amount)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![
            entry_id, filing_id, "Desk", "other",
            200_000.0, "2024-01-15", 200_000.0, 0.25, 50_000.0
        ],
    ).unwrap();

    let count_before: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM capital_allowance WHERE filing_id = ?1",
            rusqlite::params![filing_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(count_before, 1);

    conn.execute(
        "DELETE FROM capital_allowance WHERE id = ?1",
        rusqlite::params![entry_id],
    )
    .unwrap();

    let count_after: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM capital_allowance WHERE filing_id = ?1",
            rusqlite::params![filing_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(count_after, 0);
}

#[test]
fn test_add_relief_entry() {
    let (db, _, filing) = setup();
    let filing_id = filing.id.to_string();
    let entry_id = Uuid::new_v4().to_string();

    let conn = db.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO relief_entry (id, filing_id, relief_type, claimed_amount, approved_amount)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![entry_id, filing_id, "pension", 300_000.0, 300_000.0],
    )
    .unwrap();

    let (relief_type, claimed, approved): (String, f64, f64) = conn
        .query_row(
            "SELECT relief_type, claimed_amount, approved_amount FROM relief_entry WHERE id = ?1",
            rusqlite::params![entry_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .unwrap();
    assert_eq!(relief_type, "pension");
    assert_eq!(claimed, 300_000.0);
    assert_eq!(approved, 300_000.0);
}

#[test]
fn test_delete_relief_entry() {
    let (db, _, filing) = setup();
    let filing_id = filing.id.to_string();
    let entry_id = Uuid::new_v4().to_string();

    let conn = db.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO relief_entry (id, filing_id, relief_type, claimed_amount, approved_amount)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![entry_id, filing_id, "nhf", 100_000.0, 100_000.0],
    )
    .unwrap();

    conn.execute(
        "DELETE FROM relief_entry WHERE id = ?1",
        rusqlite::params![entry_id],
    )
    .unwrap();

    let count: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM relief_entry WHERE filing_id = ?1",
            rusqlite::params![filing_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(count, 0);
}

#[test]
fn test_entries_isolated_per_filing() {
    let db = AppDb::open_in_memory().unwrap();
    let input = json!({
        "fullName": "Isolation Test",
        "tin": "11122233344"
    });
    let taxpayer = ProfileService::create(&db, input).unwrap();

    let filing_a = FilingService::create_draft(&db, taxpayer.id, 2023, "v1").unwrap();
    let filing_b = FilingService::create_draft(&db, taxpayer.id, 2024, "v1").unwrap();

    let filing_a_id = filing_a.id.to_string();
    let filing_b_id = filing_b.id.to_string();

    let income_a = Uuid::new_v4().to_string();
    let income_b = Uuid::new_v4().to_string();
    let ca_a = Uuid::new_v4().to_string();
    let ca_b = Uuid::new_v4().to_string();
    let relief_a = Uuid::new_v4().to_string();
    let relief_b = Uuid::new_v4().to_string();

    let conn = db.conn.lock().unwrap();

    conn.execute(
        "INSERT INTO income_entry (id, filing_id, income_type, description, gross_amount_ngn, is_foreign)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![income_a, filing_a_id, "employment", "Salary A", 1_000_000.0, 0],
    ).unwrap();
    conn.execute(
        "INSERT INTO income_entry (id, filing_id, income_type, description, gross_amount_ngn, is_foreign)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![income_b, filing_b_id, "employment", "Salary B", 2_000_000.0, 0],
    ).unwrap();

    conn.execute(
        "INSERT INTO capital_allowance (id, filing_id, asset_description, asset_type, asset_cost, acquisition_date, tax_written_down_value, annual_allowance_rate, annual_allowance_amount)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![ca_a, filing_a_id, "Generator A", "other", 500_000.0, "2023-06-01", 500_000.0, 0.25, 125_000.0],
    ).unwrap();
    conn.execute(
        "INSERT INTO capital_allowance (id, filing_id, asset_description, asset_type, asset_cost, acquisition_date, tax_written_down_value, annual_allowance_rate, annual_allowance_amount)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![ca_b, filing_b_id, "Generator B", "other", 800_000.0, "2024-06-01", 800_000.0, 0.25, 200_000.0],
    ).unwrap();

    conn.execute(
        "INSERT INTO relief_entry (id, filing_id, relief_type, claimed_amount, approved_amount)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![relief_a, filing_a_id, "pension", 200_000.0, 200_000.0],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO relief_entry (id, filing_id, relief_type, claimed_amount, approved_amount)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![relief_b, filing_b_id, "pension", 400_000.0, 400_000.0],
    )
    .unwrap();

    let income_a_count: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM income_entry WHERE filing_id = ?1",
            rusqlite::params![filing_a_id],
            |row| row.get(0),
        )
        .unwrap();
    let income_b_count: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM income_entry WHERE filing_id = ?1",
            rusqlite::params![filing_b_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(income_a_count, 1);
    assert_eq!(income_b_count, 1);

    let ca_a_count: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM capital_allowance WHERE filing_id = ?1",
            rusqlite::params![filing_a_id],
            |row| row.get(0),
        )
        .unwrap();
    let ca_b_count: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM capital_allowance WHERE filing_id = ?1",
            rusqlite::params![filing_b_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(ca_a_count, 1);
    assert_eq!(ca_b_count, 1);

    let relief_a_count: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM relief_entry WHERE filing_id = ?1",
            rusqlite::params![filing_a_id],
            |row| row.get(0),
        )
        .unwrap();
    let relief_b_count: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM relief_entry WHERE filing_id = ?1",
            rusqlite::params![filing_b_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(relief_a_count, 1);
    assert_eq!(relief_b_count, 1);

    let gross_a: f64 = conn
        .query_row(
            "SELECT gross_amount_ngn FROM income_entry WHERE filing_id = ?1",
            rusqlite::params![filing_a_id],
            |row| row.get(0),
        )
        .unwrap();
    let gross_b: f64 = conn
        .query_row(
            "SELECT gross_amount_ngn FROM income_entry WHERE filing_id = ?1",
            rusqlite::params![filing_b_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(gross_a, 1_000_000.0);
    assert_eq!(gross_b, 2_000_000.0);

    let relief_amount_a: f64 = conn
        .query_row(
            "SELECT approved_amount FROM relief_entry WHERE filing_id = ?1",
            rusqlite::params![filing_a_id],
            |row| row.get(0),
        )
        .unwrap();
    let relief_amount_b: f64 = conn
        .query_row(
            "SELECT approved_amount FROM relief_entry WHERE filing_id = ?1",
            rusqlite::params![filing_b_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(relief_amount_a, 200_000.0);
    assert_eq!(relief_amount_b, 400_000.0);
}

#[test]
fn test_multiple_income_entries_same_filing() {
    let (db, _, filing) = setup();
    let filing_id = filing.id.to_string();

    let conn = db.conn.lock().unwrap();
    let ids: Vec<String> = (0..5).map(|_| Uuid::new_v4().to_string()).collect();
    let types = ["employment", "business", "rental", "dividend", "interest"];
    let amounts = [1_000_000.0, 500_000.0, 200_000.0, 100_000.0, 50_000.0];

    for i in 0..5 {
        conn.execute(
            "INSERT INTO income_entry (id, filing_id, income_type, description, gross_amount_ngn, is_foreign)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![ids[i], filing_id, types[i], format!("Income {}", i + 1), amounts[i], 0],
        ).unwrap();
    }

    let count: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM income_entry WHERE filing_id = ?1",
            rusqlite::params![filing_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(count, 5);

    let total: f64 = conn
        .query_row(
            "SELECT SUM(gross_amount_ngn) FROM income_entry WHERE filing_id = ?1",
            rusqlite::params![filing_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(total, 1_850_000.0);
}

#[test]
fn test_upsert_income_entry_via_replace() {
    let (db, _, filing) = setup();
    let filing_id = filing.id.to_string();
    let entry_id = Uuid::new_v4().to_string();

    let conn = db.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO income_entry (id, filing_id, income_type, description, gross_amount_ngn, is_foreign)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![entry_id, filing_id, "employment", "Salary", 500_000.0, 0],
    ).unwrap();

    conn.execute(
        "INSERT OR REPLACE INTO income_entry (id, filing_id, income_type, description, gross_amount_ngn, is_foreign)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![entry_id, filing_id, "employment", "Updated salary", 750_000.0, 0],
    ).unwrap();

    let count: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM income_entry WHERE filing_id = ?1",
            rusqlite::params![filing_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(count, 1);

    let (desc, gross): (Option<String>, f64) = conn
        .query_row(
            "SELECT description, gross_amount_ngn FROM income_entry WHERE id = ?1",
            rusqlite::params![entry_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert_eq!(desc, Some("Updated salary".to_string()));
    assert_eq!(gross, 750_000.0);
}

#[test]
fn test_relief_entry_with_wht_fields() {
    let (db, _, filing) = setup();
    let filing_id = filing.id.to_string();
    let entry_id = Uuid::new_v4().to_string();

    let conn = db.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO relief_entry (id, filing_id, relief_type, claimed_amount, approved_amount, wht_ref, wht_income_type, wht_date)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![entry_id, filing_id, "wht", 150_000.0, 150_000.0, "WHT-2024-001", "dividend", "2024-06-15"],
    ).unwrap();

    let (relief_type, wht_ref, wht_income_type, wht_date): (String, Option<String>, Option<String>, Option<String>) = conn
        .query_row(
            "SELECT relief_type, wht_ref, wht_income_type, wht_date FROM relief_entry WHERE id = ?1",
            rusqlite::params![entry_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .unwrap();
    assert_eq!(relief_type, "wht");
    assert_eq!(wht_ref, Some("WHT-2024-001".to_string()));
    assert_eq!(wht_income_type, Some("dividend".to_string()));
    assert_eq!(wht_date, Some("2024-06-15".to_string()));
}

#[test]
fn test_capital_allowance_upsert_via_replace() {
    let (db, _, filing) = setup();
    let filing_id = filing.id.to_string();
    let entry_id = Uuid::new_v4().to_string();

    let conn = db.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO capital_allowance (id, filing_id, asset_description, asset_type, asset_cost, acquisition_date, tax_written_down_value, annual_allowance_rate, annual_allowance_amount)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![entry_id, filing_id, "Laptop", "computer_laptop", 300_000.0, "2024-01-01", 300_000.0, 0.25, 75_000.0],
    ).unwrap();

    conn.execute(
        "INSERT OR REPLACE INTO capital_allowance (id, filing_id, asset_description, asset_type, asset_cost, acquisition_date, tax_written_down_value, annual_allowance_rate, annual_allowance_amount)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![entry_id, filing_id, "Updated Laptop", "computer_laptop", 350_000.0, "2024-01-01", 350_000.0, 0.25, 87_500.0],
    ).unwrap();

    let count: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM capital_allowance WHERE filing_id = ?1",
            rusqlite::params![filing_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(count, 1);

    let desc: String = conn
        .query_row(
            "SELECT asset_description FROM capital_allowance WHERE id = ?1",
            rusqlite::params![entry_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(desc, "Updated Laptop");
}

#[test]
fn test_copy_entries_to_next_year_carries_forward_straight_line() {
    use lagosfile_lib::commands::filing::copy_entries_to_next_year;

    let (db, taxpayer_id, filing) = setup();
    let next = FilingService::create_draft(&db, taxpayer_id, 2025, "v1").unwrap();
    let from = filing.id.to_string();
    let to = next.id.to_string();

    let conn = db.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO income_entry (id, filing_id, income_type, gross_amount_ngn, is_foreign)
         VALUES (?1, ?2, 'employment', 5000000, 0)",
        rusqlite::params![Uuid::new_v4().to_string(), from],
    )
    .unwrap();
    // opening WDV 750k on a 1M asset at 25%: claims 250k, closes at 500k
    conn.execute(
        "INSERT INTO capital_allowance (id, filing_id, asset_description, asset_type, asset_cost, acquisition_date, tax_written_down_value, annual_allowance_rate, annual_allowance_amount)
         VALUES (?1, ?2, 'Laptop', 'computer_laptop', 1000000, '2023-01-01', 750000, 0.25, 250000)",
        rusqlite::params![Uuid::new_v4().to_string(), from],
    )
    .unwrap();
    // fully written down: should not be carried forward
    conn.execute(
        "INSERT INTO capital_allowance (id, filing_id, asset_description, asset_type, asset_cost, acquisition_date, tax_written_down_value, annual_allowance_rate, annual_allowance_amount)
         VALUES (?1, ?2, 'Old monitor', 'monitor', 100000, '2020-01-01', 25000, 0.25, 25000)",
        rusqlite::params![Uuid::new_v4().to_string(), from],
    )
    .unwrap();
    for (kind, amount) in [
        ("pension", 400000.0),
        ("wht", 50000.0),
        ("foreign_tax", 10000.0),
    ] {
        conn.execute(
            "INSERT INTO relief_entry (id, filing_id, relief_type, claimed_amount, approved_amount)
             VALUES (?1, ?2, ?3, ?4, ?4)",
            rusqlite::params![Uuid::new_v4().to_string(), from, kind, amount],
        )
        .unwrap();
    }

    copy_entries_to_next_year(&conn, &from, &to).unwrap();

    let (wdv, allowance): (f64, f64) = conn
        .query_row(
            "SELECT tax_written_down_value, annual_allowance_amount FROM capital_allowance WHERE filing_id=?1",
            rusqlite::params![to],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(wdv, 500_000.0);
    assert_eq!(allowance, 250_000.0);

    let reliefs: Vec<String> = conn
        .prepare("SELECT relief_type FROM relief_entry WHERE filing_id=?1")
        .unwrap()
        .query_map(rusqlite::params![to], |r| r.get(0))
        .unwrap()
        .map(|r| r.unwrap())
        .collect();
    assert_eq!(reliefs, vec!["pension".to_string()]);

    // copied ids must round-trip through Uuid so later upserts hit the same row
    let ids: Vec<String> = conn
        .prepare("SELECT id FROM income_entry WHERE filing_id=?1 UNION ALL SELECT id FROM capital_allowance WHERE filing_id=?1")
        .unwrap()
        .query_map(rusqlite::params![to], |r| r.get(0))
        .unwrap()
        .map(|r| r.unwrap())
        .collect();
    assert_eq!(ids.len(), 2);
    for id in ids {
        assert_eq!(Uuid::parse_str(&id).unwrap().to_string(), id);
    }
}

#[test]
fn test_migration_adds_columns_to_existing_database() {
    let db = AppDb::open_in_memory().unwrap();
    {
        let conn = db.conn.lock().unwrap();
        conn.execute_batch(
            "DROP TABLE relief_entry;
             CREATE TABLE relief_entry (id TEXT PRIMARY KEY, filing_id TEXT NOT NULL, relief_type TEXT NOT NULL,
               claimed_amount REAL NOT NULL DEFAULT 0, approved_amount REAL NOT NULL DEFAULT 0,
               wht_ref TEXT, wht_income_type TEXT, wht_date TEXT);",
        )
        .unwrap();
    }
    let bytes = db.serialize().unwrap();
    let reopened = AppDb::open_in_memory().unwrap();
    reopened.load_from_bytes(&bytes).unwrap();

    let conn = reopened.conn.lock().unwrap();
    for (table, column) in [
        ("relief_entry", "description"),
        ("filing", "payment_date"),
        ("filing", "payment_reference"),
        ("filing", "amount_paid"),
    ] {
        let stmt = conn
            .prepare(&format!("SELECT * FROM {table} LIMIT 0"))
            .unwrap();
        assert!(
            stmt.column_names().contains(&column),
            "{table}.{column} missing"
        );
    }
}

