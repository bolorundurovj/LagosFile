# Implementation Plan: LagosFile

## Overview

Phased implementation of the LagosFile desktop application (Python + Flet). Each phase builds on the previous, ending with all components wired together. Property-based tests (Hypothesis) are sub-tasks placed immediately after the code they validate.

## Tasks

- [x] 1. Phase 1 — Core Infrastructure
  - [x] 1.1 Scaffold project structure and dependencies
    - Create `pyproject.toml` with dependencies: flet, tortoise-orm, cryptography, httpx, reportlab, hypothesis, pytest, pytest-asyncio
    - Create package layout: `lagosfile/` with `models/`, `services/`, `ui/`, `tests/`
    - Create `lagosfile/constants.py` with filesystem paths (`~/LagosFile/`, document root, error log, salt file, encrypted DB path)
    - _Requirements: 14.5_

  - [x] 1.2 Implement PIN-keyed Fernet encryption module
    - Create `lagosfile/security.py` with `derive_key(pin, salt)` using PBKDF2-HMAC-SHA256 (480,000 iterations)
    - Implement `encrypt_db(plaintext_bytes, fernet_key) -> bytes` and `decrypt_db(ciphertext, fernet_key) -> bytes`
    - Implement `generate_salt() -> bytes` and `load_or_create_salt() -> bytes`
    - Implement atomic write: write to `.tmp` then rename to final path
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

  - [x] 1.3 Write property test for encryption round-trip
    - **Property 25: Encryption round-trip**
    - **Validates: Requirements 14.1, 14.3, 14.4**
    - Test that `decrypt_db(encrypt_db(data, key), key) == data` for any bytes and any PIN
    - Test that decrypting with a different PIN raises `InvalidToken`

  - [x] 1.4 Implement TortoiseORM models
    - Create `lagosfile/models.py` with all ORM models: `Taxpayer`, `Filing`, `IncomeEntry`, `CapitalAllowance`, `ReliefEntry`, `FXCache`, `Document`, `TaxConfigModel`
    - Add `TORTOISE_ORM` config dict pointing to `sqlite://:memory:`
    - Implement `init_db(plaintext_bytes)` that loads decrypted bytes into in-memory SQLite and runs `generate_schemas()`
    - Implement `serialize_db() -> bytes` that serializes the in-memory SQLite for re-encryption
    - _Requirements: 14.1_

  - [x] 1.5 Implement Config Engine
    - Create `lagosfile/services/config_engine.py` with `ConfigEngine` class
    - Implement `get_active_config() -> TaxConfig` reading from `TaxConfigModel` where `is_active=True`
    - Implement `save_config(config: TaxConfig) -> TaxConfig` that deactivates the current config and inserts a new versioned record
    - Implement `export_json(config) -> str` and `import_json(raw: str) -> TaxConfig` with full field validation
    - Seed the initial NTA 2025 config (bands, rent relief cap ₦500k, CGT thresholds, allowance rates, 1% minimum tax) on first run
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8_

  - [x] 1.6 Write property test for Tax_Config import/export round-trip
    - **Property 23: Tax_Config import/export round-trip**
    - **Validates: Requirements 13.6, 13.7**

  - [x] 1.7 Write property test for invalid Tax_Config import rejection
    - **Property 24: Invalid Tax_Config import is rejected**
    - **Validates: Requirements 13.8**

  - [x] 1.8 Implement Profile Service
    - Create `lagosfile/services/profile_service.py` with `ProfileService`
    - Implement `create(data, pin)` that validates TIN (exactly 13 digits), saves `Taxpayer` record, and triggers DB encryption
    - Implement `get() -> Optional[Taxpayer]` and `update(data) -> Taxpayer`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [x] 1.9 Write property test for TIN validation
    - **Property 1: TIN validation is exact**
    - **Validates: Requirements 1.2**
    - Use `st.text(alphabet=string.digits, min_size=13, max_size=13)` for valid TINs
    - Use `st.one_of(too_short, too_long, non_numeric)` for invalid TINs

  - [x] 1.10 Write property test for profile persistence round-trip
    - **Property 2: Profile persistence round-trip**
    - **Validates: Requirements 1.3, 1.7**

  - [x] 1.11 Checkpoint — Ensure all Phase 1 tests pass
    - Ensure all tests pass, ask the user if questions arise.


