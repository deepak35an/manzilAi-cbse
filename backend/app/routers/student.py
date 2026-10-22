import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

import redis.asyncio as aioredis
from app.dependencies import get_db, get_redis
from app.middleware.auth import require_role, get_current_user
from app.models.user import User
from app.models.quiz import QuizSession, TestResult, PerformanceSummary
from app.models.content_registry import ContentRegistry, ContentAccess, Visibility
from app.models.notification import Notification
from app.schemas.content import ContentRegistryResponse
from app.services.performance_service import get_strengths_weaknesses

router = APIRouter()


async def _get_target_template_ids(\
    plan_id: str,
    user_id: uuid.UUID,
    db: AsyncSession,
) -> tuple[list[uuid.UUID], Optional[object]]:
    """
    Given a plan_id string and user_id, resolve:
    1. target_template_ids: list of StudyPlanTemplate UUIDs covering this exam journey.
       - For GATE/single-subject: [plan_uuid]
       - For CUET: all enrolled subject template UUIDs sharing the same duration_months.
    2. user_study_plan: UserStudyPlan ORM object if found (used for plan_info block).
    """
    from app.models.quiz import UserStudyPlan, CuetEnrollment
    from sqlalchemy.orm import joinedload

    try:
        plan_uuid = uuid.UUID(plan_id)
    except ValueError:
        return [], None

    plan_q = await db.execute(
        select(UserStudyPlan)
        .options(joinedload(UserStudyPlan.template))
        .where(UserStudyPlan.user_id == user_id, UserStudyPlan.template_id == plan_uuid)
    )
    up = plan_q.scalar_one_or_none()
    if not up:
        return [plan_uuid], None

    template = up.template
    is_cuet = template.exam.startswith("CUET_") or template.exam == "CUET"

    if is_cuet:
        cuet_q = await db.execute(
            select(CuetEnrollment)
            .where(
                CuetEnrollment.user_id == user_id,
                CuetEnrollment.duration_months == template.duration_months,
            )
        )
        cuet_enrollments = cuet_q.scalars().all()
        if cuet_enrollments:
            return [e.template_id for e in cuet_enrollments], up

    return [plan_uuid], up



