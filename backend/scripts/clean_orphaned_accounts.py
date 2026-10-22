"""
clean_orphaned_accounts.py
==========================
Deletes orphaned org_admin and student user records (where org_id IS NULL)
and their associated dependent database rows.

Usage:
    docker compose exec backend python -m scripts.clean_orphaned_accounts
"""

import asyncio
import os
from pathlib import Path
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

def _get_db_url() -> str:
    env_url = os.getenv("DATABASE_URL")
    if env_url:
        return env_url.replace("postgresql+asyncpg://", "postgresql://")
    env_file = Path(__file__).parent.parent / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("DATABASE_URL="):
                raw = line.split("=", 1)[1].strip()
                return raw.replace("postgresql+asyncpg://", "postgresql://")
    return "postgresql://postgres:postgres@localhost:5432/assessment_db"


async def clean_orphaned_accounts():
    from app.models.user import User, UserRole
    from app.models.quiz import PerformanceSummary, UserStudyPlan, TestResult, QuizSession, CuetEnrollment
    from app.models.notification import Notification
    from app.models.job import JobEvaluation

    db_url = _get_db_url().replace("postgresql://", "postgresql+asyncpg://")
    engine = create_async_engine(db_url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # Find orphaned users (org_admin or student without an org_id)
        stmt = select(User.id).where(
            User.org_id.is_(None),
            User.role.in_([UserRole.org_admin, UserRole.student])
        )
        res = await session.execute(stmt)
        user_ids = res.scalars().all()

        if not user_ids:
            print("✨ No orphaned accounts found. Database is clean!")
            await engine.dispose()
            return

        print(f"🧹 Found {len(user_ids)} orphaned account(s). Cleaning up...")

        # Delete dependent records
        await session.execute(delete(CuetEnrollment).where(CuetEnrollment.user_id.in_(user_ids)))
        await session.execute(delete(PerformanceSummary).where(PerformanceSummary.user_id.in_(user_ids)))
        await session.execute(delete(UserStudyPlan).where(UserStudyPlan.user_id.in_(user_ids)))
        await session.execute(delete(Notification).where(Notification.user_id.in_(user_ids)))
        await session.execute(delete(JobEvaluation).where(JobEvaluation.user_id.in_(user_ids)))

        sess_res = await session.execute(select(QuizSession.id).where(QuizSession.user_id.in_(user_ids)))
        session_ids = sess_res.scalars().all()
        if session_ids:
            await session.execute(delete(TestResult).where(TestResult.session_id.in_(session_ids)))
            await session.execute(delete(QuizSession).where(QuizSession.id.in_(session_ids)))

        await session.execute(delete(TestResult).where(TestResult.user_id.in_(user_ids)))

        # Delete the user records
        await session.execute(delete(User).where(User.id.in_(user_ids)))
        await session.commit()

        print(f"✅ Successfully deleted {len(user_ids)} orphaned account(s) and all dependent data.")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(clean_orphaned_accounts())
