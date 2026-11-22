use lagosfile_lib::{
    db::AppDb,
    models::*,
    services::{computation::ComputationEngine, security},
};
use rusqlite::params;
use std::path::{Path, PathBuf};

fn fixture_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join("legacy_v1_2_vault")
}

/// One-time generator for the v1.2.0 legacy vault fixture.
/// Run with: `cargo test --test upgrade_fixture_tests -- --ignored generate_legacy_v1_2_fixture`
#[test]
#[ignore]
fn generate_legacy_v1_2_fixture() {
    let dir = fixture_dir();
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(dir.join("documents")).unwrap();

    let db = AppDb::open_in_memory().unwrap();
    {
        let conn = db.conn.lock().unwrap();
        let tp_id = "11111111-1111-4111-8111-111111111111";
        conn.execute(
            "INSERT INTO taxpayer (id, full_name, tin, address, phone, email, created_at)
             VALUES (?1, 'Ada Lovelace', '1234567890123', '10 Marina, Lagos', '08012345678', 'ada@example.com', '2025-01-10T10:00:00Z')",
            params![tp_id],
        )
        .unwrap();

        // Two user-saved configs with the exact same version_label (#30)
        let bands_a = r#"[{"lower":0,"upper":800000,"rate":0.07},{"lower":800000,"upper":2800000,"rate":0.11},{"lower":2800000,"upper":null,"rate":0.15}]"#;
        let bands_b = r#"[{"lower":0,"upper":800000,"rate":0.07},{"lower":800000,"upper":2800000,"rate":0.11},{"lower":2800000,"upper":null,"rate":0.16}]"#;
        let caps = r#"{"rentReliefCap":500000,"rentReliefRate":0.20}"#;
        let cgt = r#"{"proceedsThreshold":150000000,"gainThreshold":10000000}"#;
        let rates = r#"{"computer_laptop":0.25,"software_licence":0.33,"other":0.25}"#;

        conn.execute("UPDATE tax_config SET is_active=0", [])
            .unwrap();
        conn.execute(
            "INSERT INTO tax_config (id,version_label,governed_by,bands_json,relief_caps_json,cgt_thresholds_json,allowance_rates_json,minimum_tax_rate,is_active,last_modified,modified_by)
             VALUES (?1,'Tax Config — NTA 2025, effective 1 Jan 2026','NTA 2025',?2,?3,?4,?5,0.01,0,'2025-02-01T00:00:00Z','user')",
            params!["c0000000-0000-4000-8000-000000000001", bands_a, caps, cgt, rates],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO tax_config (id,version_label,governed_by,bands_json,relief_caps_json,cgt_thresholds_json,allowance_rates_json,minimum_tax_rate,is_active,last_modified,modified_by)
             VALUES (?1,'Tax Config — NTA 2025, effective 1 Jan 2026','NTA 2025',?2,?3,?4,?5,0.01,1,'2025-03-01T00:00:00Z','user')",
            params!["c0000000-0000-4000-8000-000000000002", bands_b, caps, cgt, rates],
        )
        .unwrap();

        // 1) Draft filing (2025)
        let draft_id = "22222222-2222-4222-8222-222222222201";
        let draft_inc_id = "33333333-3333-4333-8333-333333333301";
        conn.execute(
            "INSERT INTO filing (id,taxpayer_id,year_of_assessment,status,created_at,tax_config_version)
             VALUES (?1,?2,2025,'Draft','2026-01-15T09:00:00Z','Tax Config — NTA 2025, effective 1 Jan 2026')",
            params![draft_id, tp_id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO income_entry (id,filing_id,income_type,description,gross_amount_ngn,is_foreign)
             VALUES (?1,?2,'employment','Draft Salary',4000000.0,0)",
            params![draft_inc_id, draft_id],
        )
        .unwrap();

        // 2) Confirmed filing (2024)
        let conf_id = "22222222-2222-4222-8222-222222222202";
        let conf_inc_id = "33333333-3333-4333-8333-333333333302";
        conn.execute(
            "INSERT INTO filing (id,taxpayer_id,year_of_assessment,status,filing_reference,created_at,confirmed_at,
                                 total_income_ngn,chargeable_income,tax_payable,wht_credit,net_tax_payable,minimum_tax,final_tax_payable,tax_config_version)
             VALUES (?1,?2,2024,'Confirmed','LIRS/REF/2024/00001','2025-02-10T09:00:00Z','2025-02-11T09:00:00Z',
                     5000000.0,5000000.0,NULL,0.0,628000.0,50000.0,628000.0,'Tax Config — NTA 2025, effective 1 Jan 2026')",
            params![conf_id, tp_id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO income_entry (id,filing_id,income_type,description,gross_amount_ngn,is_foreign)
             VALUES (?1,?2,'employment','2024 Salary',5000000.0,0)",
            params![conf_inc_id, conf_id],
        )
        .unwrap();

        // 3) Submitted filing (2023)
        let sub_id = "22222222-2222-4222-8222-222222222203";
        let sub_inc_id = "33333333-3333-4333-8333-333333333303";
        conn.execute(
            "INSERT INTO filing (id,taxpayer_id,year_of_assessment,status,filing_reference,created_at,confirmed_at,
                                 total_income_ngn,chargeable_income,tax_payable,wht_credit,net_tax_payable,minimum_tax,final_tax_payable,tax_config_version)
             VALUES (?1,?2,2023,'Submitted','LIRS/REF/2023/00002','2024-02-10T09:00:00Z','2024-02-11T09:00:00Z',
                     3000000.0,3000000.0,NULL,0.0,306000.0,30000.0,306000.0,'Tax Config v1.0 — NTA 2025, effective 1 Jan 2026')",
            params![sub_id, tp_id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO income_entry (id,filing_id,income_type,description,gross_amount_ngn,is_foreign)
             VALUES (?1,?2,'business','2023 Consulting',3000000.0,0)",
            params![sub_inc_id, sub_id],
        )
        .unwrap();

        // Plaintext sample attachment for each filing
        for (doc_id, parent_id, fname, content) in [
            (
                "44444444-4444-4444-8444-444444444401",
                draft_inc_id,
                "draft_payslip.txt",
                b"draft payslip plaintext".as_slice(),
            ),
            (
                "44444444-4444-4444-8444-444444444402",
                conf_inc_id,
                "conf_payslip.txt",
                b"confirmed payslip plaintext".as_slice(),
            ),
            (
                "44444444-4444-4444-8444-444444444403",
                sub_inc_id,
                "sub_invoice.txt",
                b"submitted invoice plaintext".as_slice(),
            ),
        ] {
            let entry_dir = dir.join("documents").join(parent_id);
            std::fs::create_dir_all(&entry_dir).unwrap();
            let rel_path = format!("documents/{}/{}", parent_id, fname);
            std::fs::write(dir.join(&rel_path), content).unwrap();
            conn.execute(
                "INSERT INTO document (id,parent_entry_id,parent_entry_type,file_path,file_name,file_type,file_size_bytes,uploaded_at)
                 VALUES (?1,?2,'income_entry',?3,?4,'txt',?5,'2025-02-10T09:05:00Z')",
                params![doc_id, parent_id, rel_path, fname, content.len() as i64],
            )
            .unwrap();
        }
    }

    // Legacy v1.2.0 format: raw .salt + nonce||ciphertext in lagosfile.db.enc
    let salt: [u8; 16] = [
        0x10, 0x21, 0x32, 0x43, 0x54, 0x65, 0x76, 0x87, 0x98, 0xa9, 0xba, 0xcb, 0xdc, 0xed, 0xfe,
        0x0f,
    ];
    let key = security::derive_key("1234", &salt);
    let plaintext = db.serialize().unwrap();
    let encrypted = security::encrypt(&plaintext, &key).unwrap();
    std::fs::write(dir.join(".salt"), salt).unwrap();
    std::fs::write(dir.join("lagosfile.db.enc"), encrypted).unwrap();

    // Recovery data wrapping `key`
    let ans_salt: [u8; 16] = [0x55; 16];
    let ak = security::derive_key("alpha|beta|gamma", &ans_salt);
    let blob = security::encrypt(&key, &ak).unwrap();
    let recovery = serde_json::json!({
        "question_1": "Q1",
        "question_2": "Q2",
        "question_3": "Q3",
        "answer_salt": hex::encode(ans_salt),
        "recovery_blob": hex::encode(blob),
    });
    std::fs::write(
        dir.join(".recovery"),
        serde_json::to_string_pretty(&recovery).unwrap(),
    )
    .unwrap();
}

fn copy_dir_recursive(src: &Path, dst: &Path) {
    std::fs::create_dir_all(dst).unwrap();
    for entry in std::fs::read_dir(src).unwrap() {
        let entry = entry.unwrap();
        let ty = entry.file_type().unwrap();
        let target = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_recursive(&entry.path(), &target);
        } else {
            std::fs::copy(entry.path(), &target).unwrap();
        }
    }
}