@router.get("/dashboard")
async def student_dashboard(
    plan_id: Optional[str] = None,
    user: User = Depends(require_role(["student"])),
    db: AsyncSession = Depends(get_db),
):
    target_tmpl_ids: list[uuid.UUID] = []
    allowed_subjs: list[str] = []
    up_obj = None

    if plan_id:
        target_tmpl_ids, up_obj = await _get_target_template_ids(plan_id, user.id, db)

    # ── 1. Calculate stats (plan-scoped if plan_id given, else all) ──────────
    if target_tmpl_ids:
        plan_results_q = await db.execute(
            select(TestResult)
            .join(QuizSession, TestResult.session_id == QuizSession.id)
            .where(
                TestResult.user_id == user.id,
                QuizSession.plan_id.in_(target_tmpl_ids),
            )
            .order_by(TestResult.created_at.desc())
        )
        all_records = plan_results_q.scalars().all()
    else:
        all_results_q = await db.execute(
            select(TestResult)
            .where(TestResult.user_id == user.id)
            .order_by(TestResult.created_at.desc())
        )
        all_records = all_results_q.scalars().all()

    total_tests = len(all_records)
    avg_score = (
        round(
            sum((r.total_score / r.max_score * 100) for r in all_records if r.max_score > 0)
            / max(1, sum(1 for r in all_records if r.max_score > 0)),
            2
        )
        if all_records else 0.0
    )
    latest_theta = all_records[0].theta_final if all_records else 0.0

    # ── 2. Recent results (plan-scoped if plan_id given, else all) ───────────
    recent_stmt = (
        select(TestResult, ContentRegistry.title, QuizSession.week_number, QuizSession.plan_id, QuizSession.test_number)
        .join(QuizSession, TestResult.session_id == QuizSession.id)
        .outerjoin(ContentRegistry, QuizSession.content_registry_id == ContentRegistry.id)
        .where(TestResult.user_id == user.id)
    )
    if target_tmpl_ids:
        recent_stmt = recent_stmt.where(QuizSession.plan_id.in_(target_tmpl_ids))

    plan_info = None
    if up_obj:
        up = up_obj
        is_cuet = up.template.exam.startswith("CUET_") or up.template.exam == "CUET"
        total_weeks = up.template.duration_months * 4
        next_week = up.current_week

        if is_cuet:
            from app.models.quiz import CuetEnrollment
            from sqlalchemy.orm import joinedload
            cuet_q = await db.execute(
                select(CuetEnrollment)
                .options(joinedload(CuetEnrollment.template))
                .where(
                    CuetEnrollment.user_id == user.id,
                    CuetEnrollment.duration_months == up.template.duration_months,
                )
            )
            cuet_enrollments = cuet_q.scalars().all()

            done_q = await db.execute(
                select(QuizSession).where(
                    QuizSession.user_id == user.id,
                    QuizSession.plan_id.in_(target_tmpl_ids),
                    QuizSession.week_number == next_week,
                    QuizSession.completed_at.isnot(None),
                )
            )
            next_test_number = len(done_q.scalars().all()) + 1

            import json as json_mod
            combined_topics: list[str] = []
            for e in (cuet_enrollments or [up]):
                tmpl = e.template if hasattr(e, 'template') else up.template
                try:
                    raw = tmpl.plan.strip()
                    if raw.startswith("```"):
                        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
                    plan_obj = json_mod.loads(raw)
                    week_data = next(
                        (w for w in plan_obj.get("roadmap", []) if w.get("week") == next_week),
                        None,
                    )
                    if week_data:
                        for s in week_data.get("subjects", []):
                            if s.get("topic") and s.get("topic") not in combined_topics:
                                combined_topics.append(s.get("topic"))
                except Exception:
                    pass

            from app.services.performance_service import exam_key_to_canonical_subject
            cuet_subjects = [
                {
                    "plan_id": str(e.template_id),
                    "exam": e.template.exam,
                    "label": exam_key_to_canonical_subject(e.template.exam),
                }
                for e in (cuet_enrollments or [])
            ]

            plan_info = {
                "exam_name": "CUET",
                "is_cuet": True,
                "duration_months": up.template.duration_months,
                "current_week": up.current_week,
                "total_weeks": total_weeks,
                "cuet_subjects": cuet_subjects,
                "upcoming_test": {
                    "week_number": next_week,
                    "test_number": next_test_number,
                    "topics": combined_topics,
                    "label": f"W-{next_week} Test {next_test_number}",
                },
            }
        else:
            done_q = await db.execute(
                select(QuizSession).where(
                    QuizSession.user_id == user.id,
                    QuizSession.plan_id == up.template_id,
                    QuizSession.week_number == next_week,
                    QuizSession.completed_at.isnot(None),
                )
            )
            next_test_number = len(done_q.scalars().all()) + 1

            week_topics: list[str] = []
            try:
                import json as json_mod
                raw = up.template.plan.strip()
                if raw.startswith("```"):
                    raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
                plan_obj = json_mod.loads(raw)
                week_data = next(
                    (w for w in plan_obj.get("roadmap", []) if w.get("week") == next_week),
                    None,
                )
                if week_data:
                    week_topics = [
                        s.get("topic", "")
                        for s in week_data.get("subjects", [])
                        if s.get("topic")
                    ]
            except Exception:
                pass

            plan_info = {
                "exam_name": up.template.exam,
                "is_cuet": False,
                "current_week": up.current_week,
                "total_weeks": total_weeks,
                "upcoming_test": {
                    "week_number": next_week,
                    "test_number": next_test_number,
                    "topics": week_topics,
                    "label": f"W-{next_week} Test {next_test_number}",
                },
            }

    recent_q = await db.execute(
        recent_stmt.order_by(TestResult.created_at.desc()).limit(10)
    )
    recent_records = recent_q.all()

    # ── 3. Topic summaries (plan-scoped by plan_id exact match) ─────────────
    summaries_stmt = select(PerformanceSummary).where(PerformanceSummary.user_id == user.id)
    if target_tmpl_ids:
        summaries_stmt = summaries_stmt.where(PerformanceSummary.plan_id.in_(target_tmpl_ids))
    summaries_q = await db.execute(summaries_stmt)
    summaries = summaries_q.scalars().all()

    base_response = {
        "total_tests": total_tests,
        "avg_score": avg_score,
        "current_theta": latest_theta,
        "recent_results": [
            {
                "id": str(r[0].id),
                "session_id": str(r[0].session_id),
                "total_score": r[0].total_score,
                "max_score": r[0].max_score,
                "theta_final": r[0].theta_final,
                "created_at": r[0].created_at.isoformat(),
                "week_number": r[2],   # from QuizSession
                "plan_id": str(r[3]) if r[3] else None,  # from QuizSession
                "test_number": r[4],   # from QuizSession
                "exam_title": r[1] or "General Assessment",
                "test_name": (
                    f"W-{r[2]} Test {r[4] or 1}"
                    if r[2]
                    else (r[1] or "General Assessment")
                ),
            }
            for r in recent_records
        ],
        "topic_performance": [
            {
                "subject": s.subject,
                "avg_theta": s.avg_theta,
                "total_attempts": s.total_attempts,
                "weak_topics": s.weak_topics,
            }
            for s in summaries
        ],
    }

    if plan_info:
        base_response.update(plan_info)

    return base_response