- [x] 2. Phase 2 — Filing Wizard and Document Management
  - [x] 2.1 Implement Document Service
    - Create `lagosfile/services/document_service.py` with `DocumentService`
    - Implement `validate_size(file_path)` raising `FileTooLargeError` if size > 100MB
    - Implement `attach(entry_id, entry_type, file_path)` that copies the file to `~/LagosFile/documents/<TIN>/<YOA>/<entry_id>/` and saves a `Document` record
    - _Requirements: 4.6, 4.7, 4.8, 14.5, 14.6_

  - [x] 2.2 Write property test for document file size enforcement
    - **Property 7: Document file size enforcement**
    - **Validates: Requirements 4.7**

  - [x] 2.3 Write property test for document storage path construction
    - **Property 8: Document storage path construction**
    - **Validates: Requirements 4.8**

  - [x] 2.4 Implement Filing Service — draft lifecycle
    - Create `lagosfile/services/filing_service.py` with `FilingService`
    - Implement `create_draft(taxpayer_id, yoa)` creating a `Filing` with status `Draft`
    - Implement `save_step(filing_id, step_data)` that upserts income entries, capital allowances, or relief entries and re-serializes + re-encrypts the DB
    - Implement `confirm(filing_id)` that sets status to `Confirmed`, stamps `confirmed_at`, generates filing reference `LIRS/REF/YYYY/NNNNN`, and snapshots the active `tax_config_version`
    - Implement `duplicate(filing_id)` creating a new Draft with YOA+1, carrying forward entries and written-down values
    - Implement `amend(filing_id)` creating a new Draft linked via `parent_filing_id`
    - _Requirements: 3.1, 3.4, 3.5, 10.4, 10.5, 10.8_

  - [x] 2.5 Write property test for filing duplicate increments YOA
    - **Property 18: Filing duplicate increments YOA**
    - **Validates: Requirements 10.4**

  - [x] 2.6 Write property test for amendment immutability
    - **Property 19: Amendment immutability**
    - **Validates: Requirements 10.5**

  - [x] 2.7 Write property test for filing reference format
    - **Property 20: Filing reference format**
    - **Validates: Requirements 10.8**

  - [x] 2.8 Implement AppState and WizardDraft state management
    - Create `lagosfile/state.py` with `AppState` and `WizardDraft` dataclasses
    - Implement step-transition logic: flush `WizardDraft` to ORM models, trigger `save_step`, advance `current_step`
    - Implement back-navigation: decrement `current_step` without data loss
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [x] 2.9 Checkpoint — Ensure all Phase 2 tests pass
    - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Phase 3 — Tax Computation Engine
  - [x] 3.1 Implement ComputationEngine core logic
    - Create `lagosfile/services/computation_engine.py` with `ComputationEngine` class
    - Implement `compute(filing_data: FilingData, config: TaxConfig) -> ComputationResult`
    - Separate digital asset entries and ring-fence losses (digital loss cannot reduce other income)
    - Apply CGT exemption: exclude Nigerian company share gains if proceeds < threshold AND gain <= threshold
    - Compute total gross income (domestic + foreign converted + digital net)
    - _Requirements: 4.4, 4.5, 8.1, 8.6, 8.7_

  - [x] 3.2 Write property test for digital asset loss ring-fencing
    - **Property 5: Digital asset loss ring-fencing**
    - **Validates: Requirements 4.4, 8.7**

  - [x] 3.3 Write property test for CGT exemption threshold logic
    - **Property 6: CGT exemption threshold logic**
    - **Validates: Requirements 4.5, 8.6**

  - [x] 3.4 Implement capital allowance proration
    - Compute non-taxable income ratio
    - If non-taxable >= 10% of total, prorate capital allowances by (taxable / total)
    - _Requirements: 6.6_

  - [x] 3.5 Write property test for capital allowance proration
    - **Property 13: Capital allowance proration**
    - **Validates: Requirements 6.6**

  - [x] 3.6 Implement deductions and reliefs computation
    - Compute Rent Relief: `min(annual_rent * 0.20, config.rent_relief_cap)`
    - Sum all other deductions: pension, NHIS, NHF, life assurance, other approved
    - Compute chargeable income: `max(total_gross - effective_ca - total_deductions, 0)`
    - _Requirements: 7.3, 7.4, 8.1_

  - [x] 3.7 Write property test for Rent Relief auto-calculation
    - **Property 14: Rent Relief auto-calculation**
    - **Validates: Requirements 7.3, 7.4**

  - [x] 3.8 Implement progressive tax band computation
    - Sort bands by lower threshold
    - For each band, compute taxable amount in band and marginal tax
    - Sum all band taxes to get graduated tax
    - Record `BandResult` for each band
    - _Requirements: 8.1, 8.3_

  - [x] 3.9 Write property test for marginal tax band computation
    - **Property 15: Marginal tax band computation**
    - **Validates: Requirements 8.3**

  - [x] 3.10 Implement WHT credit offset and minimum tax check
    - Compute `net_tax_payable = max(graduated_tax - wht_credits, 0)`
    - Compute `minimum_tax = total_gross * config.minimum_tax_rate`
    - Compute `final_tax_payable = max(net_tax_payable, minimum_tax)`
    - _Requirements: 8.1_

  - [x] 3.11 Write property test for full computation sequence invariants
    - **Property 17: Full computation sequence invariants**
    - **Validates: Requirements 8.1**
    - Test all five invariants listed in the design

  - [x] 3.12 Write property test for tax computation is config-driven
    - **Property 16: Tax computation is config-driven**
    - **Validates: Requirements 8.2**
    - Generate two configs differing only in one band rate; verify different results

  - [x] 3.13 Checkpoint — Ensure all Phase 3 tests pass
    - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Phase 4 — FX Rate Service
  - [x] 4.1 Implement FXService with waterfall resolution
    - Create `lagosfile/services/fx_service.py` with `FXService` class
    - Implement `async resolve_rate(base, quote, date) -> FXResult`
    - Step 1: fetch from fawazahmed0 historical endpoint using `httpx` async with 5s timeout
    - Step 2: fallback to ExchangeRate-API Open Access
    - Step 3: query `FXCache` for most recent cached rate for the pair; return with `is_cached=True`
    - Step 4: return `FXResult(rate=None, source="manual")` to trigger manual entry prompt
    - Cache every successful API fetch to `FXCache` before returning
    - _Requirements: 5.2, 5.5, 5.6, 5.7, 5.9, 16.1, 16.2, 16.3, 16.4, 16.5, 16.6_

  - [x] 4.2 Write property test for FX waterfall ordering
    - **Property 9: FX waterfall ordering**
    - **Validates: Requirements 5.2, 16.1**
    - Mock httpx responses to simulate each failure scenario

  - [x] 4.3 Write property test for FX rate caching on successful fetch
    - **Property 11: FX rate caching on successful fetch**
    - **Validates: Requirements 5.9, 16.3**

  - [x] 4.4 Implement CBN override rate logic in income entry
    - When `fx_rate_cbn_override` is set on an `IncomeEntry`, use it as `fx_rate_used` and set `fx_rate_source = "CBN Override"`
    - When not set, use `fx_rate_fetched` and set source to the API/cache/manual label
    - Compute `gross_amount_ngn = foreign_amount * fx_rate_used`
    - _Requirements: 5.5, 5.6, 5.7_

  - [x] 4.5 Write property test for FX rate selection — CBN override takes precedence
    - **Property 10: FX rate selection — CBN override takes precedence**
    - **Validates: Requirements 5.5, 5.6, 5.7**

  - [x] 4.6 Checkpoint — Ensure all Phase 4 tests pass
    - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Phase 5 — Export Engine
  - [x] 5.1 Implement JSON export
    - Create `lagosfile/services/export_engine.py` with `ExportEngine` class
    - Implement `export_json(filing) -> str` serializing all income entries, capital allowances, relief entries, computed totals, and document file paths
    - Include taxpayer name, TIN, and YOA as top-level header fields
    - _Requirements: 11.3, 11.4, 11.5_

  - [x] 5.2 Write property test for JSON export round-trip
    - **Property 21: JSON export round-trip**
    - **Validates: Requirements 11.3**

  - [x] 5.3 Implement CSV export
    - Implement `export_csv(filing) -> str` with all required columns: income_type, description, gross_amount_ngn, foreign_currency, foreign_amount, date, fetched_fx_rate, cbn_override_rate, naira_equivalent, rate_source
    - Include header row with taxpayer name, TIN, YOA
    - _Requirements: 11.2, 11.4_

  - [x] 5.4 Write property test for CSV export contains required columns
    - **Property 22: CSV export contains required columns**
    - **Validates: Requirements 11.2**

  - [x] 5.5 Implement PDF export
    - Implement `export_pdf(filing, options) -> bytes` using reportlab
    - Include: taxpayer name, TIN, YOA header; full tax computation statement; FX summary block (if applicable); relief breakdown; document attachment index
    - Format as a LIRS-style formal assessment statement
    - _Requirements: 11.1, 11.4, 11.5_

  - [x] 5.6 Checkpoint — Ensure all Phase 5 tests pass
    - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Phase 6 — Filing History
  - [x] 6.1 Implement filing history query and pagination
    - Add `list_filings(taxpayer_id, page, page_size, filters)` to `FilingService`
    - Support filtering by YOA and status
    - Return paginated results with total count for metric cards (Total, Submitted, Confirmed, Drafts)
    - _Requirements: 10.1, 10.2, 10.6_

  - [x] 6.2 Implement filing detail retrieval
    - Add `get_filing_detail(filing_id)` to `FilingService` returning the full filing with all related entries, documents, and FX rates
    - _Requirements: 10.3_

  - [x] 6.3 Implement benefits-in-kind taxable value calculation
    - In `IncomeEntry` creation for employment income, auto-calculate benefits-in-kind taxable value as `cost * 0.05`
    - _Requirements: 4.2_

  - [x] 6.4 Write property test for benefits-in-kind taxable value
    - **Property 3: Benefits-in-kind taxable value**
    - **Validates: Requirements 4.2**

  - [x] 6.5 Write property test for multiple income entries are all persisted
    - **Property 4: Multiple income entries are all persisted**
    - **Validates: Requirements 4.3**

  - [x] 6.6 Checkpoint — Ensure all Phase 6 tests pass
    - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Phase 7 — Configuration Page (backend)
  - [x] 7.1 Implement capital allowance annual amount calculation
    - In `CapitalAllowance` creation, compute `annual_allowance_amount = asset_cost * annual_allowance_rate`
    - Read `annual_allowance_rate` from the active `TaxConfig.allowance_rates[asset_type]`
    - _Requirements: 6.5_

  - [x] 7.2 Write property test for capital allowance annual amount calculation
    - **Property 12: Capital allowance annual amount calculation**
    - **Validates: Requirements 6.5**

  - [x] 7.3 Implement config versioning and snapshot on confirm
    - When `FilingService.confirm()` is called, read `ConfigEngine.get_active_config().version_label` and write it to `Filing.tax_config_version`
    - _Requirements: 8.4, 8.5_

  - [x] 7.4 Implement deadline proximity calculation
    - Create `lagosfile/utils/deadline.py` with `days_until_deadline(current_date, filing_year) -> int | None`
    - Return `None` if more than 45 days away; return days remaining if within 45 days
    - _Requirements: 15.1, 15.4_

  - [x] 7.5 Write property test for deadline countdown accuracy
    - **Property 26: Deadline countdown accuracy**
    - **Validates: Requirements 15.1**

  - [x] 7.6 Checkpoint — Ensure all Phase 7 tests pass
    - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Phase 8 — LIRS Portal Integration
  - [x] 8.1 Implement Playwright automation for LIRS Form A pre-fill
    - Create `lagosfile/services/lirs_service.py` with `LIRSService`
    - Implement `file_with_lirs(filing)` using `sync_playwright` to launch Chromium, navigate to `etax.lirs.gov.ng`, wait for user login (2-minute timeout), then pre-fill Form A fields from `filing` computed values
    - Map all filing fields to Form A section names for the Reference Panel
    - _Requirements: 12.1, 12.2, 12.3_

  - [x] 8.2 Implement Reference Panel fallback
    - On any exception in `file_with_lirs`, catch it, log to `~/LagosFile/errors.log`, open the LIRS portal in the system default browser via `webbrowser.open()`
    - Return `AutomationResult(success=False, fallback_active=True)` to trigger Reference Panel display in the UI
    - _Requirements: 12.4, 12.5, 12.6, 12.7_

  - [x] 8.3 Implement "Mark as Submitted" action
    - Add `mark_submitted(filing_id)` to `FilingService` that sets `Filing.status = "Submitted"` (only allowed on Confirmed filings)
    - _Requirements: 12.8_

  - [x] 8.4 Checkpoint — Ensure all Phase 8 tests pass
    - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Phase 9 — Flet UI Layer
  - [x] 9.1 Implement app entry point, PIN entry, and profile setup screens
    - Create `lagosfile/main.py` as the Flet app entry point
    - Implement `PinEntryPage` (route `/pin`): PIN input, derive key, decrypt DB, init TortoiseORM, load AppState
    - Implement `ProfileSetupPage` (route `/setup`): shown on first run when no profile exists; collect name, TIN, optional fields, PIN; call `ProfileService.create()`
    - _Requirements: 1.1, 1.2, 14.2, 14.3, 14.4_

  - [x] 9.2 Implement Sidebar and top app bar components
    - Create `lagosfile/ui/components/sidebar.py` with navigation links: Dashboard, New Filing, Filing History, Configuration, Settings
    - Create `lagosfile/ui/components/topbar.py` showing YOA label, user name + TIN, avatar
    - _Requirements: 2.1, 2.2_

  - [x] 9.3 Implement Dashboard page
    - Create `lagosfile/ui/pages/dashboard.py`
    - Render deadline countdown banner when `days_until_deadline()` returns a value
    - Render missing-filing warning cards for current and prior YOA
    - Render filing history table with status badges (Draft=grey, Confirmed=blue, Submitted=green)
    - Render quick-access module cards and lifetime total footer
    - _Requirements: 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 15.1, 15.2, 15.3_

  - [x] 9.4 Implement Filing Wizard container and stepper
    - Create `lagosfile/ui/pages/wizard.py` as the four-step wizard container
    - Render vertical progress stepper with step states (active, done, pending)
    - Wire Back/Continue buttons to `AppState` step transitions and `FilingService.save_step()`
    - _Requirements: 3.2, 3.3, 3.4, 3.6, 3.7_

  - [x] 9.5 Implement Step 1 — Income Sources UI
    - Create `lagosfile/ui/pages/wizard_income.py`
    - Render income category cards (Employment, Business, Rental, Dividend, Interest, Capital Gains, Digital Assets, Royalties, Prizes, Other) with "Add More" buttons
    - Render Foreign Income section with currency selector, amount, date, fetched rate (disabled), CBN override field, and compliance notice
    - Render document attachment zone per entry (PDF/JPG/PNG, 100MB limit)
    - _Requirements: 4.1, 4.2, 4.3, 5.1, 5.2, 5.3, 5.4, 5.8_

  - [x] 9.6 Implement Step 2 — Capital Allowances UI
    - Create `lagosfile/ui/pages/wizard_allowances.py`
    - Render asset schedule table with asset type dropdown, cost, date acquired, auto-calculated annual allowance
    - Render total capital allowance claimable summary card (real-time update)
    - Render document upload zone
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.7, 6.8_

  - [x] 9.7 Implement Step 3 — Deductions & Reliefs UI
    - Create `lagosfile/ui/pages/wizard_deductions.py`
    - Render relief cards: Pension (toggle + amount), NHIS, NHF, Rent Relief (auto-calculated display), WHT credits list with "Add Another" button, Life Assurance, Other
    - Display CRA abolition notice
    - Render Deduction Breakdown summary card and Estimated Tax Payable card (real-time)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9_

  - [x] 9.8 Implement Step 4 — Review & Confirm UI
    - Create `lagosfile/ui/pages/wizard_review.py`
    - Call `ComputationEngine.compute()` and render full tax breakdown card
    - Render tax band utilization bar
    - Render Foreign Income Summary block (if applicable)
    - Render minimum tax comparison line with higher amount highlighted
    - Render CGT exemption status if applicable
    - Render incomplete filing warnings
    - Wire "Confirm Filing" to `FilingService.confirm()` and "Save for Later" to `FilingService.save_step()`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9_

  - [x] 9.9 Implement Filing History page
    - Create `lagosfile/ui/pages/history.py`
    - Render metric cards (Total, Submitted, Confirmed, Drafts)
    - Render paginated, filterable filing table with action buttons (View, Duplicate, Export PDF/CSV for Confirmed; Edit, Delete for Draft)
    - Wire Duplicate to `FilingService.duplicate()` and Amend to `FilingService.amend()`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

  - [x] 9.10 Implement Export Modal
    - Create `lagosfile/ui/components/export_modal.py`
    - Render format selector (PDF/CSV/JSON), Include Attachments toggle, Download and Print buttons
    - Display security badges
    - Wire to `ExportEngine` methods
    - _Requirements: 11.6, 11.7_

  - [x] 9.11 Implement Configuration Page UI
    - Create `lagosfile/ui/pages/config.py`
    - Render editable fields for all Tax_Config values, each showing: current value, governing NTA 2025 section, last modified date, modifier
    - Display version label
    - Wire Save to `ConfigEngine.save_config()`, Export to `ConfigEngine.export_json()`, Import to `ConfigEngine.import_json()`
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8_

  - [ ] 9.12 Implement LIRS Integration UI
    - Add "File with LIRS" button on confirmed filing detail screen
    - Wire to `LIRSService.file_with_lirs()`
    - Render Reference Panel (docked) when `AutomationResult.fallback_active` is True
    - Render fallback banner
    - Render "Mark as Submitted" button
    - _Requirements: 12.1, 12.2, 12.4, 12.5, 12.7, 12.8_

  - [ ] 9.13 Final checkpoint — Ensure all tests pass
    - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each property test maps to exactly one Hypothesis `@given` test with `max_examples=100`
- Tag format: `# Feature: lagos-file, Property N: <property_text>`
- All tax rates and thresholds must be read from `TaxConfig` — never hardcoded in `ComputationEngine`
- The encrypted DB is held in-memory for the session; re-encrypted on every write
- Confirmed filings are immutable; amendments create new records with `parent_filing_id`
