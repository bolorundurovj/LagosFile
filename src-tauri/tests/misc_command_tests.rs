mod common;

use common::{app_locked, app_with_db, seed_draft, seed_profile, with_conn, NOT_PERSISTED};
use lagosfile_lib::{
    commands::{
        config::{
            dismiss_migration_notices, export_config_json, get_active_config,
            get_config_for_filing, get_migration_notices, import_config_json, list_configs,
            save_config,
        },
        document::{attach_document, delete_document, list_documents},
        fx::{clear_fx_cache, list_fx_cache, resolve_fx_rate},
        profile::{create_profile, get_profile, update_profile},
    },
    db,
    services::fx::FxService,
    AppState,
};
use rusqlite::params;
use serde_json::json;
use tauri::Manager;

fn config_payload(label: &str) -> serde_json::Value {
    json!({
        "versionLabel": label,
        "governedBy": "Test Act",
        "bands": [
            {"lower": 0, "upper": 800000, "rate": 0.0},
            {"lower": 800000, "upper": null, "rate": 0.15}
        ],
        "reliefCaps": "{}",
        "cgtThresholds": "{}",
        "allowanceRates": "{}"
    })
}

#[tokio::test]
async fn locked_state_rejects_config_profile_fx_and_document_commands() {
    let app = app_locked();
    let s = || app.state::<AppState>();
    assert_eq!(get_active_config(s()).await.unwrap_err(), NOT_PERSISTED);
    assert_eq!(
        get_config_for_filing("x".into(), s()).await.unwrap_err(),
        NOT_PERSISTED
    );
    assert_eq!(list_configs(s()).await.unwrap_err(), NOT_PERSISTED);
    assert_eq!(
        save_config(json!({}), s()).await.unwrap_err(),
        NOT_PERSISTED
    );
    assert_eq!(get_migration_notices(s()).await.unwrap_err(), NOT_PERSISTED);
    assert_eq!(
        dismiss_migration_notices(s()).await.unwrap_err(),
        NOT_PERSISTED
    );
    assert_eq!(
        export_config_json("x".into(), s()).await.unwrap_err(),
        NOT_PERSISTED
    );
    assert_eq!(
        import_config_json("{}".into(), s()).await.unwrap_err(),
        NOT_PERSISTED
    );
    assert_eq!(
        create_profile(json!({}), s()).await.unwrap_err(),
        NOT_PERSISTED
    );
    assert_eq!(get_profile(s()).await.unwrap_err(), NOT_PERSISTED);
    assert_eq!(
        update_profile(json!({}), s()).await.unwrap_err(),
        NOT_PERSISTED
    );
    assert_eq!(list_fx_cache(s()).await.unwrap_err(), NOT_PERSISTED);
    assert_eq!(clear_fx_cache(s()).await.unwrap_err(), NOT_PERSISTED);
    assert_eq!(
        list_documents("x".into(), s()).await.unwrap_err(),
        NOT_PERSISTED
    );
    assert_eq!(
        delete_document("x".into(), s()).await.unwrap_err(),
        NOT_PERSISTED
    );
}

#[tokio::test]
async fn config_commands_save_list_export_import_and_notices() {
    let app = app_with_db();
    let s = || app.state::<AppState>();

    let seeded = list_configs(s()).await.unwrap();
    assert!(!seeded.is_empty());
    let active = get_active_config(s()).await.unwrap();
    assert!(active.is_active);
    assert!(seeded.iter().any(|c| c.id == active.id));

    let bad = save_config(json!({ "versionLabel": "" }), s())
        .await
        .unwrap_err();
    assert!(bad.contains("Version label"), "{bad}");
    assert_eq!(
        save_config(config_payload("Custom 1"), s())
            .await
            .unwrap_err(),
        NOT_PERSISTED
    );
    let active = get_active_config(s()).await.unwrap();
    assert_eq!(active.version_label, "Custom 1");
    assert_eq!(active.bands.len(), 2);
    assert_eq!(list_configs(s()).await.unwrap().len(), seeded.len() + 1);

    let exported = export_config_json(active.id.to_string(), s())
        .await
        .unwrap();
    assert!(exported.contains("Custom 1"));
    assert!(export_config_json("missing".into(), s()).await.is_err());

    assert_eq!(
        import_config_json(exported.clone(), s()).await.unwrap_err(),
        NOT_PERSISTED
    );
    assert_eq!(
        get_active_config(s()).await.unwrap().version_label,
        "Custom 1 (imported)"
    );
    let invalid = import_config_json("not json".into(), s())
        .await
        .unwrap_err();
    assert!(invalid.contains("Invalid config JSON"), "{invalid}");

    seed_profile(&app);
    let fid = seed_draft(&app, 2024);
    let for_filing = get_config_for_filing(fid, s()).await.unwrap();
    assert!(!for_filing.version_label.is_empty());

    with_conn(&app, |c| {
        db::add_migration_notice(c, "Bands updated").unwrap()
    });
    let notices = get_migration_notices(s()).await.unwrap();
    assert!(notices.iter().any(|n| n == "Bands updated"));
    assert_eq!(
        dismiss_migration_notices(s()).await.unwrap_err(),
        NOT_PERSISTED
    );
    assert!(get_migration_notices(s()).await.unwrap().is_empty());
}

