import os
from pathlib import Path


class Constants:
    # Base directory for all LagosFile data
    BASE_DIR = Path.home() / "LagosFile"

    # Document root directory
    DOCUMENT_ROOT = BASE_DIR / "documents"

    # Error log file path
    ERROR_LOG = BASE_DIR / "errors.log"

    # Salt file path for encryption
    SALT_FILE = BASE_DIR / "salt.bin"

    # Encrypted database file path
    ENCRYPTED_DB = BASE_DIR / "lagosfile.db.enc"

    # Temporary file path for atomic writes
    TEMP_DB = BASE_DIR / "lagosfile.db.enc.tmp"

    # Ensure base directory exists
    @classmethod
    def ensure_base_dir(cls):
        cls.BASE_DIR.mkdir(parents=True, exist_ok=True)
        cls.DOCUMENT_ROOT.mkdir(parents=True, exist_ok=True)

    # Get document storage path for a specific TIN and YOA
    @classmethod
    def get_document_path(
        cls, tin: str, yoa: int, entry_id: str, entry_type: str
    ) -> Path:
        return cls.DOCUMENT_ROOT / tin / str(yoa) / entry_type / entry_id
