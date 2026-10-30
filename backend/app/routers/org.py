import uuid
from typing import List, Optional
from datetime import datetime
from collections import defaultdict

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Query, BackgroundTasks

from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func, Float, delete

from app.dependencies import get_db
from app.middleware.auth import require_role
from app.models.user import User, UserRole
from app.models.content_registry import ContentRegistry, ContentAccess, RootFolder, Visibility, SourceType
from app.schemas.org import (
    RequestQuestionBankRequest,
    RequestQuestionBankResponse,
    ReviewQuestionBankRequest,
    ConfirmQuestionBankRequest,
    StudentUploadRequest,
)
from app.schemas.content import ContentRegistryResponse
from app.services.ingestion_service import process_pdf, get_staged_json, update_staged_json, confirm_staged_json
from app.services.content_service import ROOT_FOLDER_MAP
from app.utils.helpers import normalize_phone

router = APIRouter()


class AddStudentRequest(BaseModel):
    phone: str
    first_name: str
    last_name: str = ""
    email: str | None = None
    class_name: str | None = None
    section: str | None = None
    allocated_exams: List[str] = []


class UpdateStudentRequest(BaseModel):
    phone: str | None = None
    email: str | None = None
    class_name: str | None = None
    section: str | None = None
    allocated_exams: List[str] | None = None



class StudentResponse(BaseModel):
    id: str
    name: str
    phone: str
    email: str | None
    tests_taken: int = 0
    avg_score: float = 0.0
    status: str = "active"
    duration_months: int | None = None
    started_at: datetime | None = None
    all_batches: List[int] = []
    class_name: str | None = None
    section: str | None = None
    allocated_exams: List[str] = []
    username: str | None = None
    plain_password: str | None = None  # Only returned once at creation


class StudentPlanInfo(BaseModel):
    duration_months: int | None = None  # None for topic-wise plans
    started_at: datetime | None = None
    current_week: int | None = None

class CuetBatchInfo(BaseModel):
    """One CUET enrollment group: same duration, multiple subjects."""
    duration_months: int | None = None  # None for topic-wise CUET plans
    subjects: List[str]  # e.g. ["History", "Economics", "Accountancy"]
    started_at: datetime | None = None
    current_week: int | None = None

class EnrolledBatchInfo(BaseModel):
    """Unified batch info for any exam plan (CUET or GATE/non-CUET)."""
    exam: str
    is_cuet: bool = False
    subjects: List[str] = []
    duration_months: int | None = None  # None for topic-wise plans
    started_at: datetime | None = None
    current_week: int | None = None
    plan_id: str | None = None
    plan_ids: List[str] = []

class StudentDetailResponse(BaseModel):
    id: str
    name: str
    phone: str
    email: str | None
    duration_months: int | None = None
    started_at: datetime | None = None
    current_week: int | None = None
    tests_taken: int = 0
    avg_score: float = 0.0
    recent_tests: List[dict] = []
    all_batches: List[int] = []
    exam: str | None = None
    plans: List[StudentPlanInfo] = []
    class_name: str | None = None
    section: str | None = None
    allocated_exams: List[str] = []
    cuet_batches: List[CuetBatchInfo] = []  # populated for CUET students
    enrolled_batches: List[EnrolledBatchInfo] = []  # All batches (CUET & non-CUET)
    username: str | None = None





# ---------------------------------------------------------------------------
# Reverse alias: DB exam key → friendly display name
# ---------------------------------------------------------------------------
EXAM_DISPLAY: dict[str, str] = {
    "GATE_CSE_PYQ": "GATE",
    "CUET": "CUET",
    "CUET_PYQ": "CUET",
    "JEE": "JEE",
    "UPSC_CSE": "UPSC_CSE",
    "CAT": "CAT",
    "Other": "Other",
}

BATCH_LABELS = {3: "3 Months", 6: "6 Months", 9: "9 Months", 12: "12 Months"}
BATCH_DURATIONS = [3, 6, 12]


def get_batch_durations_for_exam(exam_key: str | None) -> list[int]:
    """Return applicable batch duration months. CUET uses [3, 6, 9], others use [3, 6, 12]."""
    if exam_key and (exam_key == "CUET" or exam_key.startswith("CUET_")):
        return [3, 6, 9]
    return [3, 6, 12]


@router.get("/dashboard")
async def org_dashboard_v2(
    exam: str | None = None,
    user: User = Depends(require_role(["org_admin"])),
    db: AsyncSession = Depends(get_db),
):
    """
    Enhanced org dashboard with exam-level filtering.
    Returns summary cards, batch breakdowns, score distribution, and WAU.
    """
    from app.models.quiz import TestResult, QuizSession, StudyPlanTemplate, UserStudyPlan
    from datetime import datetime, timedelta
    from sqlalchemy import and_

    org_id = user.org_id

    # ── 1. Org-wide summary cards (no exam filter) ─────────────────────────
    res_students = await db.execute(
        select(func.count(User.id)).where(User.org_id == org_id, User.role == UserRole.student)
    )
    total_students = res_students.scalar() or 0

    res_tests = await db.execute(
        select(func.count(TestResult.id))
        .select_from(TestResult)
        .join(User, TestResult.user_id == User.id)
        .where(User.org_id == org_id)
    )
    total_tests = res_tests.scalar() or 0

    # Completion rate: completed sessions / total sessions
    res_sessions = await db.execute(
        select(
            func.count(QuizSession.id),
            func.count(QuizSession.completed_at)
        )
        .select_from(QuizSession)
        .join(User, QuizSession.user_id == User.id)
        .where(User.org_id == org_id)
    )
    sess_row = res_sessions.first()
    total_sessions = sess_row[0] if sess_row else 0
    completed_sessions = sess_row[1] if sess_row else 0
    completion_rate = round((completed_sessions / total_sessions * 100), 1) if total_sessions > 0 else 0.0

    # ── 2. Available exams for the dropdown ────────────────────────────────
    res_exams = await db.execute(
        select(StudyPlanTemplate.exam)
        .select_from(StudyPlanTemplate)
        .join(UserStudyPlan, UserStudyPlan.template_id == StudyPlanTemplate.id)
        .join(User, UserStudyPlan.user_id == User.id)
        .where(User.org_id == org_id)
        .distinct()
    )
    raw_exams = [row[0] for row in res_exams.all()]
    available_exams = [EXAM_DISPLAY.get(e, e) for e in raw_exams]

    # Resolve the selected exam back to DB key
    EXAM_ALIAS_LOCAL: dict[str, str] = {v: k for k, v in EXAM_DISPLAY.items()}
    selected_exam_key = None
    if exam:
        selected_exam_key = EXAM_ALIAS_LOCAL.get(exam, exam)
        # Also accept the raw DB key directly
        if selected_exam_key not in raw_exams and exam in raw_exams:
            selected_exam_key = exam

    # If no exam selected, pick the first available
    if not selected_exam_key and raw_exams:
        selected_exam_key = raw_exams[0]

    # ── 3. Students per batch (filtered by exam) ──────────────────────────
    students_per_batch = []
    avg_score_per_batch = []
    score_distribution = []
    weekly_active_users = []

    if selected_exam_key:
        durations = get_batch_durations_for_exam(selected_exam_key)

        # ── Single GROUP BY query for student counts per batch ────────────
        res_counts = await db.execute(
            select(StudyPlanTemplate.duration_months, func.count(func.distinct(UserStudyPlan.user_id)))
            .select_from(UserStudyPlan)
            .join(StudyPlanTemplate, UserStudyPlan.template_id == StudyPlanTemplate.id)
            .join(User, UserStudyPlan.user_id == User.id)
            .where(User.org_id == org_id, StudyPlanTemplate.exam == selected_exam_key)
            .group_by(StudyPlanTemplate.duration_months)
        )
        batch_counts = {dur: cnt for dur, cnt in res_counts.all()}

        for dur in durations:
            students_per_batch.append({"batch": BATCH_LABELS[dur], "count": batch_counts.get(dur, 0)})

        # Unregistered = total org students minus distinct registered students for this exam.
        res_distinct = await db.execute(
            select(func.count(func.distinct(UserStudyPlan.user_id)))
            .select_from(UserStudyPlan)
            .join(StudyPlanTemplate, UserStudyPlan.template_id == StudyPlanTemplate.id)
            .join(User, UserStudyPlan.user_id == User.id)
            .where(User.org_id == org_id, StudyPlanTemplate.exam == selected_exam_key)
        )
        total_registered = res_distinct.scalar() or 0
        unregistered_cnt = max(0, total_students - total_registered)
        if unregistered_cnt > 0:
            students_per_batch.append({"batch": "Not Registered", "count": unregistered_cnt})

        # ── Resolve valid quiz session plan_ids and mapped duration_months ──
        is_cuet = selected_exam_key == "CUET" or selected_exam_key.startswith("CUET_")
        valid_plan_id_to_dur: dict[uuid.UUID, int] = {}

        if is_cuet:
            cuet_students_stmt = (
                select(UserStudyPlan.user_id, StudyPlanTemplate.duration_months)
                .join(StudyPlanTemplate, UserStudyPlan.template_id == StudyPlanTemplate.id)
                .join(User, UserStudyPlan.user_id == User.id)
                .where(User.org_id == org_id, StudyPlanTemplate.exam == selected_exam_key)
            )
            res_cuet_students = await db.execute(cuet_students_stmt)
            user_target_durations = defaultdict(set)
            for uid, dur in res_cuet_students.all():
                user_target_durations[uid].add(dur)

            if user_target_durations:
                all_cuet_plans_stmt = (
                    select(UserStudyPlan.user_id, UserStudyPlan.template_id, StudyPlanTemplate.duration_months)
                    .join(StudyPlanTemplate, UserStudyPlan.template_id == StudyPlanTemplate.id)
                    .where(
                        UserStudyPlan.user_id.in_(list(user_target_durations.keys())),
                        or_(
                            StudyPlanTemplate.exam == "CUET",
                            StudyPlanTemplate.exam.like("CUET_%")
                        )
                    )
                )
                res_all_cuet = await db.execute(all_cuet_plans_stmt)
                for uid, tid, dur in res_all_cuet.all():
                    if dur in user_target_durations[uid]:
                        valid_plan_id_to_dur[tid] = dur
        else:
            non_cuet_stmt = (
                select(UserStudyPlan.template_id, StudyPlanTemplate.duration_months)
                .join(StudyPlanTemplate, UserStudyPlan.template_id == StudyPlanTemplate.id)
                .join(User, UserStudyPlan.user_id == User.id)
                .where(User.org_id == org_id, StudyPlanTemplate.exam == selected_exam_key)
            )
            res_non_cuet = await db.execute(non_cuet_stmt)
            valid_plan_id_to_dur = {tid: dur for tid, dur in res_non_cuet.all()}

        # ── Single GROUP BY query for avg scores per batch ────────────────
        avg_scores = {}
        if valid_plan_id_to_dur:
            res_avgs = await db.execute(
                select(
                    QuizSession.plan_id,
                    func.avg(
                        func.cast(TestResult.total_score, Float) /
                        func.nullif(func.cast(TestResult.max_score, Float), 0) * 100
                    ),
                )
                .select_from(TestResult)
                .join(QuizSession, TestResult.session_id == QuizSession.id)
                .join(User, TestResult.user_id == User.id)
                .where(
                    User.org_id == org_id,
                    QuizSession.plan_id.in_(list(valid_plan_id_to_dur.keys()))
                )
                .group_by(QuizSession.plan_id)
            )
            dur_sums = defaultdict(float)
            dur_counts = defaultdict(int)
            for pid, avg_val in res_avgs.all():
                if avg_val is not None and pid in valid_plan_id_to_dur:
                    dur = valid_plan_id_to_dur[pid]
                    dur_sums[dur] += float(avg_val)
                    dur_counts[dur] += 1
            avg_scores = {dur: dur_sums[dur] / dur_counts[dur] for dur in dur_counts}

        for dur in durations:
            avg_score_per_batch.append({
                "batch": BATCH_LABELS[dur],
                "avg_score": round(float(avg_scores.get(dur) or 0.0), 1),
            })

        # ── 4. Score distribution (bucketed by 10, per batch) ─────────────
        all_scores = []
        if valid_plan_id_to_dur:
            res_scores = await db.execute(
                select(
                    QuizSession.plan_id,
                    User.id,
                    func.avg(
                        func.cast(TestResult.total_score, Float) /
                        func.nullif(func.cast(TestResult.max_score, Float), 0) * 100
                    ).label("avg_pct")
                )
                .select_from(TestResult)
                .join(QuizSession, TestResult.session_id == QuizSession.id)
                .join(User, TestResult.user_id == User.id)
                .where(
                    User.org_id == org_id,
                    QuizSession.plan_id.in_(list(valid_plan_id_to_dur.keys())),
                    TestResult.max_score > 0,
                )
                .group_by(QuizSession.plan_id, User.id)
            )
            all_scores = [
                (valid_plan_id_to_dur[pid], avg_pct)
                for pid, uid, avg_pct in res_scores.all()
                if pid in valid_plan_id_to_dur
            ]

        buckets = list(range(0, 101, 10))
        dist_data = []
        for i in range(len(buckets) - 1):
            low, high = buckets[i], buckets[i + 1]
            row: dict = {"marks": f"{low}-{high}"}
            for dur in durations:
                key = f"{dur}_months"
                cnt = sum(
                    1 for dm, avg_pct in all_scores
                    if dm == dur and avg_pct is not None and low <= avg_pct < (high if high < 100 else high + 1)
                )
                row[key] = cnt
            dist_data.append(row)
        score_distribution = dist_data

        # ── 5. Daily Active Users (last 7 days rolling window) ───
        from datetime import datetime, timedelta
        now = datetime.utcnow()
        today_start = datetime(now.year, now.month, now.day)
        last_7_days = [today_start - timedelta(days=i) for i in range(6, -1, -1)]

        dau_map = {}
        if valid_plan_id_to_dur:
            day_col = func.date_trunc("day", QuizSession.started_at)
            res_dau = await db.execute(
                select(
                    day_col.label("day"),
                    func.count(func.distinct(QuizSession.user_id)).label("active_users"),
                )
                .select_from(QuizSession)
                .join(User, QuizSession.user_id == User.id)
                .where(
                    User.org_id == org_id,
                    QuizSession.plan_id.in_(list(valid_plan_id_to_dur.keys())),
                    QuizSession.started_at >= last_7_days[0],
                )
                .group_by(day_col)
            )
            for row in res_dau.all():
                d_val = row.day.date() if isinstance(row.day, datetime) else row.day
                if d_val:
                    dau_map[d_val] = row.active_users

        weekly_active_users = []
        for dt_val in last_7_days:
            d_key = dt_val.date()
            active_cnt = dau_map.get(d_key, 0)
            weekly_active_users.append({
                "week": dt_val.strftime("%b %d"),
                "active_users": active_cnt
            })

    return {
        "total_students": total_students,
        "total_tests": total_tests,
        "completion_rate": completion_rate,
        "available_exams": available_exams if available_exams else ["No exams"],
        "selected_exam": EXAM_DISPLAY.get(selected_exam_key, selected_exam_key) if selected_exam_key else None,
        "students_per_batch": students_per_batch,
        "avg_score_per_batch": avg_score_per_batch,
        "score_distribution": score_distribution,
        "weekly_active_users": weekly_active_users,
    }





