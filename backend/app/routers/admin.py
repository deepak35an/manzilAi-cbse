from typing import List

from fastapi import APIRouter, Depends, UploadFile, File, Form
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
import redis.asyncio as aioredis

from app.dependencies import get_db, get_redis
from app.middleware.auth import require_role
from app.models.user import User
from app.schemas.content import (
    CreateSubfolderRequest,
    SetVisibilityRequest,
    SetSubfolderVisibilityRequest,
    ContentTreeResponse,
    UploadQuestionBankResponse,
)
from app.schemas.org import OrgCreateRequest, OrgUpdateRequest, OrgResponse, AssignAdminRequest
from app.services.content_service import (
    create_subfolder,
    delete_subfolder,
    upload_question_bank,
    set_visibility,
    set_subfolder_visibility,
    get_content_tree,
    get_content_preview,
    delete_question_bank,
)
from app.services.org_service import (
    list_organizations,
    create_organization,
    update_organization,
    toggle_organization,
    assign_organization_admin,
    delete_organization,
)

router = APIRouter()


@router.post("/create-subfolder")
async def create_subfolder_endpoint(
    request: CreateSubfolderRequest,
    user: User = Depends(require_role(["super_admin"])),
):
    return await create_subfolder(request.root_folder, request.subfolder_name)


@router.delete("/delete-subfolder")
async def delete_subfolder_endpoint(
    root_folder: str,
    subfolder_name: str,
    user: User = Depends(require_role(["super_admin"])),
    db: AsyncSession = Depends(get_db),
):
    return await delete_subfolder(root_folder, subfolder_name, db)


@router.post("/upload-question-bank", response_model=UploadQuestionBankResponse)
async def upload_question_bank_endpoint(
    root_folder: str = Form(...),
    subfolder: str = Form(...),
    file: UploadFile = File(...),
    user: User = Depends(require_role(["super_admin"])),
    db: AsyncSession = Depends(get_db),
):
    content = await file.read()
    registry = await upload_question_bank(
        root_folder=root_folder,
        subfolder=subfolder,
        filename=file.filename or "questions.json",
        content=content,
        user_id=str(user.id),
        db=db,
    )
    return UploadQuestionBankResponse(
        id=str(registry.id),
        file_path=registry.file_path,
        title=registry.title,
        question_count=registry.question_count,
        visibility=registry.visibility.value,
    )


@router.post("/set-visibility")
async def set_visibility_endpoint(
    request: SetVisibilityRequest,
    user: User = Depends(require_role(["super_admin"])),
    db: AsyncSession = Depends(get_db),
):
    return await set_visibility(request.registry_id, request.visibility, request.org_ids, db)


@router.post("/set-subfolder-visibility")
async def set_subfolder_visibility_endpoint(
    request: SetSubfolderVisibilityRequest,
    user: User = Depends(require_role(["super_admin"])),
    db: AsyncSession = Depends(get_db),
):
    return await set_subfolder_visibility(
        root_folder=request.root_folder,
        subfolder=request.subfolder,
        visibility=request.visibility,
        org_ids=request.org_ids,
        db=db,
    )



@router.get("/content")
async def get_content_endpoint(
    user: User = Depends(require_role(["super_admin"])),
    db: AsyncSession = Depends(get_db),
):
    return await get_content_tree(db)


@router.get("/content/{registry_id}/preview")
async def preview_content_endpoint(
    registry_id: str,
    user: User = Depends(require_role(["super_admin", "org_admin"])),
    db: AsyncSession = Depends(get_db),
):
    import uuid
    from sqlalchemy import or_
    from fastapi import HTTPException
    from app.models.user import UserRole
    from app.models.content_registry import ContentRegistry, ContentAccess, Visibility

    if user.role == UserRole.org_admin:
        stmt = (
            select(ContentRegistry)
            .outerjoin(ContentAccess)
            .where(
                ContentRegistry.id == uuid.UUID(registry_id),
                or_(
                    ContentRegistry.visibility == Visibility.global_,
                    ContentAccess.org_id == user.org_id
                )
            )
        )
        result = await db.execute(stmt)
        registry = result.scalar_one_or_none()
        if not registry:
            raise HTTPException(status_code=403, detail="Access denied or content not found")

    return await get_content_preview(registry_id, db)


