"""
Unit tests for DocumentService.

Tests validate_size() and attach() against Requirements 4.6, 4.7, 4.8, 14.5, 14.6.
"""

import uuid
import pytest
import pytest_asyncio
from pathlib import Path
from tortoise import Tortoise

from lagosfile.services.document_service import DocumentService, FileTooLargeError, MAX_FILE_SIZE_BYTES
from lagosfile.models import Document


# ---------------------------------------------------------------------------
# DB fixture
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
async def tortoise_db(tmp_path):
    await Tortoise.init(
        db_url="sqlite://:memory:",
        modules={"models": ["lagosfile.models"]},
    )
    await Tortoise.generate_schemas()
    yield
    await Tortoise.close_connections()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_file(tmp_path: Path, name: str = "receipt.pdf", size_bytes: int = 1024) -> Path:
    """Create a temporary file of the given size."""
    p = tmp_path / name
    p.write_bytes(b"x" * size_bytes)
    return p


# ---------------------------------------------------------------------------
# validate_size tests
# ---------------------------------------------------------------------------

def test_validate_size_accepts_file_at_limit(tmp_path):
    svc = DocumentService()
    f = make_file(tmp_path, size_bytes=MAX_FILE_SIZE_BYTES)
    # Should not raise
    svc.validate_size(str(f))


def test_validate_size_accepts_small_file(tmp_path):
    svc = DocumentService()
    f = make_file(tmp_path, size_bytes=1024)
    svc.validate_size(str(f))


def test_validate_size_rejects_file_over_limit(tmp_path):
    svc = DocumentService()
    f = make_file(tmp_path, size_bytes=MAX_FILE_SIZE_BYTES + 1)
    with pytest.raises(FileTooLargeError):
        svc.validate_size(str(f))


def test_validate_size_error_message(tmp_path):
    svc = DocumentService()
    f = make_file(tmp_path, size_bytes=MAX_FILE_SIZE_BYTES + 1)
    with pytest.raises(FileTooLargeError, match="100MB limit"):
        svc.validate_size(str(f))


# ---------------------------------------------------------------------------
# attach tests
# ---------------------------------------------------------------------------

async def test_attach_copies_file_to_correct_path(tmp_path, monkeypatch):
    """File is copied to ~/LagosFile/documents/<TIN>/<YOA>/<entry_id>/."""
    import lagosfile.constants as const_mod
    monkeypatch.setattr(const_mod.Constants, "DOCUMENT_ROOT", tmp_path / "documents")

    svc = DocumentService()
    src = make_file(tmp_path, name="invoice.pdf", size_bytes=512)

    tin = "1234567890123"
    yoa = 2025
    entry_id = str(uuid.uuid4())

    doc = await svc.attach(entry_id, "income_entry", str(src), tin, yoa)

    expected_dir = tmp_path / "documents" / tin / str(yoa) / entry_id
    assert expected_dir.exists()
    assert (expected_dir / "invoice.pdf").exists()
    assert doc.file_path == str(expected_dir / "invoice.pdf")


async def test_attach_saves_document_record(tmp_path, monkeypatch):
    """A Document ORM record is created with correct metadata."""
    import lagosfile.constants as const_mod
    monkeypatch.setattr(const_mod.Constants, "DOCUMENT_ROOT", tmp_path / "documents")

    svc = DocumentService()
    src = make_file(tmp_path, name="contract.png", size_bytes=2048)

    entry_id = str(uuid.uuid4())
    doc = await svc.attach(entry_id, "capital_allowance", str(src), "9876543210987", 2024)

    assert doc.file_name == "contract.png"
    assert doc.file_type == "png"
    assert doc.file_size_bytes == 2048
    assert str(doc.parent_entry_id) == entry_id
    assert doc.parent_entry_type == "capital_allowance"

    # Verify it's persisted in the DB
    fetched = await Document.get(id=doc.id)
    assert fetched.file_name == "contract.png"


async def test_attach_raises_before_copying_if_too_large(tmp_path, monkeypatch):
    """FileTooLargeError is raised before any file is written to disk."""
    import lagosfile.constants as const_mod
    dest_root = tmp_path / "documents"
    monkeypatch.setattr(const_mod.Constants, "DOCUMENT_ROOT", dest_root)

    svc = DocumentService()
    src = make_file(tmp_path, name="huge.pdf", size_bytes=MAX_FILE_SIZE_BYTES + 1)

    with pytest.raises(FileTooLargeError):
        await svc.attach(str(uuid.uuid4()), "income_entry", str(src), "1111111111111", 2025)

    # Nothing should have been written
    assert not dest_root.exists() or not any(dest_root.rglob("huge.pdf"))
