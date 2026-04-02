import hypothesis.strategies as st
from hypothesis import given, settings
from cryptography.fernet import InvalidToken
from lagosfile.security import SecurityService, security_service


# Property 25: Encryption round-trip
@given(
    st.binary(min_size=1, max_size=1024),
    st.text(min_size=4, max_size=6, alphabet=st.sampled_from("0123456789")),
)
@settings(max_examples=100)
def test_encryption_round_trip(data: bytes, pin: str):
    """Test that decrypting encrypted data returns the original data"""
    key = security_service.derive_key(pin)
    encrypted = security_service.encrypt_db(data, key)
    decrypted = security_service.decrypt_db(encrypted, key)
    assert decrypted == data


@given(
    st.binary(min_size=1, max_size=1024),
    st.text(min_size=4, max_size=6, alphabet=st.sampled_from("0123456789")),
    st.text(min_size=4, max_size=6, alphabet=st.sampled_from("0123456789")),
)
@settings(max_examples=100)
def test_encryption_with_different_pin(data: bytes, pin1: str, pin2: str):
    """Test that decrypting with a different PIN raises InvalidToken"""
    if pin1 == pin2:
        return  # Skip if pins are the same

    key1 = security_service.derive_key(pin1)
    key2 = security_service.derive_key(pin2)

    encrypted = security_service.encrypt_db(data, key1)

    try:
        security_service.decrypt_db(encrypted, key2)
        assert False, "Expected InvalidToken exception"
    except InvalidToken:
        pass  # Expected behavior
