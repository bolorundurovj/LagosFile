mod commands;
mod db;
mod models;
mod services;

use db::AppDb;
use std::sync::Mutex;

pub struct AppState {
    pub db:  Mutex<Option<AppDb>>,
    pub key: Mutex<Option<[u8; 32]>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(AppState {
            db:  Mutex::new(None),
            key: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            // Auth
            commands::auth::check_app_status,
            commands::auth::setup_pin,
            commands::auth::unlock_db,
            commands::auth::lock_db,
            // Recovery
            commands::auth::setup_recovery,
            commands::auth::check_recovery_setup,
            commands::auth::get_recovery_questions,
            commands::auth::recover_with_answers,
            commands::auth::reset_pin,
            commands::auth::change_pin,
            // Backup / Restore
            commands::auth::backup_db,
            commands::auth::restore_db,
            // Profile
            commands::profile::create_profile,
            commands::profile::get_profile,
            commands::profile::update_profile,
            // Filing
            commands::filing::list_filings,
            commands::filing::get_filing,
            commands::filing::create_draft_filing,
            commands::filing::confirm_filing,
            commands::filing::mark_filing_submitted,
            commands::filing::delete_filing,
            commands::filing::duplicate_filing,
            commands::filing::amend_filing,
            // Income entries
            commands::filing::list_income_entries,
            commands::filing::upsert_income_entry,
            commands::filing::delete_income_entry,
            // Capital allowances
            commands::filing::list_allowances,
            commands::filing::upsert_allowance,
            commands::filing::delete_allowance,
            // Relief entries
            commands::filing::list_relief_entries,
            commands::filing::upsert_relief_entry,
            commands::filing::delete_relief_entry,
            // Computation
            commands::filing::compute_filing,
            // Config
            commands::config::get_active_config,
            commands::config::list_configs,
            commands::config::save_config,
            commands::config::export_config_json,
            commands::config::import_config_json,
            // FX
            commands::fx::resolve_fx_rate,
            commands::fx::list_fx_cache,
            commands::fx::clear_fx_cache,
            // Documents
            commands::document::attach_document,
            commands::document::list_documents,
            commands::document::delete_document,
            // Export
            commands::export::export_filing_pdf,
            commands::export::export_filing_csv,
            commands::export::export_filing_json,
            commands::export::open_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
