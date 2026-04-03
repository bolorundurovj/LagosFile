"""
Property-based test for document file size enforcement.

# Feature: lagos-file, Property 7: Document file size enforcement

Validates: Requirements 4.7

For any file, DocumentService should accept it if and only if its size <= 100 * 1024 * 1024 bytes.
"""

import tempfile
import pytest
from pathlib import Path
from hypothesis import given, settings, HealthCheck
from hypothesis import strategies as st

from lagosfile.services.document_service import DocumentService, FileTooLargeError, MAX_FILE_SIZE_BYTES


@given(file_size=st.integers(min_value=0, max_value=200 * 1024 * 1024))
@settings(max_examples=25, suppress_health_check=[HealthCheck.function_scoped_fixture], deadline=None)
def test_document_file_size_enforcement(file_size):
    """
    Property 7: Document file size enforcement

    Validates: Requirements 4.7

    For any file size in [0, 200MB], DocumentService.validate_size() should:
    - Accept the file (no exception) if and only if size <= MAX_FILE_SIZE_BYTES (100MB)
    - Raise FileTooLargeError if and only if size > MAX_FILE_SIZE_BYTES
    """
    # Use a real temp file of the generated size (tmp_path replaced with tempfile for Hypothesis compatibility)
    with tempfile.TemporaryDirectory() as tmp_dir:
        test_file = Path(tmp_dir) / f"test_file_{file_size}.bin"
        test_file.write_bytes(b"\x00" * file_size)

        svc = DocumentService()

        if file_size <= MAX_FILE_SIZE_BYTES:
            # Must accept — no exception
            svc.validate_size(str(test_file))
        else:
            # Must reject — FileTooLargeError
            with pytest.raises(FileTooLargeError):
                svc.validate_size(str(test_file))
