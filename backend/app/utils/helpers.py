import uuid
import re
from pathlib import Path

from app.config import settings


def generate_uuid() -> str:
    return str(uuid.uuid4())


def is_safe_filename(name: str) -> bool:
    # Validate a filename/folder name is filesystem-safe.
    return bool(re.match(r"^[a-zA-Z0-9][a-zA-Z0-9 _\-\.]{0,98}[a-zA-Z0-9]$", name))


def resolve_content_path(*parts: str) -> Path:
    # Resolve a path within the content storage directory, preventing traversal.
    base = Path(settings.CONTENT_STORAGE_PATH).resolve()
    raw = "/".join(parts).replace("\\", "/")

    # Handle legacy Windows absolute paths stored in DB
    if "/data/" in raw:
        raw = raw.split("/data/", 1)[1]
    elif ":" in raw or raw.startswith("/"):
        clean = [p for p in raw.split("/") if p and ":" not in p]
        raw = "/".join(clean)

    clean_parts = [p for p in raw.split("/") if p and p != ".."]
    target = base.joinpath(*clean_parts).resolve()
    if not str(target).startswith(str(base)):
        # Fallback to file name if traversal check fails
        target = base.joinpath(Path(raw).name).resolve()
    return target


def normalize_phone(phone: str) -> str:
    # Strip non-digits and remove Indian +91/91 prefix for consistency.
    if not phone:
        return ""
    digits = re.sub(r"\D", "", str(phone))
    if len(digits) == 12 and digits.startswith("91"):
        return digits[2:]
    return digits
