# Requirements Document

## Introduction

LagosFile is an offline-first desktop application built with Python and Flet that enables Lagos-based individual taxpayers to file Direct Assessment returns under the Nigeria Tax Act (NTA) 2025. The application guides users through a four-step filing wizard covering income sources, capital allowances, deductions and reliefs, and a final review with full tax computation. It supports foreign income conversion at the CBN official rate, maintains an immutable filing history, exports formal tax documents, and optionally initiates submission to the LIRS e-Tax portal. All tax rates, bands, and thresholds are stored in a user-editable Configuration Page so the app remains accurate without a software release when LIRS issues Public Notices.

---

## Glossary

- **NTA 2025**: Nigeria Tax Act 2025, effective 1 January 2026, the governing legislation for all tax computations in this application.
- **YOA**: Year of Assessment — the calendar year in which income was earned (e.g., YOA 2025 = income earned Jan–Dec 2025, due March 31 2026).
- **TIN**: Tax Identification Number — a 13-digit numeric identifier issued by FIRS/LIRS, required for all taxpayers.
- **LIRS**: Lagos Internal Revenue Service — the state tax authority responsible for Direct Assessment.
- **Direct_Assessment**: The self-assessment tax regime for individuals not under PAYE, including self-employed persons, freelancers, and sole traders.
- **CBN**: Central Bank of Nigeria — the official source of exchange rates mandated by Section 20(4) NTA 2025.
- **FX_Rate**: Foreign exchange rate used to convert foreign-currency income to Nigerian Naira.
- **Chargeable_Income**: Total gross income less capital allowances and approved deductions/reliefs — the amount on which tax is computed.
- **WHT**: Withholding Tax — tax deducted at source by a third party, creditable against the taxpayer's final liability.
- **WREN**: WHT credit receivable — the WHT certificate amount claimable as a credit.
- **CRA**: Consolidated Relief Allowance — abolished under NTA 2025 and replaced by Rent Relief.
- **CGT**: Capital Gains Tax — tax on gains from disposal of assets.
- **PFA**: Pension Fund Administrator — an approved pension scheme operator.
- **NHIS**: National Health Insurance Scheme.
- **NHF**: National Housing Fund — administered by the Federal Mortgage Bank of Nigeria.
- **Fernet**: Symmetric encryption scheme from the Python `cryptography` library used for at-rest database encryption.
- **Draft**: A filing that has been started but not yet confirmed by the taxpayer.
- **Confirmed**: A filing that has been reviewed and locked by the taxpayer; immutable thereafter.
- **Submitted**: A confirmed filing for which the taxpayer has initiated the LIRS portal filing action.
- **Tax_Config**: The versioned JSON configuration record containing all tax bands, rates, caps, and thresholds.
- **Filing_Wizard**: The four-step guided interface for creating a new tax filing.
- **FX_Cache**: The local store of previously fetched exchange rates, used when the network is unavailable.
- **Reference_Panel**: The in-app docked panel showing computed values field-by-field when LIRS portal automation fails.
- **App**: The LagosFile desktop application.
- **Computation_Engine**: The module responsible for calculating chargeable income and tax payable from filing data.
- **Export_Engine**: The module responsible for generating PDF, CSV, and JSON exports.
- **Config_Engine**: The module responsible for reading, writing, and versioning the Tax_Config.
- **FX_Service**: The module responsible for resolving foreign exchange rates via the waterfall strategy.

---

## Requirements

### Requirement 1: Taxpayer Profile Management

**User Story:** As a taxpayer, I want to create and persist my profile with my name and TIN so that the app can pre-fill my details on every filing and export.

#### Acceptance Criteria

1. WHEN a user launches the App for the first time with no existing profile, THE App SHALL display a profile creation form requiring Full Name and TIN before any other screen is accessible.
2. WHEN a user submits a TIN that is not exactly 13 numeric digits, THE App SHALL reject the submission and display the message "TIN must be exactly 13 digits (numbers only)."
3. WHEN a user submits a valid profile, THE App SHALL encrypt and persist the profile to local SQLite storage using Fernet encryption keyed to the user's PIN.
4. THE App SHALL provide optional fields for Lagos address, phone number, email address, and filing agent name/company on the profile form.
5. THE App SHALL support exactly one taxpayer profile per installation in v1; no multi-profile switching is available.
6. WHEN a user opens the App with an existing profile, THE App SHALL proceed directly to the Dashboard without showing the profile creation form.
7. WHEN a user edits their profile, THE App SHALL update the persisted record and reflect changes on all subsequent screens and exports.

