use lagosfile_lib::db::AppDb;

#[test]
fn test_db_init_in_memory() {
    let db = AppDb::open_in_memory().expect("Failed to open in-memory DB");

    // Verify we can query the schema (e.g., taxpayer table should exist)
    let conn = db.conn.lock().unwrap();
    let result: i32 = conn
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='taxpayer'",
            [],
            |row| row.get(0),
        )
        .unwrap();

    assert_eq!(
        result, 1,
        "Taxpayer table should exist after schema creation"
    );
}

#[test]
fn test_db_serialization_roundtrip() {
    let db1 = AppDb::open_in_memory().unwrap();

    // Insert some data into db1
    {
        let conn = db1.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO taxpayer (id, full_name, tin, created_at) VALUES (?, ?, ?, ?)",
            [
                uuid::Uuid::new_v4().to_string(),
                "John Doe".to_string(),
                "12345678901".to_string(),
                chrono::Utc::now().to_rfc3339(),
            ],
        )
        .unwrap();
    }

    // Serialize db1
    let bytes = db1.serialize().expect("Failed to serialize");
    assert!(!bytes.is_empty());

    // Create db2 and load from bytes
    let db2 = AppDb::open_in_memory().unwrap();
    db2.load_from_bytes(&bytes)
        .expect("Failed to load from bytes");

    // Verify data in db2
    {
        let conn = db2.conn.lock().unwrap();
        let name: String = conn
            .query_row("SELECT full_name FROM taxpayer LIMIT 1", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(name, "John Doe");
    }
}

#[test]
fn test_s26_explain_query_plan_uses_indexes_on_fresh_and_migrated_db() {
    let check_plans = |conn: &rusqlite::Connection| {
        for (sql, expected_idx) in [
            (
                "EXPLAIN QUERY PLAN SELECT * FROM income_entry WHERE filing_id = 'f1'",
                "idx_income_entry_filing_id",
            ),
            (
                "EXPLAIN QUERY PLAN SELECT * FROM capital_allowance WHERE filing_id = 'f1'",
                "idx_capital_allowance_filing_id",
            ),
            (
                "EXPLAIN QUERY PLAN SELECT * FROM relief_entry WHERE filing_id = 'f1'",
                "idx_relief_entry_filing_id",
            ),
            (
                "EXPLAIN QUERY PLAN SELECT * FROM document WHERE parent_entry_id = 'e1'",
                "idx_document_parent_entry_id",
            ),
        ] {
            let mut stmt = conn.prepare(sql).unwrap();
            let details: Vec<String> = stmt
                .query_map([], |row| row.get::<_, String>(3))
                .unwrap()
                .map(|r| r.unwrap())
                .collect();
            let joined = details.join(" | ");
            assert!(
                joined.contains(expected_idx),
                "expected query plan for `{sql}` to use `{expected_idx}`, got: `{joined}`"
            );
        }
    };

    // 1. Fresh DB via schema.sql
    let db1 = AppDb::open_in_memory().unwrap();
    {
        let conn = db1.conn.lock().unwrap();
        check_plans(&conn);
        // Simulate a legacy DB without these indexes
        conn.execute_batch(
            "DROP INDEX idx_income_entry_filing_id;
             DROP INDEX idx_capital_allowance_filing_id;
             DROP INDEX idx_relief_entry_filing_id;
             DROP INDEX idx_document_parent_entry_id;",
        )
        .unwrap();
    }

    // 2. Reload via load_from_bytes -> migrate() must recreate all 4 indexes
    let legacy_bytes = db1.serialize().unwrap();
    let db2 = AppDb::open_in_memory().unwrap();
    db2.load_from_bytes(&legacy_bytes).unwrap();
    let conn2 = db2.conn.lock().unwrap();
    check_plans(&conn2);
}