@router.get("/history")
async def student_history(
    plan_id: Optional[str] = None,
    limit: int = 20,
    offset: int = 0,
    user: User = Depends(require_role(["student"])),
    db: AsyncSession = Depends(get_db),
):
    target_tmpl_ids: list[uuid.UUID] = []
    if plan_id:
        target_tmpl_ids, _ = await _get_target_template_ids(plan_id, user.id, db)

    base_stmt = (
        select(TestResult, QuizSession)
        .join(QuizSession, TestResult.session_id == QuizSession.id)
        .where(TestResult.user_id == user.id)
    )
    if target_tmpl_ids:
        base_stmt = base_stmt.where(QuizSession.plan_id.in_(target_tmpl_ids))


    count_q = await db.execute(
        select(func.count()).select_from(base_stmt.subquery())
    )
    total = count_q.scalar() or 0

    results_q = await db.execute(
        base_stmt.order_by(TestResult.created_at.desc()).offset(offset).limit(limit)
    )
    rows = results_q.all()

    items = []
    for r, sess in rows:
        details = r.details or {}
        responses = details.get("responses", [])
        attempted = details.get("answered", len(responses))
        # Scores are on a per-question scale (e.g. 10 pts each); count > 0 as correct
        correct = sum(1 for resp in responses if resp.get("score", 0) > 0)
        accuracy = correct / attempted if attempted > 0 else 0.0
        mode = details.get("mode", "Mixed")
        items.append({
            "id": str(r.id),
            "session_id": str(r.session_id),
            "total_score": r.total_score,
            "max_score": r.max_score,
            "theta_final": r.theta_final,
            "ai_summary": r.ai_summary,
            "details": r.details,
            "created_at": r.created_at.isoformat(),
            "test_name": f"W-{sess.week_number} Test {sess.test_number or 1}" if sess.week_number else f"{mode.upper()} Evaluation",
            "topic": mode.capitalize(),
            "question_count": attempted,
            "accuracy": round(accuracy, 3),
            "week_number": sess.week_number,
            "test_number": sess.test_number,
            "plan_id": str(sess.plan_id) if sess.plan_id else None,
        })

    return {"total": total, "results": items}



@router.get("/question-banks", response_model=List[ContentRegistryResponse])
async def list_student_question_banks(
    user: User = Depends(require_role(["student"])),
    db: AsyncSession = Depends(get_db),
):
    # Select content that is either global OR specifically assigned to the student's organization
    stmt = (
        select(ContentRegistry)
        .outerjoin(ContentAccess)
        .where(
            or_(
                ContentRegistry.visibility == Visibility.global_,
                ContentAccess.org_id == user.org_id
            )
        )
        .distinct()
    )
    
    result = await db.execute(stmt)
    records = result.scalars().all()
    
    return [
        ContentRegistryResponse(
            id=str(r.id),
            file_path=r.file_path,
            root_folder=r.root_folder.value,
            subfolder=r.subfolder,
            title=r.title,
            subject=r.subject,
            source_type=r.source_type.value,
            question_count=r.question_count,
            visibility=r.visibility.value,
            created_at=r.created_at,
        )
        for r in records
    ]