---

### Requirement 2: Dashboard and Navigation

**User Story:** As a taxpayer, I want a clear dashboard that shows my filing status, upcoming deadlines, and quick access to key actions so that I can manage my tax obligations at a glance.

#### Acceptance Criteria

1. THE App SHALL display a fixed left sidebar containing: the LagosFile logo, navigation links (Dashboard, New Filing, Filing History, Configuration, Settings), and a support card at the bottom.
2. THE App SHALL display a top app bar showing: the current Year of Assessment label, the logged-in user's name and TIN, and a user avatar.
3. WHEN the current date is within 45 days of March 31 of the filing year, THE App SHALL display a countdown banner on the Dashboard showing the number of days remaining until the deadline.
4. WHEN no confirmed filing exists for the current YOA or the immediately preceding YOA, THE App SHALL display a warning alert card on the Dashboard.
5. THE App SHALL display a filing history table on the Dashboard showing: YOA, Status (Draft/Confirmed/Submitted), Tax Payable, and action buttons.
6. THE App SHALL display a "Start New Filing" call-to-action button prominently on the Dashboard.
7. THE App SHALL display quick-access module cards for: Tax Receipts, Tax Calculator, Compliance Status, and Help & Guides.
8. THE App SHALL display a footer on the Dashboard showing the lifetime total tax filed across all confirmed filings.

---

### Requirement 3: Filing Wizard — Initiation and Navigation

**User Story:** As a taxpayer, I want to start a new filing by selecting a Year of Assessment and navigate through a guided four-step wizard so that I complete my return in a structured, error-resistant way.

#### Acceptance Criteria

1. WHEN a user initiates a new filing, THE App SHALL prompt the user to select a Year of Assessment before entering the wizard.
2. THE Filing_Wizard SHALL guide the user through exactly four steps in order: (1) Income Sources, (2) Capital Allowances, (3) Deductions and Reliefs, (4) Review and Confirm.
3. THE App SHALL display a vertical progress stepper on the left side of the wizard showing all four steps, with the current step highlighted and completed steps marked as done.
4. WHEN a user transitions from one wizard step to the next, THE App SHALL auto-save the current step's data as a Draft filing record.
5. WHEN a user closes the App mid-wizard, THE App SHALL preserve all entered data so that the user can resume from the last saved step on next launch.
6. WHEN a user is on any wizard step other than Step 1, THE App SHALL enable a "Back" button that navigates to the previous step without data loss.
7. WHEN a user is on Step 1 (Income Sources), THE App SHALL disable the "Back" button.
8. WHEN a user navigates back to a previous step and modifies data, THE App SHALL re-save the Draft and recalculate any dependent values on subsequent steps.

---

### Requirement 4: Income Sources — Nigerian Income

**User Story:** As a taxpayer, I want to enter all my Nigerian income sources with supporting documents so that my total domestic income is accurately captured.

#### Acceptance Criteria

1. THE App SHALL support entry of the following Nigerian income types: Employment (salary, bonuses, benefits-in-kind), Business/trade income, Rental income, Dividend income, Interest income (including FX differences on securities), Capital gains, Digital/virtual asset gains, Royalties, Prizes/winnings/honoraria/grants, and a free-text "Other" category.
2. WHEN a user enters a benefits-in-kind amount, THE App SHALL auto-calculate the taxable value as 5% of the cost of the benefit, per NTA 2025.
3. THE App SHALL allow the user to add multiple entries per income category (e.g., two rental properties, three employment sources).
4. WHEN a user enters digital/virtual asset transactions that result in a net loss, THE App SHALL restrict that loss to offset only against other digital/virtual asset gains and SHALL NOT apply it against other income categories.
5. WHEN a user enters a capital gain from shares in a Nigerian company, THE App SHALL check whether the proceeds are below ₦150,000,000 AND the gain does not exceed ₦10,000,000 within 12 consecutive months; if both conditions are met, THE App SHALL exclude the gain from chargeable income and display a CGT exemption notice.
6. EACH income entry SHALL support optional attachment of one or more supporting documents (PDF, JPG, PNG).
7. WHEN a user attempts to attach a document larger than 100MB, THE App SHALL reject the file and display the message "File exceeds the 100MB limit. Please attach a smaller file."
8. THE App SHALL store attached documents at the path `~/LagosFile/documents/<TIN>/<YOA>/<entry_id>/`.

