#![allow(dead_code)]

use lagosfile_lib::{
    commands::filing::create_draft_filing_with_conn, db::AppDb, services::profile::ProfileService,
    AppState,
};
use rusqlite::Connection;
use serde_json::json;
use std::path::PathBuf;
use tauri::{
    test::{mock_app, MockRuntime},
    App, Manager,
};

/// Error returned by `persist_db` when no vault key is loaded. Command wrappers in these tests
/// run against an in-memory database with no key, so they never write to the real app dir.
pub const NOT_PERSISTED: &str = "Database not unlocked";

pub fn app_with_db() -> App<MockRuntime> {
    let app = mock_app();
    let state = AppState::default();
    *state.db.lock().unwrap() = Some(AppDb::open_in_memory().unwrap());
    app.manage(state);
    app
}

pub fn app_locked() -> App<MockRuntime> {
    let app = mock_app();
    app.manage(AppState::default());
    app
}

pub fn with_conn<T>(app: &App<MockRuntime>, f: impl FnOnce(&Connection) -> T) -> T {
    let state = app.state::<AppState>();
    let guard = state.db.lock().unwrap();
    let db = guard.as_ref().unwrap();
    let conn = db.conn.lock().unwrap();
    f(&conn)
}

pub fn seed_profile(app: &App<MockRuntime>) {
    let state = app.state::<AppState>();
    let guard = state.db.lock().unwrap();
    ProfileService::create(
        guard.as_ref().unwrap(),
        json!({ "fullName": "Ada Lovelace", "tin": "1234567890" }),
    )
    .unwrap();
}

pub fn seed_draft(app: &App<MockRuntime>, yoa: i32) -> String {
    with_conn(app, |conn| {
        create_draft_filing_with_conn(conn, yoa)
            .unwrap()
            .id
            .to_string()
    })
}

pub fn temp_dir(tag: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("lagosfile-{tag}-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}
