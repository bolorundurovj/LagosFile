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

    let salt = std::fs::read(tmp.join(".salt")).unwrap();
    let key = security::derive_key("1234", &salt);
    let enc = std::fs::read(tmp.join("lagosfile.db.enc")).unwrap();
    let bytes = security::decrypt(&enc, &key).expect("legacy vault must decrypt with PIN 1234");

    let db = AppDb::open_in_memory().unwrap();
    db.load_from_bytes(&bytes).expect("legacy DB must load and migrate");

    let conn = db.conn.lock().unwrap();

    // Verify all 3 filings exist with their stored figures intact
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

    // Verify recovery blob decrypts back to `key`
    let rec_json: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(tmp.join(".recovery")).unwrap()).unwrap();
    let ans_salt = hex::decode(rec_json["answer_salt"].as_str().unwrap()).unwrap();
    let blob = hex::decode(rec_json["recovery_blob"].as_str().unwrap()).unwrap();
    let ak = security::derive_key("alpha|beta|gamma", &ans_salt);
    let recovered = security::decrypt(&blob, &ak).unwrap();
    assert_eq!(recovered.as_slice(), &key);

    // Verify active config computes the Confirmed filing's stored 628,000 figure
    let active_cfg: TaxConfig = lagosfile_lib::services::config::ConfigService::get_active(&db)
        .unwrap();
    let entries = vec![IncomeEntry {
        income_type: "employment".to_string(),
        gross_amount_ngn: 5_000_000.0,
        ..Default::default()
    }];
    let res = ComputationEngine::compute(&entries, &[], &[], &active_cfg).unwrap();
    assert_eq!(res.final_tax_payable, 628_000.0);

    let _ = std::fs::remove_dir_all(&tmp);
}
