"""
credentials.py
==============
Utilities for generating and verifying student login credentials.
"""
import re
import secrets
import string

import bcrypt


import base64
import hashlib
from cryptography.fernet import Fernet
from app.config import settings


def _get_fernet() -> Fernet:
    key = base64.urlsafe_b64encode(hashlib.sha256(settings.JWT_SECRET.encode()).digest())
    return Fernet(key)


def encrypt_password(plain: str) -> str:
    """Encrypt plain text password for admin retrieval."""
    return _get_fernet().encrypt(plain.encode()).decode()


def decrypt_password(cipher: str) -> str:
    """Decrypt encrypted password for admin viewing."""
    try:
        return _get_fernet().decrypt(cipher.encode()).decode()
    except Exception:
        return "••••••••"


def hash_password(plain: str) -> str:
    """Return bcrypt hash of the plain password."""
    pwd_bytes = plain.encode("utf-8")
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a plain password against its bcrypt hash."""
    try:
        pwd_bytes = plain.encode("utf-8")
        hashed_bytes = hashed.encode("utf-8")
        return bcrypt.checkpw(pwd_bytes, hashed_bytes)
    except Exception:
        return False



def _slugify(text: str) -> str:
    """Lowercase, strip non-alphanumeric chars (keep dots replaced by safe chars)."""
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9]", "", text)
    return text


async def generate_username(first_name: str, last_name: str, phone: str, db) -> str:
    """
    Generate a unique username in the format: <first>.<last><last4digits>
    e.g. john.smith4321
    Handles collisions by appending -2, -3, etc.
    """
    from sqlalchemy import select
    from app.models.student_credentials import StudentCredentials

    first = _slugify(first_name) or "user"
    last = _slugify(last_name) or "student"
    digits = re.sub(r"\D", "", phone)[-4:] if phone else "0000"

    base_username = f"{first}.{last}{digits}"

    # Check for collisions
    candidate = base_username
    suffix = 1
    while True:
        result = await db.execute(
            select(StudentCredentials).where(StudentCredentials.username == candidate)
        )
        if result.scalar_one_or_none() is None:
            return candidate
        suffix += 1
        candidate = f"{base_username}-{suffix}"


def generate_password(length: int = 12) -> str:
    """
    Generate a cryptographically secure readable password.
    Contains uppercase, lowercase, digits, and one special character.
    e.g. "Kf8mP#rQv2xN"
    """
    alphabet = string.ascii_letters + string.digits
    special = "!@#$%^&*"

    while True:
        pwd = "".join(secrets.choice(alphabet) for _ in range(length - 1))
        pwd += secrets.choice(special)
        # Shuffle
        pwd_list = list(pwd)
        secrets.SystemRandom().shuffle(pwd_list)
        pwd = "".join(pwd_list)
        # Ensure at least one uppercase, one lowercase, one digit
        if (any(c.isupper() for c in pwd)
                and any(c.islower() for c in pwd)
                and any(c.isdigit() for c in pwd)):
            return pwd