---

### Requirement 5: Income Sources — Foreign Income

**User Story:** As a taxpayer with foreign clients, I want to enter foreign-currency income with automatic CBN-rate conversion so that I comply with Section 20(4) of the NTA 2025.

#### Acceptance Criteria

1. WHEN a user flags an income entry as "Foreign Currency Income," THE App SHALL display fields for: source currency (selector), amount in foreign currency, and date of receipt.
2. WHEN a user provides a currency and date of receipt, THE App SHALL attempt to fetch the exchange rate using the FX Rate resolution waterfall: (a) fawazahmed0/exchange-api historical rate, (b) ExchangeRate-API Open Access fallback, (c) cached FX_Cache rate with a "cached — verify" warning, (d) manual entry prompt flagged as "Manually entered."
3. THE App SHALL always display a CBN override rate field alongside the fetched rate, pre-populated with the fetched rate but editable by the user.
4. THE App SHALL display the following persistent compliance notice on every foreign income entry: "Section 20(4) NTA 2025 requires conversion at the CBN official rate. The rate fetched above is a market-rate proxy. Enter the CBN official rate in the override field for full compliance. Check the CBN website for the official rate."
5. WHEN a CBN override rate is entered, THE App SHALL use the override rate for all Naira equivalent calculations for that entry and record the rate source as "CBN Override."
6. WHEN no CBN override is entered, THE App SHALL use the fetched rate and record the rate source as the API name or "Cached" or "Manual" as applicable.
7. THE App SHALL store both the fetched rate and the CBN override rate (if any) in the INCOME_ENTRY record.
8. THE App SHALL support a field for foreign tax paid (Naira equivalent) on each foreign income entry, with document attachment, and SHALL display the note: "Foreign tax paid is recorded for reference only in v1. Formal treaty relief requires a tax advisor."
9. THE App SHALL cache every successfully fetched FX rate in the FX_Cache table with: base currency, quote currency, rate, rate date, source, and fetch timestamp.

---

### Requirement 6: Capital Allowances

**User Story:** As a self-employed taxpayer, I want to claim straight-line capital allowances on my professional equipment so that my taxable income is correctly reduced.

#### Acceptance Criteria

1. THE App SHALL NOT include an initial allowance field; only straight-line annual allowances are supported, per NTA 2025.
2. THE App SHALL provide a dropdown of personal professional asset types including: Computer/Laptop, Router/Networking Equipment, Monitor, Keyboard/Peripherals, Camera/Recording Equipment, Software Licence, and Other.
3. EACH capital allowance entry SHALL capture: asset description, asset type (from dropdown), cost in Naira, date of acquisition, and tax written-down value (auto-calculated).
4. WHEN a prior-year confirmed filing exists for the same asset, THE App SHALL auto-populate the tax written-down value from the prior year's closing written-down value.
5. THE App SHALL calculate the annual allowance amount as: (asset cost × annual allowance rate from Tax_Config) for the asset type.
6. WHEN non-taxable income constitutes 10% or more of total income, THE App SHALL prorate the total capital allowances by the ratio of taxable income to total income.
7. EACH capital allowance entry SHALL support optional attachment of supporting documents (PDF, JPG, PNG) with the same 100MB per-file limit.
8. THE App SHALL display the total capital allowance claimable as a summary card that updates in real time as entries are added or modified.

---

### Requirement 7: Deductions and Reliefs

**User Story:** As a taxpayer, I want to claim all eligible deductions and reliefs so that my chargeable income is correctly reduced before tax is computed.

#### Acceptance Criteria

