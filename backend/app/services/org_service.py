import uuid
import re
from typing import List, Optional
from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from sqlalchemy.orm import selectinload
from fastapi import HTTPException

from app.models.organization import Organization, Subscription
from app.models.user import User, UserRole
from app.utils.logging import logger
from app.utils.helpers import normalize_phone


def _months_to_days(months: int) -> int:
    """Approximate conversion: 1 month ≈ 30 days."""
    return months * 30


def _slug_from_name(name: str) -> str:
    """Auto-generate a URL-safe slug from an org name."""
    slug = name.lower().strip()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    slug = slug.strip("-")
    return slug or "org"


async def list_organizations(db: AsyncSession) -> List[dict]:
    result = await db.execute(
        select(Organization)
        .options(
            selectinload(Organization.users),
            selectinload(Organization.subscriptions),
        )
        .order_by(Organization.created_at.desc())
    )
    orgs = result.scalars().all()

    res = []
    for org in orgs:
        admin = next((u for u in org.users if u.role == UserRole.org_admin), None)
        # Latest subscription
        sub = max(org.subscriptions, key=lambda s: s.created_at, default=None)
        res.append({
            "id": str(org.id),
            "name": org.name,
            "slug": org.slug,
            "is_active": org.is_active,
            "created_at": org.created_at,
            "admin_phone": admin.phone if admin else "Not Assigned",
            "admin_email": admin.email if admin else None,
            "admin_name": admin.name if admin else "Not Assigned",
            "valid_until": sub.valid_until if sub else None,
        })
    return res


async def create_organization(
    name: str,
    slug: Optional[str],
    plan: str,
    db: AsyncSession,
    admin_phone: Optional[str] = None,
    admin_email: Optional[str] = None,
    duration_months: int = 12,
) -> Organization:
    # Auto-generate slug if not provided
    if not slug:
        slug = _slug_from_name(name)

    # Ensure uniqueness of slug (append random suffix if collision)
    base_slug = slug
    for attempt in range(5):
        existing = await db.execute(
            select(Organization).where(
                (Organization.slug == slug) | (Organization.name == name)
            )
        )
        if not existing.scalar_one_or_none():
            break
        if attempt == 0 and existing.scalar_one_or_none():
            # Check if it's just a slug collision (name already taken is a real error)
            name_taken = await db.execute(
                select(Organization).where(Organization.name == name)
            )
            if name_taken.scalar_one_or_none():
                raise HTTPException(status_code=409, detail="Organization with this name already exists")
        slug = f"{base_slug}-{attempt + 1}"
    else:
        raise HTTPException(status_code=409, detail="Could not generate a unique slug")

    org = Organization(
        id=uuid.uuid4(),
        name=name,
        slug=slug,
        is_active=True,
    )
    db.add(org)
    await db.flush()

    valid_until = datetime.utcnow() + timedelta(days=_months_to_days(duration_months))
    sub = Subscription(
        id=uuid.uuid4(),
        org_id=org.id,
        plan=plan,
        valid_until=valid_until,
    )
    db.add(sub)
    await db.flush()

    # Assign admin if phone provided
    if admin_phone:
        await assign_organization_admin(str(org.id), admin_phone, db, email=admin_email)

    logger.info("org_created", org_id=str(org.id), name=name, slug=slug)
    return org


async def update_organization(
    org_id: str,
    name: Optional[str],
    is_active: Optional[bool],
    config: Optional[dict],
    db: AsyncSession,
    admin_phone: Optional[str] = None,
    admin_email: Optional[str] = None,
    renew_months: Optional[int] = None,
) -> Organization:
    result = await db.execute(
        select(Organization)
        .options(
            selectinload(Organization.users),
            selectinload(Organization.subscriptions),
        )
        .where(Organization.id == uuid.UUID(org_id))
    )
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    if name is not None:
        org.name = name
    if is_active is not None:
        org.is_active = is_active
    if config is not None:
        org.config = config

    # Update admin phone & email
    admin = next((u for u in org.users if u.role == UserRole.org_admin), None)
    if admin_phone is not None:
        new_phone = normalize_phone(admin_phone)
        if admin:
            admin.phone = new_phone
        else:
            await assign_organization_admin(org_id, new_phone, db, email=admin_email)
            admin = next((u for u in org.users if u.role == UserRole.org_admin), None)

    if admin_email is not None and admin:
        formatted_email = admin_email.strip().lower() if admin_email.strip() else None
        if formatted_email and formatted_email != admin.email:
            dup = await db.execute(select(User).where(User.email == formatted_email, User.id != admin.id))
            if dup.scalar_one_or_none():
                raise HTTPException(
                    status_code=409,
                    detail=f"Email address '{formatted_email}' is already registered to another account"
                )
        admin.email = formatted_email

    # Renew subscription
    if renew_months is not None:
        sub = max(org.subscriptions, key=lambda s: s.created_at, default=None)
        if sub:
            base_date = max(datetime.utcnow(), sub.valid_until or datetime.utcnow())
            sub.valid_until = base_date + timedelta(days=_months_to_days(renew_months))
        else:
            new_sub = Subscription(
                id=uuid.uuid4(),
                org_id=org.id,
                plan="standard",
                valid_until=datetime.utcnow() + timedelta(days=_months_to_days(renew_months)),
            )
            db.add(new_sub)

    await db.flush()
    logger.info("org_updated", org_id=org_id)
    return org


