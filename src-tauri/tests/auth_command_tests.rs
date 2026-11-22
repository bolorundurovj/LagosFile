mod common;

use common::{app_locked, app_with_db, temp_dir, NOT_PERSISTED};
use lagosfile_lib::{
    commands::auth::{
        backup_db_to_path_in_dir, change_pin, is_biometric_available, recover_interrupted_restore,
        reset_pin, restore_backup_fresh_in_dir, restore_db, setup_pin_in_dir, setup_recovery,
        RecoveryOutcome,
    },
    services::{profile::ProfileService, security},
    AppState,
};
use serde_json::json;
use std::path::Path;
use tauri::Manager;

fn write_journal(dir: &Path, phase: &str, stage: &str, prev: Option<&str>) {
    let journal = json!({ "phase": phase, "stage_dir": stage, "prev_docs_dir": prev });
    std::fs::write(
        dir.join(".restore_journal.json"),
        serde_json::to_vec(&journal).unwrap(),
    )
    .unwrap();
}

#[tokio::test]
async fn auth_commands_reject_locked_or_unverified_sessions_without_touching_disk() {
    let app = app_locked();
    let s = || app.state::<AppState>();

    let err = setup_recovery(
        "q1".into(),
        "q2".into(),
        "q3".into(),
        "a1".into(),
        "a2".into(),
        "a3".into(),
        s(),
    )
    .await
    .unwrap_err();
    assert_eq!(err, NOT_PERSISTED);

    let err = reset_pin("4321".into(), s()).await.unwrap_err();
    assert!(
        err.contains("only allowed immediately after account recovery"),
        "{err}"
    );
    *s().recovery_verified.lock().unwrap() = true;
    assert_eq!(
        reset_pin("4321".into(), s()).await.unwrap_err(),
        NOT_PERSISTED
    );

    assert_eq!(
        restore_db("C:/none.lfbak".into(), "1234".into(), s())
            .await
            .unwrap_err(),
        NOT_PERSISTED
    );
    assert_eq!(
        change_pin("1234".into(), "5678".into(), s())
            .await
            .unwrap_err(),
        NOT_PERSISTED
    );

    assert!(is_biometric_available().await.is_ok());
}

#[tokio::test]
async fn change_pin_command_rejects_wrong_current_pin_before_writing() {
    let app = app_with_db();
    let state = app.state::<AppState>();
    let salt = security::generate_salt();
    *state.salt.lock().unwrap() = Some(salt);
    *state.key.lock().unwrap() = Some(security::derive_key("1111", &salt));

    let err = change_pin("9999".into(), "2222".into(), app.state::<AppState>())
        .await
        .unwrap_err();
    assert_eq!(err, "Current PIN is incorrect.");
    assert_eq!(
        *state.key.lock().unwrap(),
        Some(security::derive_key("1111", &salt)),
        "session key is unchanged"
    );
}