#[tokio::test]
async fn profile_commands_create_get_and_update() {
    let app = app_with_db();
    let s = || app.state::<AppState>();
    assert!(get_profile(s()).await.unwrap().is_none());
    let missing = update_profile(json!({ "fullName": "X" }), s())
        .await
        .unwrap_err();
    assert!(missing.contains("not found"), "{missing}");

    let created = create_profile(
        json!({ "fullName": "Ngozi Eze", "tin": "11112222", "email": "n@e.ng" }),
        s(),
    )
    .await
    .unwrap_err();
    assert_eq!(created, NOT_PERSISTED);
    let profile = get_profile(s()).await.unwrap().unwrap();
    assert_eq!(profile.full_name, "Ngozi Eze");
    assert_eq!(profile.email.as_deref(), Some("n@e.ng"));

    assert_eq!(
        update_profile(json!({ "fullName": "Ngozi Okoro", "tin": "  " }), s())
            .await
            .unwrap_err(),
        NOT_PERSISTED
    );
    let updated = get_profile(s()).await.unwrap().unwrap();
    assert_eq!(updated.full_name, "Ngozi Okoro");
    assert_eq!(updated.tin, "11112222", "blank TIN keeps the existing one");
    assert_eq!(updated.email, None);
}

#[tokio::test]
async fn fx_commands_list_resolve_cached_and_clear() {
    let app = app_with_db();
    let s = || app.state::<AppState>();
    assert!(list_fx_cache(s()).await.unwrap().is_empty());

    let date = chrono::NaiveDate::from_ymd_opt(2024, 5, 1).unwrap();
    with_conn(&app, |c| {
        FxService::cache_rate(c, "USD", "NGN", 1450.5, "fawazahmed0", date).unwrap();
        FxService::cache_rate(c, "GBP", "NGN", 1800.0, "exchangerate-api", date).unwrap();
    });

    let cached = list_fx_cache(s()).await.unwrap();
    assert_eq!(cached.len(), 2);
    let usd = cached.iter().find(|e| e.base_currency == "USD").unwrap();
    assert_eq!(usd.rate, 1450.5);
    assert_eq!(usd.rate_date, date);
    assert_eq!(usd.source, "fawazahmed0");

    let hit = resolve_fx_rate(" usd ".into(), "ngn".into(), "2024-05-01".into(), s())
        .await
        .unwrap();
    assert_eq!(hit.rate, Some(1450.5));
    assert!(hit.is_cached);
    assert_eq!(hit.source, "cache");
    assert_eq!(hit.cache_date, Some(date));

    let bad = resolve_fx_rate("USD".into(), "NGN".into(), "05/01/2024".into(), s())
        .await
        .unwrap_err();
    assert!(bad.contains("expected YYYY-MM-DD"), "{bad}");

    assert_eq!(clear_fx_cache(s()).await.unwrap_err(), NOT_PERSISTED);
    assert!(list_fx_cache(s()).await.unwrap().is_empty());
}

#[tokio::test]
async fn document_commands_list_delete_and_reject_bad_attach_input() {
    let app = app_with_db();
    let s = || app.state::<AppState>();
    seed_profile(&app);
    let fid = seed_draft(&app, 2024);
    let entry_id = uuid::Uuid::new_v4().to_string();
    let doc_id = uuid::Uuid::new_v4().to_string();
    with_conn(&app, |c| {
        c.execute(
            "INSERT INTO income_entry (id, filing_id, income_type, gross_amount_ngn, is_foreign)
             VALUES (?1, ?2, 'employment', 100.0, 0)",
            params![entry_id, fid],
        )
        .unwrap();
        c.execute(
            "INSERT INTO document (id,parent_entry_id,parent_entry_type,file_path,file_name,file_type,file_size_bytes,uploaded_at)
             VALUES (?1,?2,'income_entry','documents/e/slip.enc','slip.pdf','pdf',42,'2025-01-01T00:00:00Z')",
            params![doc_id, entry_id],
        )
        .unwrap();
    });

    let docs = list_documents(entry_id.clone(), s()).await.unwrap();
    assert_eq!(docs.len(), 1);
    assert_eq!(docs[0]["id"], doc_id.as_str());
    assert_eq!(docs[0]["fileName"], "slip.pdf");
    assert_eq!(docs[0]["fileSizeBytes"], 42);
    assert_eq!(docs[0]["parentEntryType"], "income_entry");
    assert!(list_documents("other".into(), s())
        .await
        .unwrap()
        .is_empty());

    let too_big = attach_document(
        entry_id.clone(),
        "income_entry".into(),
        "C:/x.pdf".into(),
        "x.pdf".into(),
        "pdf".into(),
        200 * 1024 * 1024,
        s(),
    )
    .await
    .unwrap_err();
    assert!(too_big.contains("100MB"), "{too_big}");
    let no_path = attach_document(
        entry_id.clone(),
        "income_entry".into(),
        String::new(),
        "x.pdf".into(),
        "pdf".into(),
        10,
        s(),
    )
    .await
    .unwrap_err();
    assert!(no_path.contains("No file path"), "{no_path}");

    with_conn(&app, |c| {
        c.execute(
            "UPDATE filing SET status='Confirmed' WHERE id=?1",
            params![fid],
        )
        .unwrap();
    });
    let locked = delete_document(doc_id.clone(), s()).await.unwrap_err();
    assert!(locked.contains("Only Draft"), "{locked}");
    with_conn(&app, |c| {
        c.execute("UPDATE filing SET status='Draft' WHERE id=?1", params![fid])
            .unwrap();
    });

    assert_eq!(
        delete_document(doc_id.clone(), s()).await.unwrap_err(),
        NOT_PERSISTED
    );
    assert!(list_documents(entry_id, s()).await.unwrap().is_empty());
    assert_eq!(
        delete_document("unknown".into(), s()).await.unwrap_err(),
        NOT_PERSISTED
    );
}