@router.get("/students", response_model=List[StudentResponse])
async def list_org_students(
    user: User = Depends(require_role(["org_admin"])),
    db: AsyncSession = Depends(get_db),
):
    from app.models.quiz import TestResult, QuizSession, UserStudyPlan, StudyPlanTemplate
    from sqlalchemy.orm import selectinload
    from sqlalchemy import and_


    # Fetch all active batches for all students in this organization
    batches_stmt = (
        select(UserStudyPlan.user_id, StudyPlanTemplate.duration_months, StudyPlanTemplate.exam)
        .join(StudyPlanTemplate, UserStudyPlan.template_id == StudyPlanTemplate.id)
        .join(User, UserStudyPlan.user_id == User.id)
        .where(User.org_id == user.org_id)
    )
    res_batches = await db.execute(batches_stmt)
    from collections import defaultdict
    user_plans_raw: dict = defaultdict(list)
    for uid, duration, exam_name in res_batches.all():
        user_plans_raw[uid].append((duration, exam_name or ""))

    batches_by_user = {}
    for uid, p_list in user_plans_raw.items():
        cuet_durs = set()
        b_list = []
        for dur, e_name in p_list:
            # Topic-wise plans have null duration_months — skip for batch filters
            if dur is None:
                continue
            if e_name.startswith("CUET_") or e_name == "CUET":
                if dur not in cuet_durs:
                    cuet_durs.add(dur)
                    b_list.append(dur)
            else:
                b_list.append(dur)
        batches_by_user[uid] = b_list

    # Query to select student user, and stats
    stmt = (
        select(
            User,
            func.count(func.distinct(TestResult.id)).label("tests_taken"),
            func.avg(
                func.cast(TestResult.total_score, Float) /
                func.nullif(func.cast(TestResult.max_score, Float), 0) * 100
            ).label("avg_score"),
        )
        .options(selectinload(User.credentials))
        .outerjoin(TestResult, User.id == TestResult.user_id)
        .where(User.org_id == user.org_id, User.role == UserRole.student)
        .group_by(User.id)
    )

    result = await db.execute(stmt)
    rows = result.all()

    return [
        StudentResponse(
            id=str(row.User.id),
            name=row.User.name,
            phone=row.User.phone,
            email=row.User.email,
            tests_taken=row.tests_taken or 0,
            avg_score=round(float(row.avg_score or 0.0), 1),
            duration_months=None,
            started_at=None,
            all_batches=batches_by_user.get(row.User.id, []),
            class_name=(row.User.metadata_ or {}).get("class"),
            section=(row.User.metadata_ or {}).get("section"),
            allocated_exams=(row.User.metadata_ or {}).get("allocated_exams", []),
            username=row.User.credentials.username if row.User.credentials else None,
        )
        for row in rows
    ]



async def _resolve_target_plan_ids(
    user_id: uuid.UUID,
    plan_id: str | None,
    duration_months: int | None,
    db: AsyncSession,
) -> list[uuid.UUID] | None:
    if not plan_id and not duration_months:
        return None

    from app.models.quiz import UserStudyPlan, StudyPlanTemplate, CuetEnrollment
    from sqlalchemy.orm import selectinload

    # Fetch CuetEnrollment rows for user
    res_cuet = await db.execute(
        select(CuetEnrollment)
        .options(selectinload(CuetEnrollment.template))
        .where(CuetEnrollment.user_id == user_id)
    )
    cuet_enr_rows = res_cuet.scalars().all()

    # Fetch UserStudyPlan rows for user
    res_usp = await db.execute(
        select(UserStudyPlan)
        .options(selectinload(UserStudyPlan.template))
        .where(UserStudyPlan.user_id == user_id)
    )
    usp_rows = res_usp.scalars().all()

    target_dur = duration_months

    # If plan_id is passed without duration_months, determine its duration_months
    if plan_id and not target_dur:
        for ce in cuet_enr_rows:
            if str(ce.template_id) == plan_id or (ce.template and str(ce.template.id) == plan_id):
                target_dur = ce.duration_months
                break
        if not target_dur:
            for up in usp_rows:
                if up.template and (str(up.template_id) == plan_id or str(up.template.id) == plan_id):
                    target_dur = up.template.duration_months
                    break

    pids: set[uuid.UUID] = set()

    if target_dur:
        # Include ALL CUET templates matching target_dur for this user
        for ce in cuet_enr_rows:
            if ce.duration_months == target_dur:
                pids.add(ce.template_id)
        for up in usp_rows:
            if up.template and up.template.duration_months == target_dur:
                pids.add(up.template_id)

    if plan_id:
        try:
            pids.add(uuid.UUID(plan_id))
        except Exception:
            pass

    return list(pids) if pids else None


