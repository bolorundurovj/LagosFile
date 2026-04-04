from pathlib import Path

BASE_DIR = Path(__file__).parent.parent  # repo root
MIGRATIONS_DB = BASE_DIR / "lagosfile_migrations.db"
TORTOISE_ORM = {
    "connections": {"default": f"sqlite://{MIGRATIONS_DB}"},
    "apps": {
        "models": {
            "models": ["lagosfile.models", "aerich.models"],
            "default_connection": "default",
        }
    },
}
TORTOISE_ORM_SEED = {
    "connections": {"default": f"sqlite://{MIGRATIONS_DB}"},
    "apps": {
        "models": {
            "models": ["lagosfile.models"],
            "default_connection": "default",
        }
    },
}
