"""
Seed script: create the first super_admin user.

Usage:
    cd backend
    python -m scripts.seed_super_admin --phone 9876543210 --name "Platform Admin"

The script is idempotent — if the user already exists it prints a notice and exits.
"""
import asyncio
import argparse
import sys
from pathlib import Path

# Allow running from the backend/ directory
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.models.user import User, UserRole
from app.utils.helpers import normalize_phone


async def seed(phone: str, name: str) -> None:
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        normalized = normalize_phone(phone)
        result = await session.execute(
            select(User).where(User.phone == normalized, User.role == UserRole.super_admin)
        )
        existing = result.scalar_one_or_none()

        if existing:
            print(f"Super admin already exists: phone={normalized}, id={existing.id}")
            await engine.dispose()
            return

        parts = name.strip().split(None, 1)
        first_name = parts[0] if parts else "Platform"
        last_name = parts[1] if len(parts) > 1 else "Admin"

        admin = User(
            phone=normalized,
            first_name=first_name,
            last_name=last_name,
            role=UserRole.super_admin,
        )
        session.add(admin)
        await session.commit()
        print(f"Super admin created: phone={normalized}, name={admin.name}, id={admin.id}")

    await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Create first super_admin user")
    parser.add_argument("--phone", required=True, help="10-digit phone (e.g. 9876543210)")
    parser.add_argument("--name", default="Platform Admin", help="Display name")
    args = parser.parse_args()
    asyncio.run(seed(args.phone, args.name))