1. THE App SHALL support the following relief types with dedicated input fields: Pension contributions (PFA), NHIS contributions, NHF contributions, Rent Relief Allowance, WHT credits (WREN), Life assurance premiums, Foreign tax paid (reference only), and Other approved deductions (free-text + amount).
2. THE App SHALL NOT include a Consolidated Relief Allowance (CRA) field and SHALL display the note: "The Consolidated Relief Allowance (CRA) has been abolished under the NTA 2025 and replaced with Rent Relief."
3. WHEN a user enters annual rent paid, THE App SHALL auto-calculate the Rent Relief Allowance as 20% of annual rent paid, capped at ₦500,000, sourcing the cap from Tax_Config.
4. WHEN annual rent paid is ₦0, THE App SHALL automatically exclude the Rent Relief Allowance and display the note: "Rent Relief is not applicable — no rent expense entered."
5. THE App SHALL display the note: "Homeowners cannot claim Rent Relief. LIRS may request a tenancy agreement as supporting documentation."
6. WHEN a user adds a WHT credit entry, THE App SHALL capture: WHT certificate reference number, income type, date of deduction, and amount.
7. THE App SHALL allow multiple WHT credit entries.
8. EACH relief entry SHALL support optional attachment of supporting documents (PDF, JPG, PNG) with the same 100MB per-file limit.
9. THE App SHALL display a Deduction Breakdown summary card and an Estimated Tax Payable card that update in real time as relief entries are added or modified.

---

### Requirement 8: Tax Computation Engine

**User Story:** As a taxpayer, I want the app to compute my exact tax liability under NTA 2025 rules so that I can file an accurate return without needing to know the tax law myself.

#### Acceptance Criteria

1. THE Computation_Engine SHALL compute tax in the following sequence: (a) Total Gross Income = sum of all domestic income + all foreign income converted to Naira; (b) Less Capital Allowances (prorated if applicable); (c) Less all approved deductions and reliefs; (d) = Chargeable Income; (e) Tax on Chargeable Income per NTA 2025 Fourth Schedule bands; (f) Less WHT credits; (g) = Net Tax Payable; (h) Minimum Tax = 1% of Total Gross Income; (i) Final Tax Payable = maximum of Net Tax Payable and Minimum Tax.
2. THE Computation_Engine SHALL read all tax band thresholds, rates, caps, and the minimum tax rate exclusively from the active Tax_Config record and SHALL NOT use any hardcoded values.
3. WHEN the Chargeable Income falls within a tax band, THE Computation_Engine SHALL apply the marginal rate only to the portion of income within that band.
4. THE Computation_Engine SHALL record the Tax_Config version used at the time of computation in the FILING record.
5. WHEN a confirmed filing's Tax_Config version differs from the current active Tax_Config, THE App SHALL display a notice: "This filing was computed under Tax Config [version]. The current config is [version]. The original computation is preserved."
6. THE Computation_Engine SHALL apply the CGT exemption rule: gains from shares in Nigerian companies are excluded from chargeable income if proceeds < ₦150,000,000 AND gain ≤ ₦10,000,000 within 12 consecutive months, with thresholds sourced from Tax_Config.
7. THE Computation_Engine SHALL restrict digital asset losses to offset only against digital asset gains.
8. WHEN the minimum tax rule is uncertain under NTA 2025, THE App SHALL display a flagged notice: "Note: The applicability of the 1% minimum tax rule to individuals under NTA 2025 is unconfirmed. This computation applies the rule as configured. Verify with LIRS or a tax advisor."

---

### Requirement 9: Review and Breakdown Screen

**User Story:** As a taxpayer, I want to see a full line-by-line tax computation breakdown before confirming my filing so that I can verify every figure before it becomes an immutable record.

#### Acceptance Criteria

1. THE App SHALL display a full tax breakdown card showing: Total Gross Income, Total Capital Allowances, Total Deductions and Reliefs, Chargeable Income, tax applied per band (each band shown separately), WHT credit offset, Net Tax Payable, Minimum Tax, and Final Tax Payable.
2. WHEN foreign income entries exist, THE App SHALL display a Foreign Income Summary block showing: each currency used, total foreign amount per currency, FX rate used, rate source, and total Naira equivalent per currency.
3. EACH foreign income line item in the breakdown SHALL show: foreign amount, currency, date of receipt, fetched rate, CBN override rate (if entered), Naira equivalent used, and rate source.
4. WHEN a CGT exemption has been applied, THE App SHALL display the CGT exemption status with the exemption amount and the applicable thresholds.
5. THE App SHALL display a minimum tax comparison line showing: computed graduated tax, 1% minimum tax amount, and which is higher (highlighted).
6. WHEN any required data is missing or incomplete, THE App SHALL display an incomplete filing warning identifying the specific missing items before allowing the user to confirm.
7. THE App SHALL display a visual tax band utilization bar showing the proportion of chargeable income falling in each band.
8. THE App SHALL provide a "Confirm Filing" button that, when clicked, locks the filing as an immutable Confirmed record.
9. THE App SHALL provide a "Save for Later" button that saves the current state as a Draft without confirming.