@router.delete("/question-bank/{registry_id}")
async def delete_question_bank_endpoint(
    registry_id: str,
    user: User = Depends(require_role(["super_admin"])),
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    """Permanently delete a question bank file plus all associated data."""
    return await delete_question_bank(registry_id, db, redis)


@router.get("/organizations", response_model=List[OrgResponse])
async def list_organizations_endpoint(
    user: User = Depends(require_role(["super_admin"])),
    db: AsyncSession = Depends(get_db),
):
    return await list_organizations(db)


@router.post("/organizations", response_model=OrgResponse)
async def create_organization_endpoint(
    request: OrgCreateRequest,
    user: User = Depends(require_role(["super_admin"])),
    db: AsyncSession = Depends(get_db),
):
    from fastapi import HTTPException
    from sqlalchemy.orm import selectinload
    from app.models.organization import Organization, Subscription

    if not request.admin_email or not request.admin_email.strip():
        raise HTTPException(status_code=400, detail="Admin email is required")

    org = await create_organization(
        name=request.name,
        slug=request.slug,
        plan="standard",
        db=db,
        admin_phone=request.admin_phone,
        admin_email=request.admin_email.strip(),
        duration_months=request.duration_months,
    )
    # Re-fetch with subscriptions so valid_until is available
    result = await db.execute(
        select(Organization)
        .options(
            selectinload(Organization.users),
            selectinload(Organization.subscriptions),
        )
        .where(Organization.id == org.id)
    )
    org = result.scalar_one()
    from app.models.user import UserRole as UR
    admin = next((u for u in org.users if u.role == UR.org_admin), None)
    sub = max(org.subscriptions, key=lambda s: s.created_at, default=None)
    return OrgResponse(
        id=str(org.id), name=org.name, slug=org.slug,
        is_active=org.is_active, created_at=org.created_at,
        admin_phone=admin.phone if admin else None,
        admin_email=admin.email if admin else None,
        admin_name=admin.name if admin else None,
        valid_until=sub.valid_until if sub else None,
    )


@router.put("/organizations/{org_id}", response_model=OrgResponse)
async def update_organization_endpoint(
    org_id: str,
    request: OrgUpdateRequest,
    user: User = Depends(require_role(["super_admin"])),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy.orm import selectinload
    from app.models.organization import Organization, Subscription

    org = await update_organization(
        org_id=org_id,
        name=request.name,
        is_active=request.is_active,
        config=request.config,
        db=db,
        admin_phone=request.admin_phone,
        admin_email=request.admin_email,
        renew_months=request.renew_months,
    )
    # Re-fetch with relations
    result = await db.execute(
        select(Organization)
        .options(
            selectinload(Organization.users),
            selectinload(Organization.subscriptions),
        )
        .where(Organization.id == org.id)
    )
    org = result.scalar_one()
    from app.models.user import UserRole as UR
    admin = next((u for u in org.users if u.role == UR.org_admin), None)
    sub = max(org.subscriptions, key=lambda s: s.created_at, default=None)
    return OrgResponse(
        id=str(org.id), name=org.name, slug=org.slug,
        is_active=org.is_active, created_at=org.created_at,
        admin_phone=admin.phone if admin else None,
        admin_email=admin.email if admin else None,
        admin_name=admin.name if admin else None,
        valid_until=sub.valid_until if sub else None,
    )


@router.patch("/organizations/{org_id}/toggle", response_model=OrgResponse)
async def toggle_organization_endpoint(
    org_id: str,
    user: User = Depends(require_role(["super_admin"])),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy.orm import selectinload
    from app.models.organization import Organization, Subscription

    org = await toggle_organization(org_id, db)
    # Re-fetch with relations
    result = await db.execute(
        select(Organization)
        .options(
            selectinload(Organization.users),
            selectinload(Organization.subscriptions),
        )
        .where(Organization.id == org.id)
    )
    org = result.scalar_one()
    from app.models.user import UserRole as UR
    admin = next((u for u in org.users if u.role == UR.org_admin), None)
    sub = max(org.subscriptions, key=lambda s: s.created_at, default=None)
    return OrgResponse(
        id=str(org.id), name=org.name, slug=org.slug,
        is_active=org.is_active, created_at=org.created_at,
        admin_phone=admin.phone if admin else None,
        admin_name=admin.name if admin else None,
        valid_until=sub.valid_until if sub else None,
    )


@router.post("/organizations/{org_id}/assign-admin")
async def assign_admin_endpoint(
    org_id: str,
    request: AssignAdminRequest,
    user: User = Depends(require_role(["super_admin"])),
    db: AsyncSession = Depends(get_db),
):
    return await assign_organization_admin(org_id, request.phone, db)


@router.delete("/organizations/{org_id}")
async def delete_organization_endpoint(
    org_id: str,
    user: User = Depends(require_role(["super_admin"])),
    db: AsyncSession = Depends(get_db),
):
    return await delete_organization(org_id, db)


@router.get("/platform-stats")
async def get_platform_stats(
    user: User = Depends(require_role(["super_admin"])),
    db: AsyncSession = Depends(get_db),
):
    """Aggregate platform-wide metrics for the admin dashboard."""
    from app.models.user import User as UserModel
    from app.models.quiz import TestResult, QuizSession, StudyPlanTemplate, UserStudyPlan
    from app.models.organization import Organization
    from app.models.content_registry import ContentRegistry
    from datetime import datetime, timedelta
    from sqlalchemy import select, func, desc, and_
    from app.routers.org import EXAM_DISPLAY, BATCH_LABELS

    now = datetime.utcnow()

    # 1. Total Organizations
    total_org_r = await db.execute(select(func.count(Organization.id)))
    total_organizations = total_org_r.scalar() or 0

    # 2. Total Students (joined with Organization to only count students in existing orgs)
    total_students_r = await db.execute(
        select(func.count(UserModel.id))
        .join(Organization, UserModel.org_id == Organization.id)
        .where(UserModel.role == "student")
    )
    total_students = total_students_r.scalar() or 0

    # 3. Total Exams Uploaded (all question banks in content registry)
    total_content_r = await db.execute(select(func.count(ContentRegistry.id)))
    total_exams_uploaded = total_content_r.scalar() or 0

    # 4. Monthly Active Students (last 30 days)
    thirty_days_ago = now - timedelta(days=30)
    monthly_active_r = await db.execute(
        select(func.count(func.distinct(QuizSession.user_id)))
        .join(UserModel, QuizSession.user_id == UserModel.id)
        .join(Organization, UserModel.org_id == Organization.id)
        .where(UserModel.role == "student", QuizSession.started_at >= thirty_days_ago)
    )
    monthly_active_users = monthly_active_r.scalar() or 0

    # 5. Weekly Active Students (last 7 days)
    seven_days_ago = now - timedelta(days=7)
    weekly_active_r = await db.execute(
        select(func.count(func.distinct(QuizSession.user_id)))
        .join(UserModel, QuizSession.user_id == UserModel.id)
        .join(Organization, UserModel.org_id == Organization.id)
        .where(UserModel.role == "student", QuizSession.started_at >= seven_days_ago)
    )
    weekly_active_users = weekly_active_r.scalar() or 0

    # 6. Tests Given Today (since midnight UTC)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    tests_today_r = await db.execute(
        select(func.count(QuizSession.id))
        .join(UserModel, QuizSession.user_id == UserModel.id)
        .join(Organization, UserModel.org_id == Organization.id)
        .where(UserModel.role == "student", QuizSession.started_at >= today_start)
    )
    tests_today = tests_today_r.scalar() or 0

    # 7. Active Students Chart Data (Daily, Weekly, Monthly)
    # Daily: Last 14 days
    day_col = func.date_trunc('day', QuizSession.started_at)
    res_daily = await db.execute(
        select(day_col.label("day"), func.count(func.distinct(QuizSession.user_id)))
        .join(UserModel, QuizSession.user_id == UserModel.id)
        .join(Organization, UserModel.org_id == Organization.id)
        .where(UserModel.role == "student", QuizSession.started_at >= now - timedelta(days=14))
        .group_by(day_col)
    )
    daily_map = {row.day.date() if isinstance(row.day, datetime) else row.day: row[1] for row in res_daily.all() if row.day}
    daily_chart = []
    for i in range(13, -1, -1):
        d = (now - timedelta(days=i)).date()
        daily_chart.append({
            "label": d.strftime("%b %d"),
            "count": daily_map.get(d, 0)
        })

    # Weekly: Last 12 weeks
    week_col = func.date_trunc('week', QuizSession.started_at)
    res_weekly = await db.execute(
        select(week_col.label("week"), func.count(func.distinct(QuizSession.user_id)))
        .join(UserModel, QuizSession.user_id == UserModel.id)
        .join(Organization, UserModel.org_id == Organization.id)
        .where(UserModel.role == "student", QuizSession.started_at >= now - timedelta(weeks=12))
        .group_by(week_col)
    )
    weekly_map = {row.week.date() if isinstance(row.week, datetime) else row.week: row[1] for row in res_weekly.all() if row.week}
    weekly_chart = []
    for i in range(11, -1, -1):
        dt = now - timedelta(weeks=i)
        monday = (dt - timedelta(days=dt.weekday())).date()
        weekly_chart.append({
            "label": monday.strftime("%b %d"),
            "count": weekly_map.get(monday, 0)
        })

    # Monthly: Last 6 months
    month_col = func.date_trunc('month', QuizSession.started_at)
    res_monthly = await db.execute(
        select(month_col.label("month"), func.count(func.distinct(QuizSession.user_id)))
        .join(UserModel, QuizSession.user_id == UserModel.id)
        .join(Organization, UserModel.org_id == Organization.id)
        .where(UserModel.role == "student", QuizSession.started_at >= now - timedelta(days=180))
        .group_by(month_col)
    )
    monthly_map = {row.month.date() if isinstance(row.month, datetime) else row.month: row[1] for row in res_monthly.all() if row.month}
    monthly_chart = []
    for i in range(5, -1, -1):
        year = now.year
        month = now.month - i
        while month <= 0:
            month += 12
            year -= 1
        m_date = datetime(year, month, 1).date()
        monthly_chart.append({
            "label": m_date.strftime("%b %Y"),
            "count": monthly_map.get(m_date, 0)
        })

    # 8. Most Attempted Exams (Grouped into top-level categories like GATE, CUET)
    exam_name_expr = func.coalesce(StudyPlanTemplate.exam, ContentRegistry.subfolder)
    res_exams = await db.execute(
        select(exam_name_expr.label("exam_name"), func.count(QuizSession.id))
        .select_from(QuizSession)
        .join(UserModel, QuizSession.user_id == UserModel.id)
        .join(Organization, UserModel.org_id == Organization.id)
        .outerjoin(StudyPlanTemplate, QuizSession.plan_id == StudyPlanTemplate.id)
        .outerjoin(ContentRegistry, QuizSession.content_registry_id == ContentRegistry.id)
        .where(UserModel.role == "student")
        .group_by(exam_name_expr)
    )

    category_counts: dict[str, int] = {}
    for raw_name, count in res_exams.all():
        if not raw_name:
            continue
        raw_upper = str(raw_name).strip().upper()
        if raw_upper.startswith("CUET"):
            cat = "CUET"
        elif raw_upper.startswith("GATE"):
            cat = "GATE"
        else:
            cat = EXAM_DISPLAY.get(raw_name, raw_name)
        category_counts[cat] = category_counts.get(cat, 0) + count

    sorted_categories = sorted(category_counts.items(), key=lambda x: x[1], reverse=True)
    most_attempted_exams = [
        {"exam": cat, "attempts": cnt} for cat, cnt in sorted_categories
    ]

    # 9. Most Opted Batches (Includes 3, 6, 9, and 12 Months)
    res_batches = await db.execute(
        select(StudyPlanTemplate.duration_months, func.count(func.distinct(UserStudyPlan.user_id)))
        .select_from(UserStudyPlan)
        .join(StudyPlanTemplate, UserStudyPlan.template_id == StudyPlanTemplate.id)
        .join(UserModel, UserStudyPlan.user_id == UserModel.id)
        .join(Organization, UserModel.org_id == Organization.id)
        .where(UserModel.role == "student")
        .group_by(StudyPlanTemplate.duration_months)
    )
    batch_map = {dur: cnt for dur, cnt in res_batches.all() if dur}
    ALL_BATCH_DURATIONS = [3, 6, 9, 12]
    most_opted_batches = []
    for dur in ALL_BATCH_DURATIONS:
        cnt = batch_map.get(dur, 0)
        batch_label = BATCH_LABELS.get(dur, f"{dur} Months")
        most_opted_batches.append({
            "batch": batch_label,
            "students": cnt
        })
    most_opted_batches.sort(key=lambda x: x["students"], reverse=True)

    return {
        "total_organizations": total_organizations,
        "total_students": total_students,
        "total_exams_uploaded": total_exams_uploaded,
        "monthly_active_users": monthly_active_users,
        "weekly_active_users": weekly_active_users,
        "tests_today": tests_today,
        "active_students_chart": {
            "daily": daily_chart,
            "weekly": weekly_chart,
            "monthly": monthly_chart,
        },
        "most_attempted_exams": most_attempted_exams,
        "most_opted_batches": most_opted_batches,
    }