#[test]
fn corrupt_restore_journal_is_discarded() {
    let dir = temp_dir("journal-corrupt");
    std::fs::write(dir.join(".restore_journal.json"), b"{not json").unwrap();
    assert_eq!(
        recover_interrupted_restore(&dir).unwrap(),
        RecoveryOutcome::None
    );
    assert!(!dir.join(".restore_journal.json").exists());
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn pre_commit_journal_without_prev_docs_removes_partially_moved_documents() {
    let dir = temp_dir("journal-precommit");
    std::fs::create_dir_all(dir.join("documents")).unwrap();
    std::fs::write(dir.join("documents").join("new.enc"), b"n").unwrap();
    std::fs::create_dir_all(dir.join(".stage")).unwrap();
    write_journal(&dir, "pre_commit", ".stage", None);

    assert_eq!(
        recover_interrupted_restore(&dir).unwrap(),
        RecoveryOutcome::RolledBack
    );
    assert!(!dir.join("documents").exists());
    assert!(!dir.join(".stage").exists());
    assert!(!dir.join(".restore_journal.json").exists());
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn committing_journal_without_any_vault_rolls_documents_back() {
    let dir = temp_dir("journal-committing");
    std::fs::create_dir_all(dir.join("documents")).unwrap();
    std::fs::write(dir.join("documents").join("restored.enc"), b"new").unwrap();
    std::fs::create_dir_all(dir.join(".prev")).unwrap();
    std::fs::write(dir.join(".prev").join("original.enc"), b"old").unwrap();
    std::fs::create_dir_all(dir.join(".stage")).unwrap();
    write_journal(&dir, "committing", ".stage", Some(".prev"));

    assert_eq!(
        recover_interrupted_restore(&dir).unwrap(),
        RecoveryOutcome::RolledBack
    );
    assert_eq!(
        std::fs::read(dir.join("documents").join("original.enc")).unwrap(),
        b"old"
    );
    assert!(!dir.join("documents").join("restored.enc").exists());
    assert!(!dir.join(".prev").exists());
    assert!(!dir.join(".stage").exists());
    assert!(!dir.join(".restore_journal.json").exists());
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn committing_journal_without_vault_or_prev_docs_drops_live_documents() {
    let dir = temp_dir("journal-committing-fresh");
    std::fs::create_dir_all(dir.join("documents")).unwrap();
    write_journal(&dir, "committing", ".stage-missing", None);

    assert_eq!(
        recover_interrupted_restore(&dir).unwrap(),
        RecoveryOutcome::RolledBack
    );
    assert!(!dir.join("documents").exists());
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn committed_journal_cleans_up_previous_documents_and_stage() {
    let dir = temp_dir("journal-committed");
    std::fs::create_dir_all(dir.join("documents")).unwrap();
    std::fs::create_dir_all(dir.join(".prev")).unwrap();
    std::fs::create_dir_all(dir.join(".stage")).unwrap();
    write_journal(&dir, "committed", ".stage", Some(".prev"));

    assert_eq!(
        recover_interrupted_restore(&dir).unwrap(),
        RecoveryOutcome::RolledForward
    );
    assert!(dir.join("documents").exists());
    assert!(!dir.join(".prev").exists());
    assert!(!dir.join(".stage").exists());
    let _ = std::fs::remove_dir_all(&dir);
}

fn make_backup(tag: &str) -> (std::path::PathBuf, std::path::PathBuf) {
    let src = temp_dir(tag);
    let state = AppState::default();
    setup_pin_in_dir(&src, "2468", &state).unwrap();
    {
        let guard = state.db.lock().unwrap();
        ProfileService::create(
            guard.as_ref().unwrap(),
            json!({ "fullName": "Backup Owner", "tin": "5550001" }),
        )
        .unwrap();
    }
    let backup = src.join("backup.lfbak");
    backup_db_to_path_in_dir(&src, &backup, &state).unwrap();
    (src, backup)
}

#[test]
fn fresh_restore_rejects_wrong_pin_and_existing_vault() {
    let (src, backup) = make_backup("fresh-src-a");

    let target = temp_dir("fresh-wrong-pin");
    let err =
        restore_backup_fresh_in_dir(&target, &backup, "0000", &AppState::default()).unwrap_err();
    assert!(err.contains("Invalid backup"), "{err}");
    assert!(!target.join("lagosfile.db.enc").exists());

    let err = restore_backup_fresh_in_dir(&src, &backup, "2468", &AppState::default()).unwrap_err();
    assert!(err.contains("A vault already exists"), "{err}");

    let _ = std::fs::remove_dir_all(&src);
    let _ = std::fs::remove_dir_all(&target);
}

#[test]
fn fresh_restore_replaces_leftover_documents_folder() {
    let (src, backup) = make_backup("fresh-src-b");
    let target = temp_dir("fresh-leftover");
    std::fs::create_dir_all(target.join("documents").join("old")).unwrap();
    std::fs::write(target.join("documents").join("old").join("stale.enc"), b"x").unwrap();

    let state = AppState::default();
    let taxpayer = restore_backup_fresh_in_dir(&target, &backup, "2468", &state)
        .unwrap()
        .unwrap();
    assert_eq!(taxpayer.full_name, "Backup Owner");
    assert!(target.join("lagosfile.db.enc").exists());
    assert!(target.join("documents").exists());
    assert!(!target.join("documents").join("old").exists());
    let leftovers: Vec<_> = std::fs::read_dir(&target)
        .unwrap()
        .filter_map(Result::ok)
        .filter(|e| {
            e.file_name()
                .to_string_lossy()
                .starts_with(".documents_prev_")
        })
        .collect();
    assert!(leftovers.is_empty());
    assert!(state.key.lock().unwrap().is_some());

    let _ = std::fs::remove_dir_all(&src);
    let _ = std::fs::remove_dir_all(&target);
}