@router.get("/students/{student_id}", response_model=StudentDetailResponse)
async def get_student_detail(
    student_id: str,
    duration_months: int | None = Query(None),
    plan_id: str | None = Query(None),
    user: User = Depends(require_role(["org_admin"])),
    db: AsyncSession = Depends(get_db),
):
    from app.models.quiz import TestResult, QuizSession, UserStudyPlan, StudyPlanTemplate, CuetEnrollment
    from app.models.content_registry import ContentRegistry
    from sqlalchemy.orm import selectinload

    # 1. Fetch student
    student_stmt = (
        select(User)
        .options(selectinload(User.credentials))
        .where(User.id == uuid.UUID(student_id), User.org_id == user.org_id)
    )
    res_student = await db.execute(student_stmt)
    student = res_student.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found in your organization")

    # 2. Fetch UserStudyPlan rows
    plan_stmt = (
        select(UserStudyPlan, StudyPlanTemplate)
        .join(StudyPlanTemplate, UserStudyPlan.template_id == StudyPlanTemplate.id)
        .where(UserStudyPlan.user_id == student.id)
    )
    res_plan = await db.execute(plan_stmt)
    plan_rows = res_plan.all()

    # Fetch CuetEnrollment rows
    res_cuet_enr = await db.execute(
        select(CuetEnrollment)
        .options(selectinload(CuetEnrollment.template))
        .where(CuetEnrollment.user_id == student.id)
    )
    cuet_enr_rows = res_cuet_enr.scalars().all()

    # Calculate batches: group CUET subjects by duration_months into 1 batch per duration group
    # Topic-wise plans (duration_months=None) are excluded from all_batches duration filters
    cuet_durs_seen = set()
    all_batches = []
    for user_plan, template in plan_rows:
        e_name = template.exam or ""
        dur = template.duration_months
        if dur is None:
            continue
        if e_name.startswith("CUET_") or e_name == "CUET":
            if dur not in cuet_durs_seen:
                cuet_durs_seen.add(dur)
                all_batches.append(dur)
        else:
            all_batches.append(dur)
    for ce in cuet_enr_rows:
        if ce.duration_months is None:
            continue
        if ce.duration_months not in cuet_durs_seen:
            cuet_durs_seen.add(ce.duration_months)
            all_batches.append(ce.duration_months)
    
    plans_list = []
    started_at = None
    current_week = None
    exam = None
    cuet_batches_out: list = []
    enrolled_batches_out: list = []
    cuet_durs_added: set = set()

    def _sort_dur_key(item):
        # Put None (topic-wise) after numeric durations
        dur = item[0]
        return (dur is None, dur if dur is not None else 0)

    for user_plan, template in plan_rows:
        plans_list.append(StudentPlanInfo(
            duration_months=template.duration_months,
            started_at=user_plan.created_at,
            current_week=user_plan.current_week
        ))

    # ── Group ALL plans into enrolled_batches (CUET grouped + non-CUET individual) ──
    if cuet_enr_rows:
        from collections import defaultdict
        cuet_by_dur: dict = defaultdict(list)
        for ce in cuet_enr_rows:
            if ce.template:
                cuet_by_dur[ce.duration_months].append(ce)
        for dur, entries in sorted(cuet_by_dur.items(), key=_sort_dur_key):
            subjects = []
            first_ce = entries[0]
            cuet_pids = [str(ce.template_id) for ce in entries]
            for ce in entries:
                if ce.template:
                    raw = ce.template.exam.replace("CUET_", "").replace("_", " ").strip().title()
                    if raw and raw.lower() != "cuet" and raw not in subjects:
                        subjects.append(raw)
            c_info = CuetBatchInfo(
                duration_months=dur,
                subjects=subjects,
                started_at=first_ce.created_at,
                current_week=1,
            )
            cuet_batches_out.append(c_info)
            enrolled_batches_out.append(EnrolledBatchInfo(
                exam="CUET",
                is_cuet=True,
                subjects=subjects,
                duration_months=dur,
                started_at=first_ce.created_at,
                current_week=1,
                plan_id=cuet_pids[0] if cuet_pids else None,
                plan_ids=cuet_pids,
            ))
            cuet_durs_added.add(dur)

    cuet_rows = [(up, t) for up, t in plan_rows if (t.exam.startswith("CUET_") or t.exam == "CUET") and t.duration_months not in cuet_durs_added]
    non_cuet_rows = [(up, t) for up, t in plan_rows if not (t.exam.startswith("CUET_") or t.exam == "CUET")]

    if cuet_rows:
        from collections import defaultdict
        cuet_by_dur: dict = defaultdict(list)
        for up, t in cuet_rows:
            cuet_by_dur[t.duration_months].append((up, t))
        for dur, entries in sorted(cuet_by_dur.items(), key=_sort_dur_key):
            subjects = []
            first_up = entries[0][0]
            first_week = entries[0][0].current_week
            cuet_pids = [str(t.id) for up, t in entries]
            for up, t in entries:
                raw = t.exam.replace("CUET_", "").replace("_", " ").strip().title()
                if raw and raw.lower() != "cuet" and raw not in subjects:
                    subjects.append(raw)
            c_info = CuetBatchInfo(
                duration_months=dur,
                subjects=subjects,
                started_at=first_up.created_at,
                current_week=first_week,
            )
            cuet_batches_out.append(c_info)
            enrolled_batches_out.append(EnrolledBatchInfo(
                exam="CUET",
                is_cuet=True,
                subjects=subjects,
                duration_months=dur,
                started_at=first_up.created_at,
                current_week=first_week,
                plan_id=cuet_pids[0] if cuet_pids else None,
                plan_ids=cuet_pids,
            ))

    for up, t in non_cuet_rows:
        display_name = t.exam.replace("_PYQ", "").replace("_", " ").strip()
        enrolled_batches_out.append(EnrolledBatchInfo(
            exam=display_name,
            is_cuet=False,
            subjects=[],
            duration_months=t.duration_months,
            started_at=up.created_at,
            current_week=up.current_week,
            plan_id=str(t.id),
            plan_ids=[str(t.id)],
        ))

    # 3. Determine plan filtering target UUIDs if plan_id or duration_months query param is supplied
    target_plan_ids = await _resolve_target_plan_ids(student.id, plan_id, duration_months, db)

    # 4. Fetch test metrics
    metrics_stmt = (
        select(
            func.count(TestResult.id).label("tests_taken"),
            func.avg(
                func.cast(TestResult.total_score, Float) /
                func.nullif(func.cast(TestResult.max_score, Float), 0) * 100
            ).label("avg_score")
        )
        .join(QuizSession, TestResult.session_id == QuizSession.id)
        .where(TestResult.user_id == student.id)
    )
    if target_plan_ids:
        metrics_stmt = metrics_stmt.where(QuizSession.plan_id.in_(target_plan_ids))

    res_metrics = await db.execute(metrics_stmt)
    metrics_row = res_metrics.first()
    tests_taken = metrics_row.tests_taken if metrics_row else 0
    avg_score = round(float(metrics_row.avg_score or 0.0), 1) if metrics_row else 0.0

    # 5. Fetch recent test results
    tests_stmt = (
        select(TestResult, ContentRegistry.title, QuizSession.week_number, QuizSession.test_number)
        .join(QuizSession, TestResult.session_id == QuizSession.id)
        .outerjoin(ContentRegistry, QuizSession.content_registry_id == ContentRegistry.id)
        .where(TestResult.user_id == student.id)
    )
    if target_plan_ids:
        tests_stmt = tests_stmt.where(QuizSession.plan_id.in_(target_plan_ids))

    tests_stmt = tests_stmt.order_by(TestResult.created_at.desc()).limit(15)
    res_tests = await db.execute(tests_stmt)
    test_rows = res_tests.all()
    
    recent_tests = []
    for row in test_rows:
        r, title, week_number, test_number = row
        recent_tests.append({
            "id": str(r.id),
            "total_score": r.total_score,
            "max_score": r.max_score,
            "theta_final": r.theta_final,
            "created_at": r.created_at.isoformat(),
            "test_name": (
                f"W-{week_number} Test {test_number or 1}"
                if week_number
                else (title or "General Assessment")
            ),
        })

    return StudentDetailResponse(
        id=str(student.id),
        name=student.name,
        phone=student.phone,
        email=student.email,
        duration_months=duration_months,
        started_at=started_at,
        current_week=current_week,
        tests_taken=tests_taken or 0,
        avg_score=avg_score,
        recent_tests=recent_tests,
        all_batches=all_batches,
        exam=exam,
        plans=plans_list,
        class_name=(student.metadata_ or {}).get("class"),
        section=(student.metadata_ or {}).get("section"),
        cuet_batches=cuet_batches_out,
        enrolled_batches=enrolled_batches_out,
        username=student.credentials.username if student.credentials else None,
    )


@router.post("/students", response_model=StudentResponse)
async def add_student(
    request: AddStudentRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_role(["org_admin"])),
    db: AsyncSession = Depends(get_db),
):

    if not user.org_id:
        raise HTTPException(status_code=400, detail="Admin is not associated with an organization")

    phone = normalize_phone(request.phone)

    # Build names
    first_name = request.first_name.strip()
    last_name = request.last_name.strip() if request.last_name else ""
    if not first_name:
        raise HTTPException(status_code=400, detail="First name is required")

    email = request.email.strip().lower() if request.email and request.email.strip() else None

    from sqlalchemy.orm import selectinload
    from app.models.student_credentials import StudentCredentials
    from app.utils.credentials import generate_username, generate_password, hash_password
    from app.utils.email import send_credentials_email

    student = User(
        id=uuid.uuid4(),
        phone=phone,
        first_name=first_name,
        last_name=last_name,
        email=email,
        role=UserRole.student,
        org_id=user.org_id,
        metadata_={
            **(({"class": request.class_name} if request.class_name else {})),
            **(({"section": request.section} if request.section else {})),
            **(({"allocated_exams": request.allocated_exams} if request.allocated_exams else {})),
        } or None,
    )
    db.add(student)
    await db.flush()  # Get student.id

    # Generate credentials
    username = await generate_username(first_name, last_name, phone, db)
    plain_pwd = generate_password()
    from app.utils.credentials import encrypt_password
    creds = StudentCredentials(
        id=uuid.uuid4(),
        user_id=student.id,
        username=username,
        hashed_password=hash_password(plain_pwd),
        encrypted_password=encrypt_password(plain_pwd),
    )
    db.add(creds)
    await db.flush()


    # Send credentials to student's email in background task
    if email:
        background_tasks.add_task(send_credentials_email, email, student.name, username, plain_pwd)
    else:
        print(f"📧 [Credentials] Username: {username} | Password: {plain_pwd} (no email set)")


    meta_out = student.metadata_ or {}
    return StudentResponse(
        id=str(student.id),
        name=student.name,
        phone=student.phone,
        email=student.email,
        class_name=meta_out.get("class"),
        section=meta_out.get("section"),
        allocated_exams=meta_out.get("allocated_exams", []),
        username=username,
        plain_password=plain_pwd,
    )


