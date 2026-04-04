"""
Aerich / TortoiseORM database configuration.

Two configs are provided:
- TORTOISE_ORM_MIGRATIONS: file-based SQLite used by aerich for migration
  generation and CI schema validation.
- TORTOISE_ORM_MEMORY: in-memory SQLite used at runtime (loaded from the
  Fernet-encrypted file after PIN entry).

The runtime app always uses the in-memory config via lagosfile/models/__init__.py.
Aerich reads TORTOISE_ORM from this module (pointed to by aerich.ini).
"""

from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).parent.parent  # repo root
MIGRATIONS_DB = BASE_DIR / "lagosfile_migrations.db"

# ---------------------------------------------------------------------------
# Aerich / migration config  (file-based SQLite)
# ---------------------------------------------------------------------------

TORTOISE_ORM = {
    "connections": {
        "default": f"sqlite://{MIGRATIONS_DB}"
    },
    "apps": {
        "models": {
            "models": ["lagosfile.models", "aerich.models"],
            "default_connection": "default",
        }
    },
}

# Seed-only config — no aerich.models (used by seed.py and tests)
TORTOISE_ORM_SEED = {
    "connections": {
        "default": f"sqlite://{MIGRATIONS_DB}"
    },
    "apps": {
        "models": {
            "models": ["lagosfile.models"],
            "default_connection": "default",
        }
    },
}