@router.get("/pyq-exams")
async def get_pyq_exams_endpoint(
    user: User = Depends(require_role(["student", "super_admin", "org_admin"])),
    db: AsyncSession = Depends(get_db),
):
    from app.models.content_registry import SourceType
    
    # Get unique subfolders for PYQ content
    if user.role.value == "super_admin":
        stmt = select(ContentRegistry.subfolder).where(ContentRegistry.source_type == SourceType.pyq)
    else:
        stmt = (
            select(ContentRegistry.subfolder)
            .outerjoin(ContentAccess)
            .where(
                ContentRegistry.source_type == SourceType.pyq,
                or_(
                    ContentRegistry.visibility == Visibility.global_,
                    ContentAccess.org_id == user.org_id
                )
            )
        )
    
    result = await db.execute(stmt)
    exams = sorted(list(set(r for r in result.scalars().all() if r)))

    # Intersect with student's allocated exams if the org has set a restriction
    if user.role.value == "student":
        allocated = (user.metadata_ or {}).get("allocated_exams", [])
        if allocated:
            allocated_set = set(allocated)
            if "CUET" in allocated_set:
                allocated_set.add("CUET_PYQ")
            if "CUET_PYQ" in allocated_set:
                allocated_set.add("CUET")
            exams = [e for e in exams if e in allocated_set]

    return exams


@router.get("/pyq-subtopics")
async def get_pyq_subtopics_endpoint(
    exam: str = None,
    user: User = Depends(require_role(["student", "super_admin", "org_admin"])),
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    from app.models.content_registry import SourceType
    from app.services.question_service import get_pyq_subtopics
    
    # 1. Get all PYQ registries accessible to this user
    # If super_admin, they see everything. If student/org_admin, they see global + their org.
    if user.role.value == "super_admin":
        stmt = select(ContentRegistry).where(ContentRegistry.source_type == SourceType.pyq)
        if exam:
            stmt = stmt.where(ContentRegistry.subfolder == exam)
    else:
        stmt = (
            select(ContentRegistry)
            .outerjoin(ContentAccess)
            .where(
                ContentRegistry.source_type == SourceType.pyq,
                or_(
                    ContentRegistry.visibility == Visibility.global_,
                    ContentAccess.org_id == user.org_id
                )
            )
        )
        if exam:
            stmt = stmt.where(ContentRegistry.subfolder == exam)
        
        stmt = stmt.distinct()
    result = await db.execute(stmt)
    records = result.scalars().all()
    
    # 2. Convert to dict for service
    registries = [
        {"id": str(r.id), "file_path": r.file_path}
        for r in records
    ]
    
    # 3. Aggregate subtopics
    subtopics = await get_pyq_subtopics(registries, redis)
    return subtopics


@router.get("/performance")
async def get_student_performance(
    plan_id: Optional[str] = None,
    user: User = Depends(require_role(["student", "super_admin", "org_admin"])),
    db: AsyncSession = Depends(get_db),
):
    """
    Return top-5 strengths and top-5 weaknesses for the current student.
    Plan-scoped by exact plan_id match when plan_id is provided.
    """
    plan_ids: list[uuid.UUID] = []
    if plan_id:
        plan_ids, _ = await _get_target_template_ids(plan_id, user.id, db)

    result = await get_strengths_weaknesses(user_id=user.id, db=db, plan_ids=plan_ids or None)
    return result


# ── Context ───────────────────────────────────────────────────────────────────

class StudentContextRequest(BaseModel):
    active_plan_id: Optional[str] = None
    active_center: Optional[str] = None  # "exam" | "job"


@router.patch("/context")
async def update_student_context(
    body: StudentContextRequest,
    user: User = Depends(require_role(["student"])),
    db: AsyncSession = Depends(get_db),
):
    """Persist active exam plan / center selection to user metadata."""
    metadata = dict(user.metadata_ or {})
    if body.active_plan_id is not None:
        metadata["active_plan_id"] = body.active_plan_id
    if body.active_center is not None:
        metadata["active_center"] = body.active_center
    user.metadata_ = metadata
    await db.commit()
    return {"status": "ok", "metadata": metadata}


# ── Notifications ─────────────────────────────────────────────────────────────

@router.get("/notifications")
async def get_notifications(
    user: User = Depends(require_role(["student"])),
    db: AsyncSession = Depends(get_db),
    limit: int = 20,
):
    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )
    notifications = result.scalars().all()
    return [
        {
            "id": str(n.id),
            "title": n.title,
            "body": n.body,
            "read": n.read,
            "link": n.link,
            "created_at": n.created_at.isoformat(),
        }
        for n in notifications
    ]