#[test]
fn test_legacy_v1_2_vault_opens_and_preserves_filed_returns() {
    let src = fixture_dir();
    assert!(
        src.join("lagosfile.db.enc").exists(),
        "legacy fixture must exist in tests/fixtures/legacy_v1_2_vault"
    );

    let tmp = std::env::temp_dir().join(format!("lagosfile-upgrade-{}", uuid::Uuid::new_v4()));
    copy_dir_recursive(&src, &tmp);

    // Unlock via the vault-backed unlock_db_in_dir path
    let state = lagosfile_lib::AppState::default();
    let taxpayer = lagosfile_lib::commands::auth::unlock_db_in_dir(&tmp, "1234", &state)
        .expect("legacy vault must unlock with PIN 1234")
        .expect("taxpayer must exist");
    assert_eq!(taxpayer.full_name, "Ada Lovelace");

    // Verify all 3 filings exist with their stored figures intact
    {
        let db_guard = state.db.lock().unwrap();
        let db = db_guard.as_ref().unwrap();
        let conn = db.conn.lock().unwrap();

        let count: i32 = conn
            .query_row("SELECT COUNT(*) FROM filing", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 3);

        let (conf_income, conf_final): (f64, f64) = conn
            .query_row(
                "SELECT total_income_ngn, final_tax_payable FROM filing WHERE id='22222222-2222-4222-8222-222222222202'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(conf_income, 5_000_000.0);
        assert_eq!(conf_final, 628_000.0);

        let (sub_income, sub_final): (f64, f64) = conn
            .query_row(
                "SELECT total_income_ngn, final_tax_payable FROM filing WHERE id='22222222-2222-4222-8222-222222222203'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(sub_income, 3_000_000.0);
        assert_eq!(sub_final, 306_000.0);

        // Verify same-label configs both exist
        let same_label_count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM tax_config WHERE version_label='Tax Config — NTA 2025, effective 1 Jan 2026'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(same_label_count, 2);
        drop(conn);

        // Verify active config computes the Confirmed filing's stored 628,000 figure
        let active_cfg: TaxConfig =
            lagosfile_lib::services::config::ConfigService::get_active(db).unwrap();
        let entries = vec![IncomeEntry {
            income_type: "employment".to_string(),
            gross_amount_ngn: 5_000_000.0,
            ..Default::default()
        }];
        let res = ComputationEngine::compute(&entries, &[], &[], &active_cfg).unwrap();
        assert_eq!(res.final_tax_payable, 628_000.0);

        // S8: Verify tax_config_id backfill & ambiguous-label migration notice
        {
            let conn = db.conn.lock().unwrap();
            let sub_cfg_id: String = conn
                .query_row(
                    "SELECT tax_config_id FROM filing WHERE id='22222222-2222-4222-8222-222222222203'",
                    [],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(sub_cfg_id, lagosfile_lib::db::SEED_V1_CONFIG_ID);

            let conf_cfg_id: String = conn
                .query_row(
                    "SELECT tax_config_id FROM filing WHERE id='22222222-2222-4222-8222-222222222202'",
                    [],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(conf_cfg_id, "c0000000-0000-4000-8000-000000000002");

            let notices = lagosfile_lib::db::get_migration_notices(&conn);
            assert!(
                !notices.is_empty() && notices[0].contains("2024"),
                "ambiguous same-label filings must produce a one-time notice: {notices:?}"
            );

            // Recompute all 3 filings with their pinned configs
            let draft_comp = lagosfile_lib::commands::filing::compute_filing_with_conn(
                &conn,
                "22222222-2222-4222-8222-222222222201",
            )
            .unwrap();
            assert!(
                draft_comp.total_gross_income > 0.0,
                "Draft filing must recompute cleanly after upgrade"
            );

            let conf_comp = lagosfile_lib::commands::filing::compute_filing_with_conn(
                &conn,
                "22222222-2222-4222-8222-222222222202",
            )
            .unwrap();
            assert_eq!(conf_comp.final_tax_payable, 628_000.0);

            let sub_comp = lagosfile_lib::commands::filing::compute_filing_with_conn(
                &conn,
                "22222222-2222-4222-8222-222222222203",
            )
            .unwrap();
            assert_eq!(sub_comp.final_tax_payable, 306_000.0);

            let payload_before = lagosfile_lib::commands::lirs::build_pending_filing(
                &conn,
                "22222222-2222-4222-8222-222222222202",
            )
            .unwrap();
            assert_eq!(payload_before.computation.total_gross_income, 5_000_000.0);
            assert_eq!(payload_before.computation.final_tax_payable, 628_000.0);

            // Change the active config to drastically different rates (50% flat)
            lagosfile_lib::services::config::ConfigService::save_with_conn(
                &conn,
                &serde_json::json!({
                    "versionLabel": "Drastic Test Config 50%",
                    "governedBy": "Test",
                    "bands": [{"lower": 0, "upper": null, "rate": 0.50}],
                    "reliefCaps": {"rentReliefCap": 0, "rentReliefRate": 0.0},
                    "cgtThresholds": {"proceedsThreshold": 150000000, "gainThreshold": 10000000},
                    "allowanceRates": {"other": 0.25},
                    "minimumTaxRate": 0.0
                }),
            )
            .unwrap();

            // Changing the active config MUST NOT affect confirmed/submitted recomputation or LIRS payload
            let conf_comp_after = lagosfile_lib::commands::filing::compute_filing_with_conn(
                &conn,
                "22222222-2222-4222-8222-222222222202",
            )
            .unwrap();
            assert_eq!(conf_comp_after.final_tax_payable, 628_000.0);

            let sub_comp_after = lagosfile_lib::commands::filing::compute_filing_with_conn(
                &conn,
                "22222222-2222-4222-8222-222222222203",
            )
            .unwrap();
            assert_eq!(sub_comp_after.final_tax_payable, 306_000.0);

            let payload_after = lagosfile_lib::commands::lirs::build_pending_filing(
                &conn,
                "22222222-2222-4222-8222-222222222202",
            )
            .unwrap();
            assert_eq!(
                payload_after.computation.total_gross_income,
                payload_before.computation.total_gross_income
            );
            assert_eq!(
                payload_after.computation.chargeable_income,
                payload_before.computation.chargeable_income
            );
            assert_eq!(
                payload_after.computation.graduated_tax,
                payload_before.computation.graduated_tax
            );
            assert_eq!(payload_after.computation.final_tax_payable, 628_000.0);
        }
    }

    // Verify PDF export succeeds on Confirmed and Submitted filings with migrated encrypted attachments
    let conf_pdf = tmp.join("confirmed_export.pdf");
    lagosfile_lib::commands::export::export_filing_pdf_in_dir(
        &tmp,
        "22222222-2222-4222-8222-222222222202",
        conf_pdf.to_str().unwrap(),
        true,
        None,
        &state,
    )
    .expect("PDF export of legacy Confirmed filing must succeed");
    assert!(conf_pdf.is_file() && std::fs::metadata(&conf_pdf).unwrap().len() > 1000);
    let conf_doc = lopdf::Document::load(&conf_pdf).expect("exported Confirmed PDF must be valid");
    assert!(conf_doc.get_pages().len() >= 2);

    let sub_pdf = tmp.join("submitted_export.pdf");
    lagosfile_lib::commands::export::export_filing_pdf_in_dir(
        &tmp,
        "22222222-2222-4222-8222-222222222203",
        sub_pdf.to_str().unwrap(),
        true,
        None,
        &state,
    )
    .expect("PDF export of legacy Submitted filing must succeed");
    assert!(sub_pdf.is_file() && std::fs::metadata(&sub_pdf).unwrap().len() > 1000);

    // Verify S6 one-time migration encrypted all 3 legacy plaintext attachments and they still decrypt
    {
        let db_guard = state.db.lock().unwrap();
        let db = db_guard.as_ref().unwrap();
        let doc_key = lagosfile_lib::db::doc_store::get_doc_key(db)
            .unwrap()
            .expect("document_key must be generated during unlock migration");
        for (parent_id, fname, expected) in [
            (
                "33333333-3333-4333-8333-333333333301",
                "draft_payslip.txt",
                b"draft payslip plaintext".as_slice(),
            ),
            (
                "33333333-3333-4333-8333-333333333302",
                "conf_payslip.txt",
                b"confirmed payslip plaintext".as_slice(),
            ),
            (
                "33333333-3333-4333-8333-333333333303",
                "sub_invoice.txt",
                b"submitted invoice plaintext".as_slice(),
            ),
        ] {
            let rel = format!("documents/{}/{}", parent_id, fname);
            let raw = std::fs::read(tmp.join(&rel)).unwrap();
            assert!(lagosfile_lib::db::doc_store::is_encrypted_doc(&raw));
            let dec =
                lagosfile_lib::db::doc_store::read_decrypted_doc(&tmp, &rel, &doc_key).unwrap();
            assert_eq!(dec.as_slice(), expected);
        }
    }

    // First save upgrades the legacy fixture vault to v1 self-describing format and removes .salt
    lagosfile_lib::commands::auth::persist_db_in_dir(&tmp, &state).unwrap();
    let raw = std::fs::read(tmp.join("lagosfile.db.enc")).unwrap();
    assert!(lagosfile_lib::db::vault::has_vault_header(&raw));
    assert!(!tmp.join(".salt").exists());

    // Reopen via recovery questions still works after upgrade
    let rec_state = lagosfile_lib::AppState::default();
    let rec_tp = lagosfile_lib::commands::auth::recover_with_answers_in_dir(
        &tmp,
        &["alpha".into(), "beta".into(), "gamma".into()],
        &rec_state,
    )
    .expect("recovery must still work after upgrade")
    .unwrap();
    assert_eq!(rec_tp.full_name, "Ada Lovelace");

    let _ = std::fs::remove_dir_all(&tmp);
}
