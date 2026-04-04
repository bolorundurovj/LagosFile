import shutil
from pathlib import Path

from lagosfile.constants import Constants
from lagosfile.models import Document

MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024


class FileTooLargeError(Exception):
    pass


class DocumentService:
    def validate_size(self, file_path: str) -> None:
        size = Path(file_path).stat().st_size
        if size > MAX_FILE_SIZE_BYTES:
            raise FileTooLargeError("File exceeds the 100MB limit. Please attach a smaller file.")

    async def attach(
        self,
        entry_id: str,
        entry_type: str,
        file_path: str,
        tin: str,
        yoa: int,
    ) -> Document:
        self.validate_size(file_path)
        source = Path(file_path)
        file_name = source.name
        file_type = source.suffix.lstrip(".").lower()
        file_size_bytes = source.stat().st_size
        dest_dir: Path = Constants.get_document_path(tin, yoa, entry_id)
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest_path = dest_dir / file_name
        shutil.copy2(str(source), str(dest_path))
        document = await Document.create(
            parent_entry_id=entry_id,
            parent_entry_type=entry_type,
            file_path=str(dest_path),
            file_name=file_name,
            file_type=file_type,
            file_size_bytes=file_size_bytes,
        )
        return document
