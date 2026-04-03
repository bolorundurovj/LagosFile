"""
Property-based tests for document storage path construction.

# Feature: lagos-file, Property 8: Document storage path construction
Validates: Requirements 4.8
"""

import string
from pathlib import Path

from hypothesis import given, settings
from hypothesis import strategies as st

from lagosfile.constants import Constants


@given(
    tin=st.text(alphabet=string.digits, min_size=13, max_size=13),
    yoa=st.integers(min_value=2000, max_value=2100),
    entry_id=st.uuids().map(str),
)
@settings(max_examples=25)
def test_document_storage_path_construction(tin: str, yoa: int, entry_id: str) -> None:
    """
    # Feature: lagos-file, Property 8: Document storage path construction

    For any TIN, YOA, and entry_id, the constructed path should equal
    ~/LagosFile/documents/{TIN}/{YOA}/{entry_id}/

    Validates: Requirements 4.8
    """
    expected = Path.home() / "LagosFile" / "documents" / tin / str(yoa) / entry_id
    result = Constants.get_document_path(tin, yoa, entry_id)
    assert result == expected
