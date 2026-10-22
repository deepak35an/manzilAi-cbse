"""
generate_credentials_for_existing_students.py
==============================================
One-time migration script: generates username + password for all existing
students who do not yet have a StudentCredentials record.

Usage:
    docker compose exec backend python -m scripts.generate_credentials_for_existing_students
"""
import asyncio
import os
import uuid
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker


def _get_db_url() -> str:
    env_url = os.getenv("DATABASE_URL")
    if env_url:
        return env_url.replace("postgresql://", "postgresql+asyncpg://")
    env_file = Path(__file__).parent.parent / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("DATABASE_URL="):
                raw = line.split("=", 1)[1].strip()
                return raw if "+asyncpg" in raw else raw.replace("postgresql://", "postgresql+asyncpg://")
    return "postgresql+asyncpg://postgres:postgres@localhost:5432/assessment_db"


async def _generate_unique_username(first_name: str, last_name: str, phone: str, session: AsyncSession, existing_usernames: set) -> str:
    import re
    def slugify(text: str) -> str:
        return re.sub(r"[^a-z0-9]", "", text.lower().strip())

    first = slugify(first_name) or "user"
    last = slugify(last_name) or "student"
    digits = re.sub(r"\D", "", phone)[-4:] if phone else "0000"
    base = f"{first}.{last}{digits}"

    candidate = base
    suffix = 1
    while candidate in existing_usernames:
        suffix += 1
        candidate = f"{base}-{suffix}"
    existing_usernames.add(candidate)
    return candidate


async def main():
    from app.models.user import User, UserRole
    from app.models.student_credentials import StudentCredentials
    from app.utils.credentials import generate_password, hash_password, encrypt_password

    db_url = _get_db_url()
    engine = create_async_engine(db_url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        students_res = await session.execute(select(User).where(User.role == UserRole.student))
        students = students_res.scalars().all()

        creds_res = await session.execute(select(StudentCredentials))
        creds_list = creds_res.scalars().all()
        creds_by_user_id = {c.user_id: c for c in creds_list}
        existing_usernames = {c.username for c in creds_list}

        results = []
        for student in students:
            creds = creds_by_user_id.get(student.id)
            if not creds:
                username = await _generate_unique_username(
                    student.first_name, student.last_name, student.phone, session, existing_usernames
                )
                plain_pwd = generate_password()
                creds = StudentCredentials(
                    id=uuid.uuid4(),
                    user_id=student.id,
                    username=username,
                    hashed_password=hash_password(plain_pwd),
                    encrypted_password=encrypt_password(plain_pwd),
                )
                session.add(creds)
                results.append((student.name, student.email, username, plain_pwd))
            elif not creds.encrypted_password:
                # Student has credentials but missing encrypted_password -> regenerate password so admin can view
                new_pwd = generate_password()
                creds.hashed_password = hash_password(new_pwd)
                creds.encrypted_password = encrypt_password(new_pwd)
                results.append((student.name, student.email, creds.username, new_pwd))

        await session.commit()

        print(f"\n✅ Updated credentials for {len(results)} students:\n")
        print(f"{'Name':<25} {'Email':<30} {'Username':<25} {'Password'}")
        print("-" * 100)
        for name, email, uname, pwd in results:
            print(f"{name:<25} {(email or '-'):<30} {uname:<25} {pwd}")

        if not results:
            print("✨ All students already have credentials and encrypted passwords. Nothing to do.")

    await engine.dispose()



if __name__ == "__main__":
    asyncio.run(main())
