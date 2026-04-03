"""
Document service for LagosFile.

Handles file size validation and attaching supporting documents to filing entries.

Requirements: 4.6, 4.7, 4.8, 14.5, 14.6
"""

import shutil
from pathlib import Path

from lagosfile.constants import Constants
from lagosfile.models import Document


# 100MB in bytes — enforced before any disk write (Requirement 14.6)
MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024


class FileTooLargeError(Exception):
    """Raised when an attached file exceeds the 100MB per-file limit.

    Requirement 4.7: display "File exceeds the 100MB limit. Please attach a smaller file."
    """


class DocumentService:
    """Service for validating and attaching supporting documents to filing entries."""

    def validate_size(self, file_path: str) -> None:
        """Check that *file_path* does not exceed 100MB.

        Args:
            file_path: Absolute or relative path to the file to check.

        Raises:
            FileTooLargeError: If the file size exceeds MAX_FILE_SIZE_BYTES.
        """
        size = Path(file_path).stat().st_size
        if size > MAX_FILE_SIZE_BYTES:
            raise FileTooLargeError(
                "File exceeds the 100MB limit. Please attach a smaller file."
            )

    async def attach(
        self,
        entry_id: str,
        entry_type: str,
        file_path: str,
        tin: str,
        yoa: int,
    ) -> Document:
        """Validate, copy, and record a supporting document for a filing entry.

        Steps:
        1. Validate file size (raises FileTooLargeError if > 100MB).
        2. Copy the file to ``~/LagosFile/documents/<TIN>/<YOA>/<entry_id>/``.
        3. Save a ``Document`` ORM record and return it.

        Args:
            entry_id:   UUID string of the parent entry (income, allowance, or relief).
            entry_type: One of ``"income_entry"``, ``"capital_allowance"``, ``"relief_entry"``.
            file_path:  Source path of the file to attach.
            tin:        Taxpayer Identification Number (used to build the storage path).
            yoa:        Year of Assessment (used to build the storage path).

        Returns:
            The saved ``Document`` ORM instance.

        Raises:
            FileTooLargeError: If the file exceeds 100MB.
        """
        # Step 1 — size check before any disk write (Requirement 14.6)
        self.validate_size(file_path)

        source = Path(file_path)
        file_name = source.name
        file_type = source.suffix.lstrip(".").lower()
        file_size_bytes = source.stat().st_size

        # Step 2 — copy to canonical path (Requirements 4.8, 14.5)
        dest_dir: Path = Constants.get_document_path(tin, yoa, entry_id)
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest_path = dest_dir / file_name
        shutil.copy2(str(source), str(dest_path))

        # Step 3 — persist ORM record
        document = await Document.create(
            parent_entry_id=entry_id,
            parent_entry_type=entry_type,
            file_path=str(dest_path),
            file_name=file_name,
            file_type=file_type,
            file_size_bytes=file_size_bytes,
        )

        return document
