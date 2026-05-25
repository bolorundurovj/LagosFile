PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS taxpayer (
    id              TEXT PRIMARY KEY,
    full_name       TEXT NOT NULL,
    tin             TEXT NOT NULL UNIQUE,
    address         TEXT,
    phone           TEXT,
    email           TEXT,
    filing_agent    TEXT,
    created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS filing (
    id                  TEXT PRIMARY KEY,
    taxpayer_id         TEXT NOT NULL REFERENCES taxpayer(id),
    parent_filing_id    TEXT REFERENCES filing(id),
    year_of_assessment  INTEGER NOT NULL,
    status              TEXT NOT NULL DEFAULT 'Draft',
    filing_reference    TEXT,
    created_at          TEXT NOT NULL,
    confirmed_at        TEXT,
    total_income_ngn    REAL,
    chargeable_income   REAL,
    tax_payable         REAL,
    wht_credit          REAL,
    net_tax_payable     REAL,
    minimum_tax         REAL,
    final_tax_payable   REAL,
    tax_config_version  TEXT NOT NULL DEFAULT 'default'
);

CREATE TABLE IF NOT EXISTS income_entry (
    id                      TEXT PRIMARY KEY,
    filing_id               TEXT NOT NULL REFERENCES filing(id) ON DELETE CASCADE,
    income_type             TEXT NOT NULL,
    description             TEXT,
    gross_amount_ngn        REAL NOT NULL DEFAULT 0,
    is_foreign              INTEGER NOT NULL DEFAULT 0,
    foreign_currency        TEXT,
    foreign_amount          REAL,
    income_date             TEXT,
    fx_rate_fetched         REAL,
    fx_rate_cbn_override    REAL,
    fx_rate_used            REAL,
    fx_rate_source          TEXT,
    foreign_tax_paid_ngn    REAL,
    is_cgt_exempt           INTEGER NOT NULL DEFAULT 0,
    cgt_proceeds            REAL,
    cgt_gain                REAL
);

CREATE TABLE IF NOT EXISTS capital_allowance (
    id                      TEXT PRIMARY KEY,
    filing_id               TEXT NOT NULL REFERENCES filing(id) ON DELETE CASCADE,
    asset_description       TEXT NOT NULL,
    asset_type              TEXT NOT NULL,
    asset_cost              REAL NOT NULL DEFAULT 0,
    acquisition_date        TEXT NOT NULL,
    tax_written_down_value  REAL NOT NULL DEFAULT 0,
    annual_allowance_rate   REAL NOT NULL DEFAULT 0,
    annual_allowance_amount REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS relief_entry (
    id              TEXT PRIMARY KEY,
    filing_id       TEXT NOT NULL REFERENCES filing(id) ON DELETE CASCADE,
    relief_type     TEXT NOT NULL,
    claimed_amount  REAL NOT NULL DEFAULT 0,
    approved_amount REAL NOT NULL DEFAULT 0,
    wht_ref         TEXT,
    wht_income_type TEXT,
    wht_date        TEXT
);

CREATE TABLE IF NOT EXISTS document (
    id                  TEXT PRIMARY KEY,
    parent_entry_id     TEXT NOT NULL,
    parent_entry_type   TEXT NOT NULL,
    file_path           TEXT NOT NULL,
    file_name           TEXT NOT NULL,
    file_type           TEXT NOT NULL,
    file_size_bytes     INTEGER NOT NULL DEFAULT 0,
    uploaded_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fx_cache (
    id              TEXT PRIMARY KEY,
    base_currency   TEXT NOT NULL,
    quote_currency  TEXT NOT NULL,
    rate            REAL NOT NULL,
    rate_date       TEXT NOT NULL,
    source          TEXT NOT NULL,
    fetched_at      TEXT NOT NULL,
    UNIQUE(base_currency, quote_currency, rate_date, source)
);

CREATE TABLE IF NOT EXISTS tax_config (
    id                  TEXT PRIMARY KEY,
    version_label       TEXT NOT NULL,
    governed_by         TEXT NOT NULL,
    bands_json          TEXT NOT NULL,
    relief_caps_json    TEXT NOT NULL,
    cgt_thresholds_json TEXT NOT NULL,
    allowance_rates_json TEXT NOT NULL,
    minimum_tax_rate    REAL NOT NULL,
    is_active           INTEGER NOT NULL DEFAULT 0,
    last_modified       TEXT NOT NULL,
    modified_by         TEXT NOT NULL DEFAULT 'system'
);

-- Seed default NTA 2025 config if none exists
INSERT OR IGNORE INTO tax_config (
    id, version_label, governed_by, bands_json, relief_caps_json,
    cgt_thresholds_json, allowance_rates_json, minimum_tax_rate,
    is_active, last_modified, modified_by
) VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'Tax Config v1.0 — NTA 2025, effective 1 Jan 2026',
    'NTA 2025',
    '[
      {"lower":0,"upper":800000,"rate":0.07},
      {"lower":800000,"upper":2800000,"rate":0.11},
      {"lower":2800000,"upper":6800000,"rate":0.15},
      {"lower":6800000,"upper":18800000,"rate":0.19},
      {"lower":18800000,"upper":38800000,"rate":0.21},
      {"lower":38800000,"upper":null,"rate":0.24}
    ]',
    '{"rentReliefCap":500000,"rentReliefRate":0.20}',
    '{"proceedsThreshold":150000000,"gainThreshold":10000000}',
    '{"computer_laptop":0.25,"router_networking":0.25,"monitor":0.25,"keyboard_peripherals":0.25,"camera_recording":0.25,"software_licence":0.33,"other":0.25}',
    0.01,
    1,
    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
    'system'
);