async def toggle_organization(org_id: str, db: AsyncSession) -> Organization:
    result = await db.execute(select(Organization).where(Organization.id == uuid.UUID(org_id)))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    org.is_active = not org.is_active
    await db.flush()
    logger.info("org_toggled", org_id=org_id, is_active=org.is_active)
    return org


async def assign_organization_admin(org_id: str, phone: str, db: AsyncSession, email: Optional[str] = None) -> dict:
    phone = normalize_phone(phone)
    formatted_email = email.strip().lower() if email and email.strip() else None

    # 1. Verify organization exists
    res = await db.execute(select(Organization).where(Organization.id == uuid.UUID(org_id)))
    org = res.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    # 2. Find or create user
    res = await db.execute(select(User).where(User.phone == phone))
    user = res.scalar_one_or_none()

    # Block: super_admin phone cannot be used for org admin
    super_admin_check = await db.execute(
        select(User).where(User.phone == phone, User.role == UserRole.super_admin)
    )
    if super_admin_check.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail="This phone number belongs to a Super Admin account and cannot be reused for an organization."
        )


    if formatted_email:
        dup = await db.execute(select(User).where(User.email == formatted_email, User.id != (user.id if user else None)))
        if dup.scalar_one_or_none():
            raise HTTPException(
                status_code=409,
                detail=f"Email address '{formatted_email}' is already registered to another account"
            )

    if not user:
        user = User(
            id=uuid.uuid4(),
            phone=phone,
            email=formatted_email,
            first_name="",
            last_name="",
            role=UserRole.org_admin,
            org_id=org.id,
        )
        db.add(user)
    else:
        user.org_id = org.id
        user.role = UserRole.org_admin
        if formatted_email:
            user.email = formatted_email

    await db.flush()
    logger.info("org_admin_assigned", org_id=org_id, user_id=str(user.id), phone=phone)
    return {"message": "Admin assigned successfully", "user_id": str(user.id)}


async def delete_organization(org_id: str, db: AsyncSession) -> dict:
    from sqlalchemy import delete
    from app.models.quiz import PerformanceSummary, UserStudyPlan, TestResult, QuizSession, CuetEnrollment
    from app.models.notification import Notification
    from app.models.job import JobEvaluation

    # 1. Verify organization exists
    res = await db.execute(select(Organization).where(Organization.id == uuid.UUID(org_id)))
    org = res.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    # 2. Delete related subscriptions
    await db.execute(delete(Subscription).where(Subscription.org_id == org.id))

    # 3. Find all users belonging to this organization
    user_res = await db.execute(select(User.id).where(User.org_id == org.id))
    user_ids = user_res.scalars().all()

    if user_ids:
        # Cascade delete all dependent records for users in this organization
        await db.execute(delete(CuetEnrollment).where(CuetEnrollment.user_id.in_(user_ids)))
        await db.execute(delete(PerformanceSummary).where(PerformanceSummary.user_id.in_(user_ids)))
        await db.execute(delete(UserStudyPlan).where(UserStudyPlan.user_id.in_(user_ids)))
        await db.execute(delete(Notification).where(Notification.user_id.in_(user_ids)))
        await db.execute(delete(JobEvaluation).where(JobEvaluation.user_id.in_(user_ids)))

        session_res = await db.execute(select(QuizSession.id).where(QuizSession.user_id.in_(user_ids)))
        session_ids = session_res.scalars().all()
        if session_ids:
            await db.execute(delete(TestResult).where(TestResult.session_id.in_(session_ids)))
            await db.execute(delete(QuizSession).where(QuizSession.id.in_(session_ids)))

        await db.execute(delete(TestResult).where(TestResult.user_id.in_(user_ids)))

        # Delete all user rows belonging to this organization from database
        await db.execute(delete(User).where(User.id.in_(user_ids)))

    # 4. Delete organization row from database
    await db.delete(org)
    await db.flush()

    logger.info("org_deleted", org_id=org_id)
    return {"message": "Organization and associated account records deleted successfully"}