async def _async_generate_and_cache_ai_report(
    user_id: uuid.UUID,
    all_journey_tmpl_ids: list[uuid.UUID],
    specific_plan_uuid: Optional[uuid.UUID],
):
    from app.database import AsyncSessionLocal
    from app.models.quiz import PerformanceSummary
    from app.services.performance_service import get_strengths_weaknesses
    from app.services.ai.gemma_client import generate_performance_report
    from app.utils.logging import logger
    from sqlalchemy.orm.attributes import flag_modified

    async with AsyncSessionLocal() as db:
        try:
            cross_perf = await get_strengths_weaknesses(
                user_id=user_id, db=db, top_n=3, plan_ids=all_journey_tmpl_ids or None
            )
            cross_strengths = cross_perf.get("strengths", [])
            cross_weaknesses = cross_perf.get("weaknesses", [])
            ai_summary = await generate_performance_report(cross_strengths, cross_weaknesses)

            if ai_summary:
                journey_summaries_stmt = select(PerformanceSummary).where(PerformanceSummary.user_id == user_id)
                if all_journey_tmpl_ids:
                    journey_summaries_stmt = journey_summaries_stmt.where(PerformanceSummary.plan_id.in_(all_journey_tmpl_ids))
                journey_res = await db.execute(journey_summaries_stmt)
                journey_summaries = journey_res.scalars().all()

                first_summary = journey_summaries[0] if journey_summaries else None
                if not first_summary:
                    target_plan_id = all_journey_tmpl_ids[0] if all_journey_tmpl_ids else specific_plan_uuid
                    first_summary = PerformanceSummary(
                        user_id=user_id,
                        plan_id=target_plan_id,
                        subject="General",
                        avg_theta=0.0,
                        total_attempts=0,
                        weak_topics={},
                    )
                    db.add(first_summary)

                first_summary.ai_report = ai_summary
                flag_modified(first_summary, "ai_report")
                await db.commit()
                logger.info("async_performance_report_cached", user_id=str(user_id))
        except Exception as e:
            logger.error("async_performance_report_error", error=str(e), user_id=str(user_id))


