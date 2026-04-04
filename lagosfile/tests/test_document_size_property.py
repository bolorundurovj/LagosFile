import tempfile
from pathlib import Path

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from lagosfile.services.document_service import (
    MAX_FILE_SIZE_BYTES,
    DocumentService,
    FileTooLargeError,
)


@given(file_size=st.integers(min_value=0, max_value=200 * 1024 * 1024))
@settings(
    max_examples=25,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
    deadline=None,
)
def test_document_file_size_enforcement(file_size):
    with tempfile.TemporaryDirectory() as tmp_dir:
        test_file = Path(tmp_dir) / f"test_file_{file_size}.bin"
        test_file.write_bytes(b"\x00" * file_size)
        svc = DocumentService()
        if file_size <= MAX_FILE_SIZE_BYTES:
            svc.validate_size(str(test_file))
        else:
            with pytest.raises(FileTooLargeError):
                svc.validate_size(str(test_file))