---

### Requirement 10: Filing History

**User Story:** As a returning taxpayer, I want to view, duplicate, and export all my past filings so that I can reference prior years and build on them for new filings.

#### Acceptance Criteria

1. THE App SHALL display a Filing History page listing all filings with: YOA, Filing Reference (format: LIRS/REF/YYYY/NNNNN), Status (Draft/Confirmed/Submitted), Tax Payable, and action buttons (view, duplicate, export PDF, export CSV).
2. THE App SHALL display four metric cards at the top of the Filing History page: Total Filings, Submitted, Confirmed, Drafts.
3. WHEN a user views a confirmed filing, THE App SHALL display the full breakdown, all attached documents, and all FX rates used, in read-only mode.
4. WHEN a user duplicates a past filing, THE App SHALL create a new Draft filing pre-populated with the prior year's income entries, capital allowance written-down values, and profile data, with the YOA incremented by one.
5. WHEN a user amends a confirmed filing, THE App SHALL create a new amended filing record linked to the original; THE App SHALL NOT overwrite or modify the original confirmed filing.
6. THE App SHALL support filtering and pagination of the filing history table.
7. THE App SHALL display an Export Analysis panel and a Compliance Note card on the Filing History page.
8. THE App SHALL generate a unique Filing Reference in the format LIRS/REF/YYYY/NNNNN for each confirmed filing, where YYYY is the YOA and NNNNN is a zero-padded sequential number.

---

### Requirement 11: Export Engine

**User Story:** As a taxpayer, I want to export my confirmed filing as a PDF, CSV, or JSON so that I can share it with my accountant, submit it to LIRS, or keep it for records.

#### Acceptance Criteria

1. THE Export_Engine SHALL generate a print-ready PDF containing: taxpayer name, TIN, YOA, full tax computation statement, FX summary (if applicable), relief breakdown, and a document attachment index.
2. THE Export_Engine SHALL generate a CSV containing all income and deduction line items with columns for: income type, description, gross amount (NGN), foreign currency, foreign amount, date, fetched FX rate, CBN override rate, Naira equivalent, and rate source.
3. THE Export_Engine SHALL generate a JSON file containing the full filing record including all income entries, capital allowances, relief entries, computed values, and document file paths.
4. ALL exports SHALL include taxpayer name, TIN, and YOA as a header.
5. WHEN a user selects "Include Attachments" on the export modal, THE Export_Engine SHALL include references to all attached document file paths in the PDF attachment index and JSON record.
6. THE App SHALL display an export modal with: a format selector (PDF, CSV, JSON), an Include Attachments toggle, a Download Export button, and a Print button.
7. THE App SHALL display security badges on the export modal: "End-to-end Encrypted" and "LIRS Compliant Generation."

---

### Requirement 12: LIRS Portal Integration

**User Story:** As a taxpayer ready to file, I want the app to help me submit to the LIRS e-Tax portal so that I don't have to manually re-enter all my computed values.

#### Acceptance Criteria

1. THE App SHALL provide an opt-in "File with LIRS" action button on the confirmed filing screen.
2. THE App SHALL display a link to `etax.lirs.gov.ng` for users who need to create a portal account.
3. WHEN a user initiates "File with LIRS," THE App SHALL attempt to use Playwright to launch a browser session and pre-fill Form A fields using the computed filing values.
4. WHEN Playwright automation fails for any reason, THE App SHALL automatically fall back to Reference_Panel mode: open the LIRS portal in the system's default browser and display a docked Reference_Panel inside the App showing all computed values labelled to match Form A section names.
5. WHEN automation fails and Reference_Panel mode is active, THE App SHALL display the banner: "Automatic form filling is currently unavailable. Use the reference panel alongside the portal to complete your filing."
6. THE App SHALL log all automation failures with the failure reason to a local error log file.
7. THE App SHALL NEVER fail silently; if automation is unavailable, Reference_Panel mode SHALL activate automatically.
8. WHEN a user completes portal filing and returns to the App, THE App SHALL allow the user to mark the filing status as "Submitted."

---

### Requirement 13: Configuration Page