@router.get("/performance-report")
async def get_performance_report(
    plan_id: Optional[str] = None,
    subject_only: bool = False,
    user: User = Depends(require_role(["student"])),
    db: AsyncSession = Depends(get_db),
):
    """Return top-5 strengths, top-5 weaknesses, and an AI-generated prose report.

    When subject_only=True (frontend passed a specific subject's plan_id):
      - S&W and all_topics are scoped to that specific subject plan + subject name guard.
      - AI report is still fetched from the journey-level cache (not regenerated per subject).

    When subject_only=False (default, "All Enrolled Subjects" view):
      - S&W and all_topics span ALL enrolled subject plans in the exam centre journey.
      - AI report generated (or fetched from cache) from cross-subject top 3 S&W.
    """
    from app.services.ai.gemma_client import generate_performance_report

    all_journey_tmpl_ids: list[uuid.UUID] = []
    specific_plan_uuid: Optional[uuid.UUID] = None
    expected_subj: Optional[str] = None

    if plan_id:
        try:
            specific_plan_uuid = uuid.UUID(plan_id)
        except ValueError:
            pass
        all_journey_tmpl_ids, _ = await _get_target_template_ids(plan_id, user.id, db)

    # ── S&W scoping ────────────────────────────────────────────────────────────
    # subject_only=True  → scope to [specific_plan_uuid] only (plan_id is exact and sufficient)
    # subject_only=False → scope to all enrolled journey plan UUIDs, no filter
    if subject_only and specific_plan_uuid:
        perf_plan_ids: list[uuid.UUID] = [specific_plan_uuid]
    else:
        perf_plan_ids = all_journey_tmpl_ids

    perf = await get_strengths_weaknesses(
        user_id=user.id,
        db=db,
        top_n=5,
        plan_ids=perf_plan_ids or None,
        subject_filter=None,
    )
    strengths = perf.get("strengths", [])
    weaknesses = perf.get("weaknesses", [])

    # Get all topics for response (plan-scoped)
    summaries_stmt = select(PerformanceSummary).where(PerformanceSummary.user_id == user.id)
    if perf_plan_ids:
        summaries_stmt = summaries_stmt.where(PerformanceSummary.plan_id.in_(perf_plan_ids))
    result = await db.execute(summaries_stmt)
    summaries = result.scalars().all()

    all_topics = []
    for s in summaries:
        stats = s.weak_topics or {}
        for topic, data in stats.items():
            avg = float(data.get("avg_score", 0))
            level = "strong" if avg >= 7.0 else "moderate" if avg >= 5.0 else "weak"
            all_topics.append({
                "topic": topic,
                "subject": s.subject,
                "avg_score": round(avg, 2),
                "attempts": data.get("attempts", 0),
                "level": level,
            })

    # ── AI Report: Non-blocking background generation ──────────────────────────
    journey_summaries_stmt = select(PerformanceSummary).where(PerformanceSummary.user_id == user.id)
    if all_journey_tmpl_ids:
        journey_summaries_stmt = journey_summaries_stmt.where(PerformanceSummary.plan_id.in_(all_journey_tmpl_ids))
    journey_res = await db.execute(journey_summaries_stmt)
    journey_summaries = journey_res.scalars().all()

    first_summary = journey_summaries[0] if journey_summaries else None
    cached_report = first_summary.ai_report if first_summary else None

    if cached_report:
        ai_summary = cached_report
        from app.utils.logging import logger
        logger.info("performance_report_cache_hit", user_id=str(user.id), plan_id=plan_id)
    elif not subject_only:
        ai_summary = None
        # Non-blocking background generation
        import asyncio
        asyncio.create_task(
            _async_generate_and_cache_ai_report(
                user_id=user.id,
                all_journey_tmpl_ids=all_journey_tmpl_ids,
                specific_plan_uuid=specific_plan_uuid,
            )
        )
    else:
        ai_summary = None   # subject_only mode: AI report fetched separately from journey query

    return {
        "top_strengths": [s["topic"] for s in strengths],
        "top_weaknesses": [w["topic"] for w in weaknesses],
        "strengths": strengths,
        "weaknesses": weaknesses,
        "all_topics": all_topics,
        "ai_summary": ai_summary,
    }


@router.patch("/notifications/{notification_id}/read")

async def mark_notification_read(
    notification_id: str,
    user: User = Depends(require_role(["student"])),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Notification).where(
            Notification.id == uuid.UUID(notification_id),
            Notification.user_id == user.id,
        )
    )
    notification = result.scalar_one_or_none()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    notification.read = True
    await db.commit()
    return {"status": "ok"}


# ─────────────────────────────────────────────────────────────────────────────
# CUET Dashboard & Performance
# ─────────────────────────────────────────────────────────────────────────────

