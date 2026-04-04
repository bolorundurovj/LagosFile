"""
PIN-keyed Fernet encryption module for LagosFile.

Provides key derivation, encryption/decryption, salt management,
and atomic file writes for the encrypted SQLite database.

Requirements: 14.1, 14.2, 14.3, 14.4
"""

import base64
import os
from pathlib import Path

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from lagosfile.constants import Constants


def derive_key(pin: str, salt: bytes) -> bytes:
    """Derive a Fernet-compatible encryption key from a PIN and salt.

    Uses PBKDF2-HMAC-SHA256 with 480,000 iterations as specified in the design.

    Args:
        pin: The user's PIN string.
        salt: A 16-byte random salt.

    Returns:
        A URL-safe base64-encoded 32-byte key suitable for use with Fernet.
    """
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=480_000,
    )
    key = kdf.derive(pin.encode("utf-8"))
    return base64.urlsafe_b64encode(key)


def encrypt_db(plaintext_bytes: bytes, fernet_key: bytes) -> bytes:
    """Encrypt database bytes using Fernet symmetric encryption.

    Args:
        plaintext_bytes: The raw SQLite database bytes to encrypt.
        fernet_key: A valid Fernet key (URL-safe base64-encoded 32 bytes).

    Returns:
        Fernet-encrypted ciphertext bytes.
    """
    f = Fernet(fernet_key)
    return f.encrypt(plaintext_bytes)


def decrypt_db(ciphertext: bytes, fernet_key: bytes) -> bytes:
    """Decrypt Fernet-encrypted database bytes.

    Args:
        ciphertext: The encrypted database bytes.
        fernet_key: The Fernet key used for encryption.

    Returns:
        The original plaintext bytes.

    Raises:
        cryptography.fernet.InvalidToken: If the key is wrong or data is corrupted.
    """
    f = Fernet(fernet_key)
    return f.decrypt(ciphertext)


def generate_salt() -> bytes:
    """Generate a new cryptographically random 16-byte salt.

    Returns:
        16 random bytes suitable for use as a PBKDF2 salt.
    """
    return os.urandom(16)


def load_or_create_salt() -> bytes:
    """Load the salt from disk, or generate and persist a new one.

    The salt is stored at ~/LagosFile/.salt. If the file does not exist,
    a new salt is generated and written to that path.

    Returns:
        The 16-byte salt.
    """
    Constants.ensure_dirs()
    salt_path = Constants.SALT_FILE
    if salt_path.exists():
        return salt_path.read_bytes()
    salt = generate_salt()
    salt_path.write_bytes(salt)
    return salt


def atomic_write(data: bytes, final_path: Path) -> None:
    """Write data atomically by writing to a .tmp file then renaming.

    This prevents partial writes from corrupting the encrypted database.

    Args:
        data: The bytes to write.
        final_path: The destination file path.
    """
    final_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = final_path.with_suffix(final_path.suffix + ".tmp")
    try:
        temp_path.write_bytes(data)
        temp_path.replace(final_path)
    except Exception:
        if temp_path.exists():
            temp_path.unlink()
        raise


# ---------------------------------------------------------------------------
# Convenience class — wraps the module-level functions for callers that
# prefer an object-oriented interface (e.g. ProfileService, FilingService).
# ---------------------------------------------------------------------------


class SecurityService:
    """Object-oriented wrapper around the module-level security functions."""

    def __init__(self) -> None:
        self.salt: bytes = load_or_create_salt()

    def derive_key(self, pin: str, salt: bytes | None = None) -> bytes:
        """Derive a Fernet key from a PIN.

        Args:
            pin: The user's PIN.
            salt: Optional salt override; defaults to the instance salt.
        """
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


# Global instance for backward compatibility
security_service = SecurityService()
