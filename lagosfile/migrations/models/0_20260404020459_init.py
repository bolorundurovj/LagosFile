from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        CREATE TABLE IF NOT EXISTS "document" (
    "id" CHAR(36) NOT NULL PRIMARY KEY,
    "parent_entry_id" CHAR(36) NOT NULL,
    "parent_entry_type" VARCHAR(30) NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "file_type" VARCHAR(10) NOT NULL,
    "file_size_bytes" INT NOT NULL,
    "uploaded_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "fx_cache" (
    "id" CHAR(36) NOT NULL PRIMARY KEY,
    "base_currency" VARCHAR(3) NOT NULL,
    "quote_currency" VARCHAR(3) NOT NULL,
    "rate" REAL NOT NULL,
    "rate_date" DATE NOT NULL,
    "source" VARCHAR(30) NOT NULL,
    "fetched_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "uid_fx_cache_base_cu_36c436" UNIQUE ("base_currency", "quote_currency", "rate_date", "source")
);
CREATE TABLE IF NOT EXISTS "tax_config" (
    "id" CHAR(36) NOT NULL PRIMARY KEY,
    "version_label" VARCHAR(100) NOT NULL,
    "governed_by" VARCHAR(100) NOT NULL,
    "band_thresholds" JSON NOT NULL,
    "relief_caps" JSON NOT NULL,
    "cgt_thresholds" JSON NOT NULL,
    "allowance_rates" JSON NOT NULL,
    "minimum_tax_rate" REAL NOT NULL,
    "is_active" INT NOT NULL DEFAULT 0,
    "last_modified" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_by" VARCHAR(100) NOT NULL DEFAULT 'system'
);
CREATE TABLE IF NOT EXISTS "taxpayer" (
    "id" CHAR(36) NOT NULL PRIMARY KEY,
    "full_name" VARCHAR(255) NOT NULL,
    "tin" VARCHAR(13) NOT NULL UNIQUE,
    "address" TEXT,
    "phone" VARCHAR(20),
    "email" VARCHAR(255),
    "filing_agent" VARCHAR(255),
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "filing" (
    "id" CHAR(36) NOT NULL PRIMARY KEY,
    "year_of_assessment" INT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'Draft',
    "filing_reference" VARCHAR(30),
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP,
    "total_income_ngn" REAL,
    "chargeable_income" REAL,
    "tax_payable" REAL,
    "wht_credit" REAL,
    "net_tax_payable" REAL,
    "minimum_tax" REAL,
    "final_tax_payable" REAL,
    "tax_config_version" VARCHAR(100) NOT NULL,
    "parent_filing_id" CHAR(36) REFERENCES "filing" ("id") ON DELETE CASCADE,
    "taxpayer_id" CHAR(36) NOT NULL REFERENCES "taxpayer" ("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "capital_allowance" (
    "id" CHAR(36) NOT NULL PRIMARY KEY,
    "asset_description" VARCHAR(255) NOT NULL,
    "asset_type" VARCHAR(50) NOT NULL,
    "asset_cost" REAL NOT NULL,
    "acquisition_date" DATE NOT NULL,
    "tax_written_down_value" REAL NOT NULL,
    "annual_allowance_rate" REAL NOT NULL,
    "annual_allowance_amount" REAL NOT NULL,
    "filing_id" CHAR(36) NOT NULL REFERENCES "filing" ("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "income_entry" (
    "id" CHAR(36) NOT NULL PRIMARY KEY,
    "income_type" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "gross_amount_ngn" REAL NOT NULL,
    "is_foreign" INT NOT NULL DEFAULT 0,
    "foreign_currency" VARCHAR(3),
    "foreign_amount" REAL,
    "income_date" DATE,
    "fx_rate_fetched" REAL,
    "fx_rate_cbn_override" REAL,
    "fx_rate_used" REAL,
    "fx_rate_source" VARCHAR(30),
    "foreign_tax_paid_ngn" REAL,
    "is_cgt_exempt" INT NOT NULL DEFAULT 0,
    "cgt_proceeds" REAL,
    "cgt_gain" REAL,
    "filing_id" CHAR(36) NOT NULL REFERENCES "filing" ("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "relief_entry" (
    "id" CHAR(36) NOT NULL PRIMARY KEY,
    "relief_type" VARCHAR(50) NOT NULL,
    "claimed_amount" REAL NOT NULL,
    "approved_amount" REAL NOT NULL,
    "wht_ref" VARCHAR(100),
    "wht_income_type" VARCHAR(50),
    "wht_date" DATE,
    "filing_id" CHAR(36) NOT NULL REFERENCES "filing" ("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "aerich" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    "version" VARCHAR(255) NOT NULL,
    "app" VARCHAR(100) NOT NULL,
    "content" JSON NOT NULL
);"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        """


MODELS_STATE = (
    "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"
)