def _extract_sw(summaries: list, top_n: int = 5, min_attempts: int = 1):
    """Extract top-N strengths and weaknesses from a list of PerformanceSummary rows."""
    all_topics: list[dict] = []
    for summary in summaries:
        stats = summary.weak_topics or {}
        for topic_name, data in stats.items():
            attempts = int(data.get("attempts", 0))
            if attempts < min_attempts:
                continue
            all_topics.append({
                "topic": topic_name,
                "subject": summary.subject,
                "avg_score": round(float(data.get("avg_score", 0.0)), 2),
                "attempts": attempts,
            })
    if not all_topics:
        return [], []
    sorted_desc = sorted(all_topics, key=lambda x: x["avg_score"], reverse=True)
    sorted_asc  = sorted(all_topics, key=lambda x: x["avg_score"])
    strengths  = sorted_desc[:top_n]
    strength_topics = {s["topic"] for s in strengths}
    weaknesses = [w for w in sorted_asc if w["topic"] not in strength_topics][:top_n]
    return strengths, weaknesses


@router.get("/cuet-dashboard")
async def cuet_dashboard(
    user: User = Depends(require_role(["student"])),
    db: AsyncSession = Depends(get_db),
):
    """Aggregate dashboard metrics across all of the student's enrolled CUET subjects."""
    from app.models.quiz import CuetEnrollment, StudyPlanTemplate, UserStudyPlan

    # Fetch all enrollments
    enroll_q = await db.execute(
        select(CuetEnrollment)
        .where(CuetEnrollment.user_id == user.id)
    )
    enrollments = enroll_q.scalars().all()
    if not enrollments:
        return {
            "total_tests": 0,
            "avg_score": 0.0,
            "subjects": [],
            "recent_results": [],
        }

    template_ids = [e.template_id for e in enrollments]
    duration_months = enrollments[0].duration_months

    # All quiz sessions whose plan_id is one of the enrolled templates
    sessions_q = await db.execute(
        select(QuizSession)
        .where(
            QuizSession.user_id == user.id,
            QuizSession.plan_id.in_(template_ids),
            QuizSession.completed_at.isnot(None),
        )
        .order_by(QuizSession.completed_at.desc())
    )
    sessions = sessions_q.scalars().all()
    session_ids = [s.id for s in sessions]

    # Fetch test results for those sessions
    if session_ids:
        results_q = await db.execute(
            select(TestResult)
            .where(TestResult.session_id.in_(session_ids))
            .order_by(TestResult.created_at.desc())
        )
        results = results_q.scalars().all()
    else:
        results = []

    total_tests = len(results)
    avg_score = (
        round(
            sum((r.total_score / r.max_score * 100) for r in results if r.max_score > 0)
            / max(1, sum(1 for r in results if r.max_score > 0)),
            2,
        )
        if results else 0.0
    )

    # Per-subject completion summary
    usp_q = await db.execute(
        select(UserStudyPlan, StudyPlanTemplate.exam)
        .join(StudyPlanTemplate, UserStudyPlan.template_id == StudyPlanTemplate.id)
        .where(
            UserStudyPlan.user_id == user.id,
            UserStudyPlan.template_id.in_(template_ids),
        )
    )
    subjects = [
        {
            "plan_id": str(row.UserStudyPlan.template_id),
            "exam": row.exam,
            "label": exam_key_to_canonical_subject(row.exam),
            "current_week": row.UserStudyPlan.current_week,
            "total_weeks": duration_months * 4,
            "completed_weeks": len(row.UserStudyPlan.completed_weeks or []),
            "completion_pct": round(
                len(row.UserStudyPlan.completed_weeks or []) / (duration_months * 4) * 100
            ),
        }
        for row in usp_q.all()
    ]

    # Recent combined sessions (last 5)
    recent = []
    for r in results[:5]:
        session = next((s for s in sessions if s.id == r.session_id), None)
        recent.append({
            "id": str(r.id),
            "session_id": str(r.session_id),
            "week_number": session.week_number if session else None,
            "test_number": session.test_number if session else None,
            "total_score": r.total_score,
            "max_score": r.max_score,
            "score_pct": round(r.total_score / r.max_score * 100, 1) if r.max_score else 0,
            "created_at": r.created_at.isoformat(),
        })

    return {
        "duration_months": duration_months,
        "total_tests": total_tests,
        "avg_score": avg_score,
        "subjects": subjects,
        "recent_results": recent,
    }


