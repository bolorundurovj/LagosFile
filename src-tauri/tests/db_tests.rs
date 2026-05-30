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