**User Story:** As a user, I want to update tax brackets, relief caps, and allowance rates on a Configuration Page so that the app stays accurate when LIRS issues a Public Notice without waiting for a software update.

#### Acceptance Criteria

1. THE App SHALL provide a Configuration Page accessible from the Settings navigation item, allowing in-app editing of: individual tax band thresholds and rates, Rent Relief cap, CGT exemption thresholds, annual capital allowance rates by asset type, minimum tax rate, and any other tax-sensitive threshold used in computation.
2. EACH configuration field SHALL display: current value, the NTA 2025 section that governs it, the date it was last modified, and the modifier (user or system default).
3. WHEN a user saves a configuration change, THE Config_Engine SHALL create a new versioned Tax_Config record and make it the active config for all new filings immediately.
4. WHEN a configuration change is saved, THE App SHALL NOT retroactively alter any confirmed past filing; confirmed filings SHALL remain computed under the Tax_Config version recorded at the time of confirmation.
5. THE App SHALL display a visible version label on the Configuration Page (e.g., "Tax Config v1.0 — NTA 2025, effective 1 Jan 2026").
6. THE Config_Engine SHALL support exporting the active Tax_Config as a JSON file.
7. THE Config_Engine SHALL support importing a Tax_Config from a JSON file, validating the structure before applying it.
8. WHEN an imported Tax_Config JSON fails validation, THE App SHALL reject the import and display a descriptive error message identifying the invalid fields.

---

### Requirement 14: Security and Encryption

**User Story:** As a taxpayer, I want my locally stored tax data to be encrypted and PIN-protected so that my sensitive financial information is secure even if my device is accessed by others.

#### Acceptance Criteria

1. THE App SHALL encrypt the SQLite database at rest using Fernet symmetric encryption from the Python `cryptography` library.
2. THE App SHALL require the user to set a PIN during initial profile creation; this PIN is used to derive the Fernet encryption key.
3. WHEN a user launches the App, THE App SHALL prompt for the PIN before decrypting and accessing any stored data.
4. WHEN an incorrect PIN is entered, THE App SHALL display an error and deny access to the database.
5. THE App SHALL store attached documents in the filesystem path `~/LagosFile/documents/<TIN>/<YOA>/<entry_id>/` and SHALL NOT store document contents in the database.
6. THE App SHALL enforce the 100MB per-file limit at the point of document upload, before writing to disk.

---

### Requirement 15: Deadline Reminders

**User Story:** As a taxpayer, I want to be reminded of the March 31 filing deadline and warned if I have missing filings so that I never miss a submission.

#### Acceptance Criteria

1. WHEN the current date is within 45 days of March 31 of the current filing year, THE App SHALL display a countdown banner on the Dashboard showing the exact number of days remaining.
2. WHEN no confirmed filing exists for the current YOA, THE App SHALL display a warning on the Dashboard.
3. WHEN no confirmed filing exists for the immediately preceding YOA, THE App SHALL display a warning on the Dashboard.
4. THE App SHALL compute deadline proximity and missing filing warnings on every Dashboard load without requiring an internet connection.

---

### Requirement 16: FX Rate Service

**User Story:** As a taxpayer with foreign income, I want the app to automatically fetch the exchange rate for the date I received payment so that I don't have to look it up manually.

#### Acceptance Criteria

1. WHEN fetching an FX rate, THE FX_Service SHALL attempt the resolution waterfall in this exact order: (a) fawazahmed0/exchange-api at `cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@{YYYY-MM-DD}/v1/currencies/{base}.json`; (b) ExchangeRate-API Open Access at `open.er-api.com/v6/latest/{base}`; (c) most recent cached rate from FX_Cache for the same currency pair, displayed with a "cached — verify" warning; (d) manual entry prompt, flagged as "Manually entered" in the filing record.
2. THE FX_Service SHALL use `httpx` with async HTTP calls for all FX API requests.
3. WHEN an FX rate is successfully fetched from an API, THE FX_Service SHALL store it in the FX_Cache table before returning it to the UI.
4. WHEN the App is offline and no cached rate exists for the requested currency pair and date, THE FX_Service SHALL prompt the user to enter the rate manually.
5. THE FX_Service SHALL support fetching historical rates (by date) using the fawazahmed0 API's date-parameterised endpoint.
6. WHEN a cached rate is used, THE App SHALL display the cache date alongside the rate and the warning: "Rate is from cache — please verify against the CBN website."