@router.get("/cuet-performance")
async def cuet_performance(
    subject: Optional[str] = None,
    user: User = Depends(require_role(["student"])),
    db: AsyncSession = Depends(get_db),
):
    """Return strength/weakness data for CUET subjects.

    - With ?subject=CUET_CHEMISTRY → top 5 strengths + weaknesses for that subject.
    - Without subject param → top 3 cross-subject strengths + weaknesses from all enrolled CUET subjects.
    """
    from app.models.quiz import CuetEnrollment

    # Find all enrolled CUET subjects for this user
    enroll_q = await db.execute(
        select(CuetEnrollment.template_id)
        .where(CuetEnrollment.user_id == user.id)
    )
    enrolled_template_ids = [r[0] for r in enroll_q.all()]
    if not enrolled_template_ids:
        return {"strengths": [], "weaknesses": [], "subjects": []}

    # Resolve exam keys for enrolled templates
    from app.models.quiz import StudyPlanTemplate
    tmpl_q = await db.execute(
        select(StudyPlanTemplate.id, StudyPlanTemplate.exam)
        .where(StudyPlanTemplate.id.in_(enrolled_template_ids))
    )
    exam_map = {str(row.id): row.exam for row in tmpl_q.all()}
    cuet_subjects = list(exam_map.values())  # e.g. ["CUET_CHEMISTRY", "CUET_BIOLOGY"]

    if subject:
        # ── Per-subject mode: top 5 S&W for one subject ──────────────────────
        perf_q = await db.execute(
            select(PerformanceSummary)
            .where(
                PerformanceSummary.user_id == user.id,
                PerformanceSummary.subject.ilike(f"%{subject.replace('CUET_', '').replace('_', ' ')}%"),
            )
        )
        rows = perf_q.scalars().all()
        strengths, weaknesses = _extract_sw(rows, top_n=5)
        return {"subject": subject, "strengths": strengths, "weaknesses": weaknesses, "ai_summary": None}

    else:
        # ── Cross-subject mode: top 3 across all enrolled subjects ───────────
        subject_frags = [s.replace("CUET_", "").replace("_", " ").lower() for s in cuet_subjects]

        perf_q = await db.execute(
            select(PerformanceSummary)
            .where(PerformanceSummary.user_id == user.id)
        )
        all_rows = perf_q.scalars().all()

        cuet_rows = [
            r for r in all_rows
            if any(frag in r.subject.lower() for frag in subject_frags)
        ]

        strengths, weaknesses = _extract_sw(cuet_rows, top_n=5)

        subjects_breakdown = []
        for subj_key, frag in zip(cuet_subjects, subject_frags):
            subj_rows = [r for r in all_rows if frag in r.subject.lower()]
            s_str, w_str = _extract_sw(subj_rows, top_n=5)
            subjects_breakdown.append({
                "exam": subj_key,
                "label": exam_key_to_canonical_subject(subj_key),
                "strengths": s_str,
                "weaknesses": w_str,
            })

        # Generate / fetch cached AI Summary for cross-subject performance
        ai_summary = None
        if strengths or weaknesses:
            first_summary = cuet_rows[0] if cuet_rows else None
            cached_report = first_summary.ai_report if first_summary else None

            if cached_report:
                ai_summary = cached_report
                from app.utils.logging import logger
                logger.info("cuet_performance_report_cache_hit", user_id=str(user.id))
            else:
                from app.services.ai.gemma_client import generate_performance_report
                ai_summary = await generate_performance_report(strengths, weaknesses)
                if first_summary is not None and ai_summary:
                    first_summary.ai_report = ai_summary
                    from sqlalchemy.orm.attributes import flag_modified
                    flag_modified(first_summary, "ai_report")
                    await db.commit()
                    from app.utils.logging import logger
                    logger.info("cuet_performance_report_cached", user_id=str(user.id))

        return {
            "strengths": strengths,
            "weaknesses": weaknesses,
            "subjects_breakdown": subjects_breakdown,
            "ai_summary": ai_summary,
        }


