from pathlib import Path


class Constants:
    # Base directory for all LagosFile data: ~/LagosFile/
    BASE_DIR = Path.home() / "LagosFile"

    # Document root directory: ~/LagosFile/documents/
    DOCUMENT_ROOT = BASE_DIR / "documents"

    # Error log file path: ~/LagosFile/errors.log
    ERROR_LOG = BASE_DIR / "errors.log"

    # Salt file path for PIN-keyed encryption: ~/LagosFile/.salt
    SALT_FILE = BASE_DIR / ".salt"

    # Encrypted SQLite database path: ~/LagosFile/lagosfile.db.enc
    ENCRYPTED_DB = BASE_DIR / "lagosfile.db.enc"

    # Temporary file path for atomic DB writes
    TEMP_DB = BASE_DIR / "lagosfile.db.enc.tmp"

    @classmethod
    def ensure_dirs(cls) -> None:
        """Create required directories if they do not exist."""
        cls.BASE_DIR.mkdir(parents=True, exist_ok=True)
        cls.DOCUMENT_ROOT.mkdir(parents=True, exist_ok=True)

    @classmethod
    def get_document_path(cls, tin: str, yoa: int, entry_id: str) -> Path:
        """Return the storage path for documents attached to an income/allowance/relief entry.

        Path format: ~/LagosFile/documents/<TIN>/<YOA>/<entry_id>/
        Requirement 4.8, 14.5
        """
        return cls.DOCUMENT_ROOT / tin / str(yoa) / entry_id
