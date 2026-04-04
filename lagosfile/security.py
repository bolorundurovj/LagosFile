import base64
import os
from pathlib import Path

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from lagosfile.constants import Constants


def derive_key(pin: str, salt: bytes) -> bytes:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=480_000,
    )
    key = kdf.derive(pin.encode("utf-8"))
    return base64.urlsafe_b64encode(key)


def encrypt_db(plaintext_bytes: bytes, fernet_key: bytes) -> bytes:
    f = Fernet(fernet_key)
    return f.encrypt(plaintext_bytes)


def decrypt_db(ciphertext: bytes, fernet_key: bytes) -> bytes:
    f = Fernet(fernet_key)
    return f.decrypt(ciphertext)


def generate_salt() -> bytes:
    return os.urandom(16)


def load_or_create_salt() -> bytes:
    Constants.ensure_dirs()
    salt_path = Constants.SALT_FILE
    if salt_path.exists():
        return salt_path.read_bytes()
    salt = generate_salt()
    salt_path.write_bytes(salt)
    return salt


def atomic_write(data: bytes, final_path: Path) -> None:
    final_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = final_path.with_suffix(final_path.suffix + ".tmp")
    try:
        temp_path.write_bytes(data)
        temp_path.replace(final_path)
    except Exception:
        if temp_path.exists():
            temp_path.unlink()
        raise


class SecurityService:
    def __init__(self) -> None:
        self.salt: bytes = load_or_create_salt()

    def derive_key(self, pin: str, salt: bytes | None = None) -> bytes:
        return derive_key(pin, salt if salt is not None else self.salt)

    def encrypt_db(self, plaintext_bytes: bytes, fernet_key: bytes) -> bytes:
        return encrypt_db(plaintext_bytes, fernet_key)

    def decrypt_db(self, ciphertext: bytes, fernet_key: bytes) -> bytes:
        return decrypt_db(ciphertext, fernet_key)

    def generate_salt(self) -> bytes:
        return generate_salt()

    def load_or_create_salt(self) -> bytes:
        return load_or_create_salt()

    def atomic_write(self, data: bytes, final_path: Path) -> None:
        atomic_write(data, final_path)


security_service = SecurityService()
