import os
import shutil
from typing import Optional
from pathlib import Path
from lagosfile.models import Document
from lagosfile.services.base_service import BaseService


class FileTooLargeError(Exception):
    """Exception raised when file size exceeds limit."""

    pass


class DocumentService(BaseService):
    """Document service handling file validation and attachment."""

    MAX_FILE_SIZE_MB = 100  # 100MB limit

    async def validate_size(self, file_path: str) -> None:
        """Validate file size is within limit."""
        file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
        if file_size_mb > self.MAX_FILE_SIZE_MB:
            raise FileTooLargeError(
                f"File size {file_size_mb:.2f}MB exceeds {self.MAX_FILE_SIZE_MB}MB limit"
            )

    async def attach(self, entry_id: int, entry_type: str, file_path: str) -> Document:
        """Attach a document to an entry, copying it to the documents directory."""
        # Validate file size first
        await self.validate_size(file_path)

        # Get the document root directory
        document_root = Path.home() / "LagosFile" / "documents"
        document_root.mkdir(parents=True, exist_ok=True)

        # Create the target directory structure
        # Note: We need taxpayer ID and YOA, but since we don't have that here,
        # we'll use a simplified structure for now
        entry_dir = document_root / str(entry_id)
        entry_dir.mkdir(parents=True, exist_ok=True)

        # Generate target file path
        file_name = Path(file_path).name
        target_path = entry_dir / file_name

        # Copy the file
        shutil.copy2(file_path, target_path)

        # Create and save document record
        document = Document(
            filing_id=entry_id,  # Assuming entry_id is filing_id for now
            file_path=str(target_path),
            document_type=entry_type,
            uploaded_at=datetime.now(),
        )
        await document.save()

        return document

    async def get_document_path(self, document_id: int) -> Optional[str]:
        """Get the file path for a document."""
        document = await Document.get_or_none(id=document_id)
        if document:
            return document.file_path
        return None

    async def delete_document(self, document_id: int) -> bool:
        """Delete a document and its file."""
        document = await Document.get_or_none(id=document_id)
        if document and document.file_path:
            try:
                os.remove(document.file_path)
                await document.delete()
                return True
            except Exception:
                return False
        return False
