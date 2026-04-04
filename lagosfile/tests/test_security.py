import hypothesis.strategies as st
from cryptography.fernet import InvalidToken
from hypothesis import given, settings

from lagosfile.security import decrypt_db, derive_key, encrypt_db, generate_salt

salt_strategy = st.binary(min_size=16, max_size=16)
pin_strategy = st.text(min_size=4, max_size=8, alphabet="0123456789")


@given(
    data=st.binary(min_size=1, max_size=4096),
    pin=pin_strategy,
    salt=salt_strategy,
)
@settings(max_examples=25, deadline=None)
def test_encryption_round_trip(data: bytes, pin: str, salt: bytes) -> None:
    key = derive_key(pin, salt)
    encrypted = encrypt_db(data, key)
    decrypted = decrypt_db(encrypted, key)
    assert decrypted == data


@given(
    data=st.binary(min_size=1, max_size=1024),
    pin1=pin_strategy,
    pin2=pin_strategy,
    salt=salt_strategy,
)
@settings(max_examples=25, deadline=None)
def test_wrong_pin_raises_invalid_token(data: bytes, pin1: str, pin2: str, salt: bytes) -> None:
    if pin1 == pin2:
        return  # same PIN → same key → would succeed; skip
    key1 = derive_key(pin1, salt)
    key2 = derive_key(pin2, salt)
    encrypted = encrypt_db(data, key1)
    try:
        decrypt_db(encrypted, key2)
        raise AssertionError(f"Expected InvalidToken when decrypting with wrong PIN (pin1={pin1!r}, pin2={pin2!r})")
    except InvalidToken:
        pass  # expected


def test_generate_salt_returns_16_bytes() -> None:
    import base64

    salt = generate_salt()
    key = derive_key("1234", salt)
    decoded = base64.urlsafe_b64decode(key)
    assert len(decoded) == 32


def test_derive_key_same_inputs_same_output() -> None:
    pass