@router.post("/students/{student_id}/reset-credentials")
async def reset_student_credentials(
    student_id: str,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_role(["org_admin"])),
    db: AsyncSession = Depends(get_db),
):

    """Org admin resets a student's password. Returns new plain password once."""
    from app.models.student_credentials import StudentCredentials
    from app.utils.credentials import generate_password, hash_password
    from app.utils.email import send_credentials_email

    try:
        student_uuid = uuid.UUID(student_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid student ID format")

    result = await db.execute(
        select(User).where(User.id == student_uuid, User.org_id == user.org_id)
    )
    student = result.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found in your organization")

    cred_result = await db.execute(
        select(StudentCredentials).where(StudentCredentials.user_id == student_uuid)
    )
    creds = cred_result.scalar_one_or_none()
    if not creds:
        raise HTTPException(status_code=404, detail="No credentials found for this student")

    new_pwd = generate_password()
    from app.utils.credentials import encrypt_password
    creds.hashed_password = hash_password(new_pwd)
    creds.encrypted_password = encrypt_password(new_pwd)
    await db.flush()


    if student.email:
        background_tasks.add_task(send_credentials_email, student.email, student.name, creds.username, new_pwd)


    return {
        "message": "Password reset successfully",
        "username": creds.username,
        "new_password": new_pwd,
    }


@router.post("/students/{student_id}/reveal-password")
async def reveal_student_password(
    student_id: str,
    user: User = Depends(require_role(["org_admin"])),
    db: AsyncSession = Depends(get_db),
):
    """Org admin decrypts and reveals a student's password on demand."""
    from app.models.student_credentials import StudentCredentials
    from app.utils.credentials import decrypt_password

    try:
        student_uuid = uuid.UUID(student_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid student ID format")

    result = await db.execute(
        select(User).where(User.id == student_uuid, User.org_id == user.org_id)
    )
    student = result.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found in your organization")

    cred_result = await db.execute(
        select(StudentCredentials).where(StudentCredentials.user_id == student_uuid)
    )
    creds = cred_result.scalar_one_or_none()
    if not creds or not creds.encrypted_password:
        raise HTTPException(status_code=404, detail="No stored password found for this student")

    return {
        "username": creds.username,
        "password": decrypt_password(creds.encrypted_password),
    }



@router.post("/students/bulk", response_model=List[StudentResponse])
async def bulk_add_students(
    request: StudentUploadRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_role(["org_admin"])),
    db: AsyncSession = Depends(get_db),
):

    if not user.org_id:
        raise HTTPException(status_code=400, detail="Admin is not associated with an organization")

    from app.models.student_credentials import StudentCredentials
    from app.utils.credentials import generate_username, generate_password, hash_password
    from app.utils.email import send_credentials_email
    import asyncio as _asyncio

    results = []
    for entry in request.students:
        phone = normalize_phone(entry.get("phone", ""))
        first_name = entry.get("first_name", "").strip()
        last_name = entry.get("last_name", "").strip()
        
        # Fallback if single 'name' is passed in CSV/JSON
        if not first_name and entry.get("name"):
            full_name = entry.get("name", "").strip()
            parts = full_name.split(" ", 1)
            first_name = parts[0]
            last_name = parts[1] if len(parts) > 1 else ""

        email = entry.get("email")
        if email:
            email = email.strip().lower()

        if not phone or not first_name:
            continue

        result = await db.execute(select(User).where(User.phone == phone))
        student = result.scalar_one_or_none()

        if student is None:
            student = User(
                id=uuid.uuid4(),
                phone=phone,
                first_name=first_name,
                last_name=last_name,
                email=email,
                role=UserRole.student,
                org_id=user.org_id,
            )
            db.add(student)
            await db.flush()
        else:
            if not student.org_id:
                student.org_id = user.org_id
                await db.flush()

        # Check if student has credentials, create if missing
        cred_res = await db.execute(
            select(StudentCredentials).where(StudentCredentials.user_id == student.id)
        )
        creds = cred_res.scalar_one_or_none()
        plain_pwd = None
        username = None

        if not creds:
            username = await generate_username(first_name, last_name, phone, db)
            plain_pwd = generate_password()
            from app.utils.credentials import encrypt_password
            creds = StudentCredentials(
                id=uuid.uuid4(),
                user_id=student.id,
                username=username,
                hashed_password=hash_password(plain_pwd),
                encrypted_password=encrypt_password(plain_pwd),
            )
            db.add(creds)
            await db.flush()


            if email:
                background_tasks.add_task(send_credentials_email, email, student.name, username, plain_pwd)

        else:
            username = creds.username

        results.append(
            StudentResponse(
                id=str(student.id),
                name=student.name,
                phone=student.phone,
                email=student.email,
                username=username,
                plain_password=plain_pwd,
            )
        )

    return results



@router.patch("/students/{student_id}", response_model=StudentResponse)
async def update_student(
    student_id: str,
    request: UpdateStudentRequest,
    user: User = Depends(require_role(["org_admin"])),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy.orm.attributes import flag_modified

    result = await db.execute(
        select(User).where(User.id == uuid.UUID(student_id), User.org_id == user.org_id)
    )
    student = result.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found in your organization")

    if request.phone is not None:
        new_phone = normalize_phone(request.phone)
        if len(new_phone) != 10:
            raise HTTPException(status_code=422, detail="Phone number must be exactly 10 digits")
        # Ensure phone uniqueness
        dup = await db.execute(select(User).where(User.phone == new_phone, User.id != student.id))
        if dup.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Another user already has this phone number")
        student.phone = new_phone

    if request.email is not None:
        new_email = request.email.strip().lower() if request.email and request.email.strip() else None
        if new_email and new_email != student.email:
            dup_email = await db.execute(select(User).where(User.email == new_email, User.id != student.id))
            if dup_email.scalar_one_or_none():
                raise HTTPException(
                    status_code=409,
                    detail=f"Email address '{new_email}' is already registered to another user account"
                )
        student.email = new_email

    # Update class/section/allocated_exams inside metadata_
    meta = dict(student.metadata_ or {})
    if request.class_name is not None:
        if request.class_name:
            meta["class"] = request.class_name
        else:
            meta.pop("class", None)
    if request.section is not None:
        if request.section:
            meta["section"] = request.section
        else:
            meta.pop("section", None)
    if request.allocated_exams is not None:
        # Empty list means remove restriction (all exams allowed)
        if request.allocated_exams:
            meta["allocated_exams"] = request.allocated_exams
        else:
            meta.pop("allocated_exams", None)
    student.metadata_ = meta
    flag_modified(student, "metadata_")

    await db.flush()
    meta_out = student.metadata_ or {}
    return StudentResponse(
        id=str(student.id),
        name=student.name,
        phone=student.phone,
        email=student.email,
        class_name=meta_out.get("class"),
        section=meta_out.get("section"),
        allocated_exams=meta_out.get("allocated_exams", []),
    )


@router.delete("/students/{student_id}")
async def remove_student(
    student_id: str,
    user: User = Depends(require_role(["org_admin"])),
    db: AsyncSession = Depends(get_db),
):
    from app.models.quiz import PerformanceSummary, UserStudyPlan, TestResult, QuizSession, CuetEnrollment
    from app.models.notification import Notification
    from app.models.job import JobEvaluation

    try:
        student_uuid = uuid.UUID(student_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid student ID format")

    result = await db.execute(
        select(User).where(User.id == student_uuid, User.org_id == user.org_id)
    )
    student = result.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found in your organization")

    # Clean up all associated student records
    await db.execute(delete(CuetEnrollment).where(CuetEnrollment.user_id == student_uuid))
    await db.execute(delete(PerformanceSummary).where(PerformanceSummary.user_id == student_uuid))
    await db.execute(delete(UserStudyPlan).where(UserStudyPlan.user_id == student_uuid))
    await db.execute(delete(Notification).where(Notification.user_id == student_uuid))
    await db.execute(delete(JobEvaluation).where(JobEvaluation.user_id == student_uuid))

    session_res = await db.execute(select(QuizSession.id).where(QuizSession.user_id == student_uuid))
    session_ids = session_res.scalars().all()
    if session_ids:
        await db.execute(delete(TestResult).where(TestResult.session_id.in_(session_ids)))
        await db.execute(delete(QuizSession).where(QuizSession.id.in_(session_ids)))

    await db.execute(delete(TestResult).where(TestResult.user_id == student_uuid))

    # Delete student user record from database
    await db.delete(student)
    await db.flush()
    return {"message": "Student deleted successfully"}



@router.get("/available-exams")
async def get_available_exams(
    user: User = Depends(require_role(["org_admin"])),
    db: AsyncSession = Depends(get_db),
):
    """Return the list of PYQ exam subfolders accessible to this org (global + org-specific)."""
    from app.models.content_registry import SourceType
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
        .distinct()
    )
    result = await db.execute(stmt)
    db_exams = set(r for r in result.scalars().all() if r)

    # Static list of platform-supported exams shown to all orgs for allocation
    # (shown regardless of whether question bank content has been uploaded yet)
    PLATFORM_EXAMS = [
        "GATE_CSE_PYQ",
        "CUET",
        "CAT",
        "Class 10 CBSE",
        "CBSE_10_SOCIAL_SCIENCE",
        "Class 12 CBSE",
    ]

    # Merge DB exams (org-specific content) with the static list
    raw_exams = db_exams | set(PLATFORM_EXAMS)

    # Normalize aliases (e.g. CUET_PYQ -> CUET) so only one unified "CUET" option is displayed
    normalized_exams = set()
    for exam in raw_exams:
        if exam in ("CUET_PYQ", "CUET"):
            normalized_exams.add("CUET")
        else:
            normalized_exams.add(exam)

    all_exams = sorted(list(normalized_exams))
    return all_exams


@router.post("/request-question-bank", response_model=RequestQuestionBankResponse)
async def request_question_bank(
    request: RequestQuestionBankRequest,
    file: UploadFile = File(...),
    user: User = Depends(require_role(["org_admin"])),
):
    task_id = str(uuid.uuid4())
    pdf_bytes = await file.read()
    result = await process_pdf(
        pdf_bytes=pdf_bytes,
        task_id=task_id,
        source_type=request.source_type,
        subject=request.subject,
    )
    return RequestQuestionBankResponse(
        task_id=task_id,
        status=result.get("status", "processing"),
        message=f"Generated {result.get('question_count', 0)} questions",
    )


@router.get("/generated-json/{task_id}")
async def get_generated_json(
    task_id: str,
    user: User = Depends(require_role(["org_admin"])),
):
    data = await get_staged_json(task_id)
    if not data:
        raise HTTPException(status_code=404, detail="Staged JSON not found")
    return data


@router.post("/review-question-bank")
async def review_question_bank(
    request: ReviewQuestionBankRequest,
    user: User = Depends(require_role(["org_admin"])),
):
    result = await update_staged_json(request.task_id, request.questions)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@router.post("/confirm-question-bank")
async def confirm_question_bank(
    request: ConfirmQuestionBankRequest,
    root_folder: str = "Subjectwise Content",
    subfolder: str = "Custom",
    user: User = Depends(require_role(["org_admin"])),
    db: AsyncSession = Depends(get_db),
):
    filename = f"{request.task_id[:8]}_questions.json"
    content = await confirm_staged_json(request.task_id, root_folder, subfolder, filename)
    if not content:
        raise HTTPException(status_code=404, detail="Staged file not found")

    import json
    data = json.loads(content)
    file_path = f"{root_folder}/{subfolder}/{filename}"
    root_enum = ROOT_FOLDER_MAP.get(root_folder, RootFolder.subjectwise)

    registry = ContentRegistry(
        id=uuid.uuid4(),
        file_path=file_path,
        root_folder=root_enum,
        subfolder=subfolder,
        title=data.get("title", filename),
        subject=data.get("subject"),
        source_type=SourceType(data.get("source_type", "standard")),
        question_count=len(data.get("questions", [])),
        visibility=Visibility.org_specific,
        created_by=user.id,
    )
    db.add(registry)
    await db.flush()

    if user.org_id:
        access = ContentAccess(
            id=uuid.uuid4(),
            content_registry_id=registry.id,
            org_id=user.org_id,
        )
        db.add(access)
        await db.flush()

    return {"message": "Question bank confirmed", "registry_id": str(registry.id)}


@router.get("/question-bank-folders")
async def list_org_question_bank_folders(
    user: User = Depends(require_role(["org_admin"])),
    db: AsyncSession = Depends(get_db),
):
    """Return distinct (root_folder, subfolder) pairs accessible to this org.

    Each entry represents a folder the org can browse into.
    """
    if not user.org_id:
        raise HTTPException(status_code=400, detail="User not associated with an organization")

    stmt = (
        select(
            ContentRegistry.root_folder,
            ContentRegistry.subfolder,
            func.count(ContentRegistry.id).label("bank_count"),
            func.sum(ContentRegistry.question_count).label("total_questions"),
        )
        .outerjoin(ContentAccess)
        .where(
            or_(
                ContentRegistry.visibility == Visibility.global_,
                ContentAccess.org_id == user.org_id
            )
        )
        .group_by(ContentRegistry.root_folder, ContentRegistry.subfolder)
        .order_by(ContentRegistry.subfolder)
    )
    result = await db.execute(stmt)
    rows = result.all()
    return [
        {
            "root_folder": row.root_folder.value if hasattr(row.root_folder, 'value') else str(row.root_folder),
            "subfolder": row.subfolder,
            "bank_count": row.bank_count,
            "total_questions": row.total_questions or 0,
        }
        for row in rows
    ]


@router.get("/question-banks", response_model=List[ContentRegistryResponse])
async def list_org_question_banks(
    subfolder: str | None = None,
    user: User = Depends(require_role(["org_admin"])),
    db: AsyncSession = Depends(get_db),
):
    """List question banks accessible to this org, optionally filtered by subfolder."""
    if not user.org_id:
        raise HTTPException(status_code=400, detail="User not associated with an organization")

    # Select content that is either global OR specifically assigned to this organization
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
    if subfolder:
        stmt = stmt.where(ContentRegistry.subfolder == subfolder)

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


@router.get("/syllabus/{subfolder}")
async def get_org_syllabus(
    subfolder: str,
    user: User = Depends(require_role(["org_admin"])),
):
    """Return the extracted topic and subtopic syllabus tree for a question bank subfolder (e.g. GATE_CSE_PYQ or CUET_PYQ)."""
    import json
    from pathlib import Path

    safe_subfolder = Path(subfolder).name
    candidate_names = [safe_subfolder]
    if safe_subfolder == "CUET":
        candidate_names.append("CUET_PYQ")
    elif safe_subfolder == "GATE_CSE":
        candidate_names.append("GATE_CSE_PYQ")

    syllabus_dir = Path(__file__).resolve().parent.parent.parent / "data" / "syllabus"

    syllabus_file = None
    for name in candidate_names:
        candidate_path = syllabus_dir / f"{name}_syllabus.json"
        if candidate_path.exists():
            syllabus_file = candidate_path
            break

    if not syllabus_file or not syllabus_file.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Syllabus not found for subfolder '{subfolder}'. Run extract_syllabus_from_pyq.py script first."
        )

    try:
        with open(syllabus_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        data.pop("subjects_data", None)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read syllabus file: {str(e)}")



@router.get("/students/{student_id}/history")
async def get_org_student_history(
    student_id: str,
    limit: int = 20,
    offset: int = 0,
    duration_months: int | None = Query(None),
    plan_id: str | None = Query(None),
    user: User = Depends(require_role(["org_admin"])),
    db: AsyncSession = Depends(get_db),
):
    import uuid
    from app.models.quiz import TestResult, QuizSession, StudyPlanTemplate, UserStudyPlan
    from sqlalchemy.orm import selectinload
    
    # Check student belongs to this org
    student_stmt = select(User).where(User.id == uuid.UUID(student_id), User.org_id == user.org_id)
    res_student = await db.execute(student_stmt)
    student = res_student.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found in your organization")

    # Pre-load ALL plan templates for this student
    all_plans_q = await db.execute(
        select(UserStudyPlan)
        .options(selectinload(UserStudyPlan.template))
        .where(UserStudyPlan.user_id == student.id)
    )
    all_user_plans = all_plans_q.scalars().all()
    plan_map: dict = {up.template_id: up.template for up in all_user_plans}

    target_pids = await _resolve_target_plan_ids(student.id, plan_id, duration_months, db)

    base_stmt = (
        select(TestResult, QuizSession)
        .join(QuizSession, TestResult.session_id == QuizSession.id)
        .where(TestResult.user_id == student.id)
    )
    if target_pids:
        base_stmt = base_stmt.where(QuizSession.plan_id.in_(target_pids))

    count_q = await db.execute(
        select(func.count()).select_from(base_stmt.subquery())
    )
    total = count_q.scalar() or 0

    results_q = await db.execute(
        base_stmt.order_by(TestResult.created_at.desc()).offset(offset).limit(limit)
    )
    rows = results_q.all()

    # Build CUET template groups: duration_months -> [template, ...]
    # Used to merge topics across all subjects for a given week
    from collections import defaultdict
    cuet_by_dur: dict = defaultdict(list)
    for up in all_user_plans:
        t = up.template
        if t.exam.startswith("CUET_") or t.exam == "CUET":
            cuet_by_dur[t.duration_months].append(t)

    import json as _json

    def _extract_topics_from_template(template, week_number: int | None) -> list[str]:
        """Return list of topic strings for the given week from one template's plan JSON."""
        if not template or not week_number:
            return []
        try:
            raw = template.plan.strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
            plan_obj = _json.loads(raw)
            week_data = next(
                (w for w in plan_obj.get("roadmap", []) if w.get("week") == week_number),
                None,
            )
            if week_data:
                return [s.get("topic", "") for s in week_data.get("subjects", []) if s.get("topic")]
        except Exception:
            pass
        return []

    def get_week_topics(template, week_number: int | None, duration_months: int | None = None) -> str:
        """Return comma-joined topics for the week."""
        if not week_number:
            return ""
        if template and (template.exam.startswith("CUET_") or template.exam == "CUET"):
            dur = duration_months or template.duration_months
            all_cuet_templates = cuet_by_dur.get(dur, [template])
            seen: set[str] = set()
            merged: list[str] = []
            for t in all_cuet_templates:
                for topic in _extract_topics_from_template(t, week_number):
                    if topic not in seen:
                        seen.add(topic)
                        merged.append(topic)
            return ", ".join(merged)
        topics = _extract_topics_from_template(template, week_number)
        return ", ".join(topics)

    items = []
    for r, sess in rows:
        details = r.details or {}
        responses = details.get("responses", [])
        attempted = details.get("answered", len(responses))
        correct = sum(1 for resp in responses if resp.get("score", 0) > 0)
        accuracy = correct / attempted if attempted > 0 else 0.0
        mode = details.get("mode", "Mixed")

        template = plan_map.get(sess.plan_id) if sess.plan_id else None
        dur = template.duration_months if template else None
        topic_str = get_week_topics(template, sess.week_number, dur) or mode.capitalize()

        items.append({
            "id": str(r.id),
            "session_id": str(r.session_id),
            "total_score": r.total_score,
            "max_score": r.max_score,
            "theta_final": r.theta_final,
            "created_at": r.created_at.isoformat(),
            "test_name": f"W-{sess.week_number} Test {sess.test_number or 1}" if sess.week_number else f"{mode.upper()} Evaluation",
            "topic": topic_str,
            "question_count": attempted,
            "accuracy": round(accuracy, 3),
            "week_number": sess.week_number,
            "test_number": sess.test_number,
            "plan_id": str(sess.plan_id) if sess.plan_id else None,
        })

    return {"total": total, "results": items}


@router.get("/students/{student_id}/performance-report")
async def get_org_student_performance_report(
    student_id: str,
    duration_months: int | None = Query(None),
    plan_id: str | None = Query(None),
    user: User = Depends(require_role(["org_admin"])),
    db: AsyncSession = Depends(get_db),
):
    import uuid
    from app.models.quiz import PerformanceSummary, QuizSession, TestResult, UserStudyPlan, StudyPlanTemplate
    from app.services.performance_service import get_strengths_weaknesses
    from app.services.ai.gemma_client import generate_performance_report
    from sqlalchemy.orm import selectinload

    # Check student belongs to this org
    student_stmt = select(User).where(User.id == uuid.UUID(student_id), User.org_id == user.org_id)
    res_student = await db.execute(student_stmt)
    student = res_student.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found in your organization")

    target_pids = await _resolve_target_plan_ids(student.id, plan_id, duration_months, db)

    perf = await get_strengths_weaknesses(user_id=student.id, db=db, plan_ids=target_pids)
    strengths = perf.get("strengths", [])
    weaknesses = perf.get("weaknesses", [])

    # Get all topics with level tags
    result = await db.execute(
        select(PerformanceSummary).where(PerformanceSummary.user_id == student.id)
    )
    summaries = result.scalars().all()
    all_topics = []
    topic_map: dict[tuple[str, str], dict] = {}

    for s in summaries:
        stats = s.weak_topics or {}
        for topic, data in stats.items():
            avg = float(data.get("avg_score", 0.0))
            attempts = int(data.get("attempts", 0))
            subj = (data.get("subject") or s.subject or "General").strip()
            key = (subj.lower(), topic.lower())
            if key not in topic_map:
                topic_map[key] = {
                    "topic": topic,
                    "subject": subj,
                    "total_score": avg * attempts,
                    "attempts": attempts,
                }
            else:
                topic_map[key]["total_score"] += avg * attempts
                topic_map[key]["attempts"] += attempts

    # Dynamic Fallback: If no PerformanceSummary rows or topics exist, derive from TestResult + StudyPlanTemplate roadmap JSON
    if not topic_map:
        tr_stmt = (
            select(TestResult, QuizSession)
            .join(QuizSession, TestResult.session_id == QuizSession.id)
            .where(TestResult.user_id == student.id)
        )
        res_tr = await db.execute(tr_stmt)
        tr_rows = res_tr.all()

        if tr_rows:
            from app.models.quiz import UserStudyPlan, StudyPlanTemplate
            from sqlalchemy.orm import selectinload
            from collections import defaultdict
            import json as _json

            plans_stmt = (
                select(UserStudyPlan)
                .options(selectinload(UserStudyPlan.template))
                .where(UserStudyPlan.user_id == student.id)
            )
            res_plans = await db.execute(plans_stmt)
            user_plans = res_plans.scalars().all()
            plan_map = {up.template_id: up.template for up in user_plans if up.template}

            cuet_by_dur: dict = defaultdict(list)
            for up in user_plans:
                t = up.template
                if t and (t.exam.startswith("CUET_") or t.exam == "CUET"):
                    cuet_by_dur[t.duration_months].append(t)

            def _extract_topics_with_subjects(template, week_num: int | None) -> list[tuple[str, str]]:
                if not template or not week_num:
                    return []
                try:
                    raw = template.plan.strip()
                    if raw.startswith("```"):
                        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
                    plan_obj = _json.loads(raw)
                    week_data = next((w for w in plan_obj.get("roadmap", []) if w.get("week") == week_num), None)
                    if week_data:
                        out = []
                        for s_item in week_data.get("subjects", []):
                            top = s_item.get("topic")
                            subj = s_item.get("subject") or template.exam.replace("CUET_", "").replace("_", " ").title()
                            if top:
                                out.append((subj, top.strip()))
                        return out
                except Exception:
                    pass
                return []

            for r, sess in tr_rows:
                pct = (r.total_score / r.max_score * 10.0) if (r.max_score and r.max_score > 0) else max(0.0, r.theta_final * 10.0)
                pct = min(10.0, max(0.0, pct))
                template = plan_map.get(sess.plan_id) if sess.plan_id else (user_plans[0].template if user_plans else None)

                topics_found = []
                if template and (template.exam.startswith("CUET_") or template.exam == "CUET"):
                    dur = template.duration_months if template else None
                    templates_to_check = cuet_by_dur.get(dur, [template]) if dur else ([template] if template else [])
                    for t in templates_to_check:
                        topics_found.extend(_extract_topics_with_subjects(t, sess.week_number))
                elif template:
                    topics_found.extend(_extract_topics_with_subjects(template, sess.week_number))

                for subj_name, top_name in topics_found:
                    key = (subj_name.lower(), top_name.lower())
                    if key not in topic_map:
                        topic_map[key] = {
                            "topic": top_name,
                            "subject": subj_name,
                            "total_score": pct,
                            "attempts": 1,
                        }
                    else:
                        topic_map[key]["total_score"] += pct
                        topic_map[key]["attempts"] += 1

    for key, data in topic_map.items():
        att = data["attempts"]
        avg = data["total_score"] / att if att > 0 else 0.0
        avg_rounded = round(float(avg), 2)
        level = "strong" if avg_rounded >= 7.0 else "moderate" if avg_rounded >= 5.0 else "weak"
        all_topics.append({
            "topic": data["topic"],
            "subject": data["subject"],
            "avg_score": avg_rounded,
            "attempts": att,
            "level": level,
        })

    # If get_strengths_weaknesses was empty but we computed all_topics dynamically
    if (not strengths and not weaknesses) and all_topics:
        sorted_desc = sorted(all_topics, key=lambda x: x["avg_score"], reverse=True)
        if len(all_topics) == 1:
            if sorted_desc[0]["avg_score"] >= 5.0:
                strengths = sorted_desc
                weaknesses = []
            else:
                strengths = []
                weaknesses = sorted_desc
        elif len(all_topics) <= 5:
            half = max(1, len(all_topics) // 2)
            strengths = sorted_desc[:half]
            weaknesses = sorted_desc[half:]
        else:
            strengths = sorted_desc[:5]
            str_topics = {s["topic"] for s in strengths}
            sorted_asc = sorted(all_topics, key=lambda x: x["avg_score"])
            weaknesses = [w for w in sorted_asc if w["topic"] not in str_topics][:5]

    # Cache logic
    first_summary = summaries[0] if summaries else None
    cached_report = first_summary.ai_report if first_summary else None

    if cached_report:
        ai_summary = cached_report
    else:
        ai_summary = await generate_performance_report(strengths, weaknesses)
        if first_summary is not None and ai_summary:
            first_summary.ai_report = ai_summary
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(first_summary, "ai_report")
            await db.commit()

    return {
        "top_strengths": [s["topic"] for s in strengths],
        "top_weaknesses": [w["topic"] for w in weaknesses],
        "strengths": strengths,
        "weaknesses": weaknesses,
        "all_topics": all_topics,
        "ai_summary": ai_summary,
    }


@router.get("/topic-breakdown")
async def get_org_topic_breakdown(
    exam: str | None = None,
    user: User = Depends(require_role(["org_admin"])),
    db: AsyncSession = Depends(get_db),
):
    """
    Org-wide aggregated topic breakdown for all students under an optional exam filter.
    Calculates weighted average scores and attempt counts per topic across all students.
    """
    from app.models.quiz import PerformanceSummary, UserStudyPlan, StudyPlanTemplate

    org_id = user.org_id

    # 1. Fetch all student IDs in this org
    student_stmt = select(User.id, User.metadata_).where(
        User.org_id == org_id,
        User.role == UserRole.student
    )
    res_students = await db.execute(student_stmt)
    student_rows = res_students.all()

    if not student_rows:
        return {
            "strengths": [],
            "weaknesses": [],
            "all_topics": [],
            "total_students_with_data": 0
        }

    org_student_ids = [sid for sid, _ in student_rows]
    candidate_user_ids: set[uuid.UUID] = set()
    target_template_ids: set[uuid.UUID] = set()
    dynamic_exam_subjects: set[str] = set()

    target_subject_clean: str | None = None
    is_gate_selected = False

    if exam and exam.strip():
        exam_str = exam.strip()
        EXAM_ALIAS_LOCAL: dict[str, str] = {v: k for k, v in EXAM_DISPLAY.items()}
        exam_key = EXAM_ALIAS_LOCAL.get(exam_str, exam_str)
        exam_display = EXAM_DISPLAY.get(exam_str, exam_str)

        key_upper = exam_key.upper()
        if key_upper.startswith("GATE"):
            is_gate_selected = True
        elif "_" in exam_key:
            parts = exam_key.split("_", 1)
            raw_sub = parts[1].replace("_", " ").strip().lower()
            if raw_sub and raw_sub != parts[0].lower():
                target_subject_clean = raw_sub

        match_targets = {
            exam_str.lower(),
            exam_key.lower(),
            exam_display.lower(),
            exam_str.replace(" ", "_").lower(),
            exam_str.replace("_", " ").lower()
        }

        # Check 1: Users with matching allocated_exams or selected_exams in metadata_
        for sid, meta in student_rows:
            meta_dict = meta or {}
            allocated = [str(x).lower().strip() for x in meta_dict.get("allocated_exams", [])]
            selected = [str(x).lower().strip() for x in meta_dict.get("selected_exams", [])]
            combined = allocated + selected

            if any(t in combined for t in match_targets) or any(any(t in c or c in t for c in combined) for t in match_targets):
                candidate_user_ids.add(sid)

        # Dynamically query StudyPlanTemplate IDs matching this exam
        tmpl_stmt = select(StudyPlanTemplate.id).where(
            or_(
                func.lower(StudyPlanTemplate.exam).in_(list(match_targets)),
                func.lower(StudyPlanTemplate.exam).startswith(exam_str.lower()),
                func.lower(StudyPlanTemplate.exam).startswith(exam_key.lower()),
            )
        )
        res_tmpls = await db.execute(tmpl_stmt)
        for tid in res_tmpls.scalars().all():
            target_template_ids.add(tid)

        # Dynamically query ContentRegistry subfolders & subjects matching this exam
        cr_stmt = select(ContentRegistry.subfolder, ContentRegistry.subject).where(
            or_(
                func.lower(ContentRegistry.subfolder).in_(list(match_targets)),
                func.lower(ContentRegistry.subfolder).startswith(exam_str.lower()),
                func.lower(ContentRegistry.subfolder).startswith(exam_key.lower()),
            )
        ).distinct()
        res_cr = await db.execute(cr_stmt)
        for sf, subj in res_cr.all():
            if sf:
                dynamic_exam_subjects.add(sf.strip().lower())
            if subj:
                dynamic_exam_subjects.add(subj.strip().lower())

        # Check 2: Users registered in UserStudyPlan matching this exam
        plan_stmt = (
            select(UserStudyPlan.user_id)
            .join(StudyPlanTemplate, UserStudyPlan.template_id == StudyPlanTemplate.id)
            .where(
                UserStudyPlan.user_id.in_(org_student_ids),
                UserStudyPlan.template_id.in_(list(target_template_ids)) if target_template_ids else or_(
                    func.lower(StudyPlanTemplate.exam).in_(list(match_targets)),
                    func.lower(StudyPlanTemplate.exam).contains(exam_str.lower())
                )
            )
        )
        res_plans = await db.execute(plan_stmt)
        for row in res_plans.all():
            candidate_user_ids.add(row[0])

        # Check 3: Fall back to all org students if no metadata/plan matches found
        if not candidate_user_ids:
            candidate_user_ids = set(org_student_ids)
    else:
        candidate_user_ids = set(org_student_ids)

    # 2. Fetch PerformanceSummary for candidate students
    stmt = select(PerformanceSummary).where(PerformanceSummary.user_id.in_(list(candidate_user_ids)))
    res_perf = await db.execute(stmt)
    summaries = res_perf.scalars().all()

    # Topic accumulator: topic → { subject, total_weighted_score, total_attempts, user_set }
    topic_data: dict[str, dict] = {}
    users_with_data = set()

    for s in summaries:
        stats = s.weak_topics or {}
        for topic, data in stats.items():
            avg_score = float(data.get("avg_score", 0.0))
            attempts = int(data.get("attempts", 0))
            subject = (data.get("subject") or s.subject or "General").strip()
            subj_lower = subject.lower()

            # Dynamic subject scoping per exam selection
            if is_gate_selected:
                if any(cs in subj_lower for cs in ("history", "economics", "accountancy", "biology", "chemistry", "physics", "political science")):
                    continue
            elif target_subject_clean:
                if target_subject_clean in ("gat", "general test", "general aptitude"):
                    if not any(kw in subj_lower for kw in ("gat", "general")):
                        continue
                else:
                    if not (target_subject_clean in subj_lower or subj_lower in target_subject_clean):
                        continue
            elif exam and exam.strip():
                matches_plan = s.plan_id in target_template_ids if (s.plan_id and target_template_ids) else False
                matches_subject = any(ds in subj_lower or subj_lower in ds for ds in dynamic_exam_subjects) if dynamic_exam_subjects else False
                if not (matches_plan or matches_subject):
                    continue
            elif exam and exam.strip():
                matches_plan = s.plan_id in target_template_ids if (s.plan_id and target_template_ids) else False
                matches_subject = any(ds in subj_lower or subj_lower in ds for ds in dynamic_exam_subjects) if dynamic_exam_subjects else False
                if not (matches_plan or matches_subject):
                    continue

            if topic not in topic_data:
                topic_data[topic] = {
                    "subject": subject,
                    "total_weighted_score": 0.0,
                    "total_attempts": 0,
                    "user_set": set()
                }

            topic_data[topic]["total_weighted_score"] += avg_score * attempts
            topic_data[topic]["total_attempts"] += attempts
            topic_data[topic]["user_set"].add(s.user_id)
            users_with_data.add(s.user_id)

    all_topics = []
    for topic, info in topic_data.items():
        total_att = info["total_attempts"]
        avg = round(info["total_weighted_score"] / total_att, 2) if total_att > 0 else 0.0
        level = "strong" if avg >= 7.0 else "moderate" if avg >= 5.0 else "weak"
        all_topics.append({
            "topic": topic,
            "subject": info["subject"],
            "avg_score": avg,
            "attempts": total_att,
            "student_count": len(info["user_set"]),
            "level": level
        })

    # Sort all_topics by avg_score descending
    all_topics.sort(key=lambda x: x["avg_score"], reverse=True)

    strengths = [t for t in all_topics if t["level"] == "strong"][:5]
    weaknesses = sorted([t for t in all_topics if t["level"] == "weak"], key=lambda x: x["avg_score"])[:5]

    # If no topics found in strong/weak categories due to mid-range scores, populate top/bottom
    if not strengths and all_topics:
        strengths = all_topics[:5]
    if not weaknesses and all_topics:
        weaknesses = sorted(all_topics, key=lambda x: x["avg_score"])[:5]

    return {
        "strengths": strengths,
        "weaknesses": weaknesses,
        "all_topics": all_topics,
        "total_students_with_data": len(users_with_data)
    }


# ---------------------------------------------------------------------------
# Admin-view endpoints: super_admin reads any org's data by org_id
# ---------------------------------------------------------------------------

@router.get("/admin-view/{org_id}/dashboard")
async def admin_view_org_dashboard(
    org_id: str,
    exam: str | None = None,
    user: User = Depends(require_role(["super_admin"])),
    db: AsyncSession = Depends(get_db),
):
    """
    Super-admin view of any org's dashboard metrics.
    Identical logic to org_dashboard_v2 but org_id comes from the path.
    Also returns the most_attempted_exam for the summary card.
    """
    from app.models.quiz import TestResult, QuizSession, StudyPlanTemplate, UserStudyPlan
    from datetime import datetime, timedelta
    from sqlalchemy import and_

    try:
        org_uuid = uuid.UUID(org_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid org_id format")

    # ── 1. Org-wide summary cards ──────────────────────────────────────────
    res_students = await db.execute(
        select(func.count(User.id)).where(User.org_id == org_uuid, User.role == UserRole.student)
    )
    total_students = res_students.scalar() or 0

    res_tests = await db.execute(
        select(func.count(TestResult.id))
        .select_from(TestResult)
        .join(User, TestResult.user_id == User.id)
        .where(User.org_id == org_uuid)
    )
    total_tests = res_tests.scalar() or 0

    res_sessions = await db.execute(
        select(func.count(QuizSession.id), func.count(QuizSession.completed_at))
        .select_from(QuizSession)
        .join(User, QuizSession.user_id == User.id)
        .where(User.org_id == org_uuid)
    )
    sess_row = res_sessions.first()
    total_sessions = sess_row[0] if sess_row else 0
    completed_sessions = sess_row[1] if sess_row else 0
    completion_rate = round((completed_sessions / total_sessions * 100), 1) if total_sessions > 0 else 0.0

    # ── 2. Available exams ─────────────────────────────────────────────────
    res_exams = await db.execute(
        select(StudyPlanTemplate.exam)
        .select_from(StudyPlanTemplate)
        .join(UserStudyPlan, UserStudyPlan.template_id == StudyPlanTemplate.id)
        .join(User, UserStudyPlan.user_id == User.id)
        .where(User.org_id == org_uuid)
        .distinct()
    )
    raw_exams = [row[0] for row in res_exams.all()]
    available_exams = [EXAM_DISPLAY.get(e, e) for e in raw_exams]

    # ── 2b. Most attempted exam ────────────────────────────────────────────
    res_most = await db.execute(
        select(StudyPlanTemplate.exam, func.count(TestResult.id).label("test_count"))
        .select_from(TestResult)
        .join(QuizSession, TestResult.session_id == QuizSession.id)
        .join(UserStudyPlan, and_(
            QuizSession.user_id == UserStudyPlan.user_id,
            QuizSession.plan_id == UserStudyPlan.template_id,
        ))
        .join(StudyPlanTemplate, UserStudyPlan.template_id == StudyPlanTemplate.id)
        .join(User, TestResult.user_id == User.id)
        .where(User.org_id == org_uuid)
        .group_by(StudyPlanTemplate.exam)
        .order_by(func.count(TestResult.id).desc())
        .limit(1)
    )
    most_row = res_most.first()
    most_attempted_exam = EXAM_DISPLAY.get(most_row[0], most_row[0]) if most_row else None

    # ── 3. Resolve selected exam ───────────────────────────────────────────
    EXAM_ALIAS_LOCAL: dict[str, str] = {v: k for k, v in EXAM_DISPLAY.items()}
    selected_exam_key = None
    if exam:
        selected_exam_key = EXAM_ALIAS_LOCAL.get(exam, exam)
        if selected_exam_key not in raw_exams and exam in raw_exams:
            selected_exam_key = exam
    if not selected_exam_key and raw_exams:
        selected_exam_key = raw_exams[0]

    students_per_batch: list = []
    avg_score_per_batch: list = []
    score_distribution: list = []
    weekly_active_users: list = []

    if selected_exam_key:
        durations = get_batch_durations_for_exam(selected_exam_key)

        res_counts = await db.execute(
            select(StudyPlanTemplate.duration_months, func.count(func.distinct(UserStudyPlan.user_id)))
            .select_from(UserStudyPlan)
            .join(StudyPlanTemplate, UserStudyPlan.template_id == StudyPlanTemplate.id)
            .join(User, UserStudyPlan.user_id == User.id)
            .where(User.org_id == org_uuid, StudyPlanTemplate.exam == selected_exam_key)
            .group_by(StudyPlanTemplate.duration_months)
        )
        batch_counts = {dur: cnt for dur, cnt in res_counts.all()}

        for dur in durations:
            students_per_batch.append({"batch": BATCH_LABELS[dur], "count": batch_counts.get(dur, 0)})

        res_distinct = await db.execute(
            select(func.count(func.distinct(UserStudyPlan.user_id)))
            .select_from(UserStudyPlan)
            .join(StudyPlanTemplate, UserStudyPlan.template_id == StudyPlanTemplate.id)
            .join(User, UserStudyPlan.user_id == User.id)
            .where(User.org_id == org_uuid, StudyPlanTemplate.exam == selected_exam_key)
        )
        total_registered = res_distinct.scalar() or 0
        unregistered_cnt = max(0, total_students - total_registered)
        if unregistered_cnt > 0:
            students_per_batch.append({"batch": "Not Registered", "count": unregistered_cnt})

        is_cuet = selected_exam_key == "CUET" or selected_exam_key.startswith("CUET_")
        valid_plan_id_to_dur_admin: dict[uuid.UUID, int] = {}

        if is_cuet:
            cuet_students_stmt = (
                select(UserStudyPlan.user_id, StudyPlanTemplate.duration_months)
                .join(StudyPlanTemplate, UserStudyPlan.template_id == StudyPlanTemplate.id)
                .join(User, UserStudyPlan.user_id == User.id)
                .where(User.org_id == org_uuid, StudyPlanTemplate.exam == selected_exam_key)
            )
            res_cuet_students = await db.execute(cuet_students_stmt)
            user_target_durations = defaultdict(set)
            for uid, dur in res_cuet_students.all():
                user_target_durations[uid].add(dur)

            if user_target_durations:
                all_cuet_plans_stmt = (
                    select(UserStudyPlan.user_id, UserStudyPlan.template_id, StudyPlanTemplate.duration_months)
                    .join(StudyPlanTemplate, UserStudyPlan.template_id == StudyPlanTemplate.id)
                    .where(
                        UserStudyPlan.user_id.in_(list(user_target_durations.keys())),
                        or_(
                            StudyPlanTemplate.exam == "CUET",
                            StudyPlanTemplate.exam.like("CUET_%")
                        )
                    )
                )
                res_all_cuet = await db.execute(all_cuet_plans_stmt)
                for uid, tid, dur in res_all_cuet.all():
                    if dur in user_target_durations[uid]:
                        valid_plan_id_to_dur_admin[tid] = dur
        else:
            non_cuet_stmt = (
                select(UserStudyPlan.template_id, StudyPlanTemplate.duration_months)
                .join(StudyPlanTemplate, UserStudyPlan.template_id == StudyPlanTemplate.id)
                .join(User, UserStudyPlan.user_id == User.id)
                .where(User.org_id == org_uuid, StudyPlanTemplate.exam == selected_exam_key)
            )
            res_non_cuet = await db.execute(non_cuet_stmt)
            valid_plan_id_to_dur_admin = {tid: dur for tid, dur in res_non_cuet.all()}

        avg_scores = {}
        if valid_plan_id_to_dur_admin:
            res_avgs = await db.execute(
                select(
                    QuizSession.plan_id,
                    func.avg(
                        func.cast(TestResult.total_score, Float) /
                        func.nullif(func.cast(TestResult.max_score, Float), 0) * 100
                    ),
                )
                .select_from(TestResult)
                .join(QuizSession, TestResult.session_id == QuizSession.id)
                .join(User, TestResult.user_id == User.id)
                .where(
                    User.org_id == org_uuid,
                    QuizSession.plan_id.in_(list(valid_plan_id_to_dur_admin.keys()))
                )
                .group_by(QuizSession.plan_id)
            )
            dur_sums = defaultdict(float)
            dur_counts = defaultdict(int)
            for pid, avg_val in res_avgs.all():
                if avg_val is not None and pid in valid_plan_id_to_dur_admin:
                    dur = valid_plan_id_to_dur_admin[pid]
                    dur_sums[dur] += float(avg_val)
                    dur_counts[dur] += 1
            avg_scores = {dur: dur_sums[dur] / dur_counts[dur] for dur in dur_counts}

        for dur in durations:
            avg_score_per_batch.append({
                "batch": BATCH_LABELS[dur],
                "avg_score": round(float(avg_scores.get(dur) or 0.0), 1),
            })

        all_scores = []
        if valid_plan_id_to_dur_admin:
            res_scores = await db.execute(
                select(
                    QuizSession.plan_id,
                    User.id,
                    func.avg(
                        func.cast(TestResult.total_score, Float) /
                        func.nullif(func.cast(TestResult.max_score, Float), 0) * 100
                    ).label("avg_pct")
                )
                .select_from(TestResult)
                .join(QuizSession, TestResult.session_id == QuizSession.id)
                .join(User, TestResult.user_id == User.id)
                .where(
                    User.org_id == org_uuid,
                    QuizSession.plan_id.in_(list(valid_plan_id_to_dur_admin.keys())),
                    TestResult.max_score > 0,
                )
                .group_by(QuizSession.plan_id, User.id)
            )
            all_scores = [
                (valid_plan_id_to_dur_admin[pid], avg_pct)
                for pid, uid, avg_pct in res_scores.all()
                if pid in valid_plan_id_to_dur_admin
            ]

        buckets = list(range(0, 101, 10))
        dist_data = []
        for i in range(len(buckets) - 1):
            low, high = buckets[i], buckets[i + 1]
            row: dict = {"marks": f"{low}-{high}"}
            for dur in durations:
                key = f"{dur}_months"
                cnt = sum(
                    1 for dm, avg_pct in all_scores
                    if dm == dur and avg_pct is not None and low <= avg_pct < (high if high < 100 else high + 1)
                )
                row[key] = cnt
            dist_data.append(row)
        score_distribution = dist_data

        now = datetime.utcnow()
        today_start = datetime(now.year, now.month, now.day)
        last_7_days = [today_start - timedelta(days=i) for i in range(6, -1, -1)]

        dau_map = {}
        if valid_plan_id_to_dur_admin:
            day_col = func.date_trunc("day", QuizSession.started_at)
            res_dau = await db.execute(
                select(day_col.label("day"), func.count(func.distinct(QuizSession.user_id)).label("active_users"))
                .select_from(QuizSession)
                .join(User, QuizSession.user_id == User.id)
                .where(
                    User.org_id == org_uuid,
                    QuizSession.plan_id.in_(list(valid_plan_id_to_dur_admin.keys())),
                    QuizSession.started_at >= last_7_days[0],
                )
                .group_by(day_col)
            )
            for row in res_dau.all():
                d_val = row.day.date() if isinstance(row.day, datetime) else row.day
                if d_val:
                    dau_map[d_val] = row.active_users

        for dt_val in last_7_days:
            d_key = dt_val.date()
            weekly_active_users.append({
                "week": dt_val.strftime("%b %d"),
                "active_users": dau_map.get(d_key, 0)
            })

    return {
        "total_students": total_students,
        "total_tests": total_tests,
        "completion_rate": completion_rate,
        "most_attempted_exam": most_attempted_exam,
        "available_exams": available_exams if available_exams else ["No exams"],
        "selected_exam": EXAM_DISPLAY.get(selected_exam_key, selected_exam_key) if selected_exam_key else None,
        "students_per_batch": students_per_batch,
        "avg_score_per_batch": avg_score_per_batch,
        "score_distribution": score_distribution,
        "weekly_active_users": weekly_active_users,
    }


@router.get("/admin-view/{org_id}/topic-breakdown")
async def admin_view_org_topic_breakdown(
    org_id: str,
    exam: str | None = None,
    user: User = Depends(require_role(["super_admin"])),
    db: AsyncSession = Depends(get_db),
):
    """
    Super-admin view of any org's topic breakdown.
    Identical logic to get_org_topic_breakdown but org_id comes from the path.
    """
    from app.models.quiz import PerformanceSummary, UserStudyPlan, StudyPlanTemplate

    try:
        org_uuid = uuid.UUID(org_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid org_id format")

    student_stmt = select(User.id, User.metadata_).where(
        User.org_id == org_uuid,
        User.role == UserRole.student
    )
    res_students = await db.execute(student_stmt)
    student_rows = res_students.all()

    if not student_rows:
        return {"strengths": [], "weaknesses": [], "all_topics": [], "total_students_with_data": 0}

    org_student_ids = [sid for sid, _ in student_rows]
    candidate_user_ids: set[uuid.UUID] = set()
    target_template_ids: set[uuid.UUID] = set()
    dynamic_exam_subjects: set[str] = set()

    target_subject_clean: str | None = None
    is_gate_selected = False

    if exam and exam.strip():
        exam_str = exam.strip()
        EXAM_ALIAS_LOCAL: dict[str, str] = {v: k for k, v in EXAM_DISPLAY.items()}
        exam_key = EXAM_ALIAS_LOCAL.get(exam_str, exam_str)
        exam_display = EXAM_DISPLAY.get(exam_str, exam_str)

        key_upper = exam_key.upper()
        if key_upper.startswith("GATE"):
            is_gate_selected = True
        elif "_" in exam_key:
            parts = exam_key.split("_", 1)
            raw_sub = parts[1].replace("_", " ").strip().lower()
            if raw_sub and raw_sub != parts[0].lower():
                target_subject_clean = raw_sub

        match_targets = {
            exam_str.lower(), exam_key.lower(), exam_display.lower(),
            exam_str.replace(" ", "_").lower(), exam_str.replace("_", " ").lower()
        }

        for sid, meta in student_rows:
            meta_dict = meta or {}
            allocated = [str(x).lower().strip() for x in meta_dict.get("allocated_exams", [])]
            selected = [str(x).lower().strip() for x in meta_dict.get("selected_exams", [])]
            combined = allocated + selected
            if any(t in combined for t in match_targets) or any(any(t in c or c in t for c in combined) for t in match_targets):
                candidate_user_ids.add(sid)

        plan_stmt = (
            select(UserStudyPlan.user_id)
            .join(StudyPlanTemplate, UserStudyPlan.template_id == StudyPlanTemplate.id)
            .where(
                UserStudyPlan.user_id.in_(org_student_ids),
                or_(
                    func.lower(StudyPlanTemplate.exam).in_(list(match_targets)),
                    func.lower(StudyPlanTemplate.exam).contains(exam_str.lower())
                )
            )
        )
        res_plans = await db.execute(plan_stmt)
        for row in res_plans.all():
            candidate_user_ids.add(row[0])

        if not candidate_user_ids:
            candidate_user_ids = set(org_student_ids)
    else:
        candidate_user_ids = set(org_student_ids)

    stmt = select(PerformanceSummary).where(PerformanceSummary.user_id.in_(list(candidate_user_ids)))
    res_perf = await db.execute(stmt)
    summaries = res_perf.scalars().all()

    topic_data: dict[str, dict] = {}
    users_with_data = set()

    for s in summaries:
        stats = s.weak_topics or {}
        for topic, data in stats.items():
            avg_score = float(data.get("avg_score", 0.0))
            attempts = int(data.get("attempts", 0))
            subject = (data.get("subject") or s.subject or "General").strip()
            subj_lower = subject.lower()

            # Dynamic subject scoping per exam selection
            if is_gate_selected:
                if any(cs in subj_lower for cs in ("history", "economics", "accountancy", "biology", "chemistry", "physics", "political science")):
                    continue
            elif target_subject_clean:
                if target_subject_clean in ("gat", "general test", "general aptitude"):
                    if not any(kw in subj_lower for kw in ("gat", "general")):
                        continue
                else:
                    if not (target_subject_clean in subj_lower or subj_lower in target_subject_clean):
                        continue

            if topic not in topic_data:
                topic_data[topic] = {"subject": subject, "total_weighted_score": 0.0, "total_attempts": 0, "user_set": set()}
            topic_data[topic]["total_weighted_score"] += avg_score * attempts
            topic_data[topic]["total_attempts"] += attempts
            topic_data[topic]["user_set"].add(s.user_id)
            users_with_data.add(s.user_id)

    all_topics = []
    for topic, info in topic_data.items():
        total_att = info["total_attempts"]
        avg = round(info["total_weighted_score"] / total_att, 2) if total_att > 0 else 0.0
        level = "strong" if avg >= 7.0 else "moderate" if avg >= 5.0 else "weak"
        all_topics.append({
            "topic": topic, "subject": info["subject"],
            "avg_score": avg, "attempts": total_att,
            "student_count": len(info["user_set"]), "level": level
        })

    all_topics.sort(key=lambda x: x["avg_score"], reverse=True)
    strengths = [t for t in all_topics if t["level"] == "strong"][:5]
    weaknesses = sorted([t for t in all_topics if t["level"] == "weak"], key=lambda x: x["avg_score"])[:5]
    if not strengths and all_topics:
        strengths = all_topics[:5]
    if not weaknesses and all_topics:
        weaknesses = sorted(all_topics, key=lambda x: x["avg_score"])[:5]

    return {
        "strengths": strengths,
        "weaknesses": weaknesses,
        "all_topics": all_topics,
        "total_students_with_data": len(users_with_data)
    }




