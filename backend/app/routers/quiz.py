import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
import redis.asyncio as aioredis

from app.dependencies import get_db, get_redis
from app.middleware.auth import get_current_user
from app.models.user import User
from app.models.quiz import QuizSession, UserResponse, TestResult
from app.models.content_registry import ContentRegistry, ContentAccess, Visibility
from app.schemas.quiz import (
    QuizStartRequest,
    PyqQuizStartRequest,
    QuizStartResponse,
    AnswerRequest,
    AnswerResponse,
    QuizCompleteResponse,
    QuestionOut,
    StudyPlanRequest,
    StudyPlanResponse,
    WeeklyTestRequest,
)
from app.services.quiz_engine import start_session, process_answer, complete_session
from app.services.question_service import get_questions_for_session, get_questions_from_multiple_registries, get_pyq_subtopics, match_questions_for_targets
from app.services.evaluation_service import evaluate_answer, generate_session_summary, run_and_store_summary
from app.services.performance_service import update_topic_performance
from app.services.ai.gemini_client import generate_study_plan
from app.services.ai.gemma_client import generate_grading, generate_summary
import json as json_mod
import re

router = APIRouter()


# @router.post("/start-pyq", response_model=QuizStartResponse)
# async def start_pyq_quiz(
#     request: PyqQuizStartRequest,
#     user: User = Depends(get_current_user),
#     db: AsyncSession = Depends(get_db),
#     redis: aioredis.Redis = Depends(get_redis),
# ):
#     from app.models.content_registry import SourceType
#     
#     # 1. Get all PYQ registries accessible to this user
#     if user.role.value == "super_admin":
#         stmt = select(ContentRegistry).where(ContentRegistry.source_type == SourceType.pyq)
#     else:
#         stmt = (
#             select(ContentRegistry)
#             .outerjoin(ContentAccess)
#             .where(
#                 ContentRegistry.source_type == SourceType.pyq,
#                 or_(
#                     ContentRegistry.visibility == Visibility.global_,
#                     ContentAccess.org_id == user.org_id
#                 )
#             )
#             .distinct()
#         )
#     result = await db.execute(stmt)
#     records = result.scalars().all()
#     
#     registries = [
#         {"id": str(r.id), "file_path": r.file_path}
#         for r in records
#     ]
#     
#     # 2. Get combined questions
#     questions = await get_questions_from_multiple_registries(
#         registries=registries,
#         subtopics=request.subtopics,
#         redis=redis,
#     )
#     
#     if not questions:
#         raise HTTPException(status_code=404, detail="No questions available for selected subtopics")
# 
#     # 3. Start session (content_registry_id can be None for combined PYQ)
#     session_data = await start_session(
#         user_id=str(user.id),
#         content_registry_id=None, # Combined pool
#         mode=request.mode,
#         questions=questions,
#         redis=redis,
#         db=db,
#         metadata={"prep_duration": request.prep_duration}
#     )
# 
#     question = session_data.get("question")
#     return QuizStartResponse(
#         session_id=session_data["session_id"],
#         question=QuestionOut(**question).model_dump(),
#         total_questions=session_data["total_questions"],
#     )
# 
# 
# @router.post("/start", response_model=QuizStartResponse)
# async def start_quiz(
#     request: QuizStartRequest,
#     user: User = Depends(get_current_user),
#     db: AsyncSession = Depends(get_db),
#     redis: aioredis.Redis = Depends(get_redis),
# ):
#     result = await db.execute(
#         select(ContentRegistry).where(ContentRegistry.id == uuid.UUID(request.content_registry_id))
#     )
#     registry = result.scalar_one_or_none()
#     if not registry:
#         raise HTTPException(status_code=404, detail="Content not found")
# 
#     questions = await get_questions_for_session(
#         content_registry_id=str(registry.id),
#         file_path=registry.file_path,
#         redis=redis,
#         topics=request.topics,
#     )
#     if not questions:
#         raise HTTPException(status_code=404, detail="No questions available")
# 
#     session_data = await start_session(
#         user_id=str(user.id),
#         content_registry_id=str(registry.id),
#         mode=request.mode,
#         questions=questions,
#         redis=redis,
#         db=db,
#     )
# 
#     question = session_data.get("question")
#     if not question:
#         raise HTTPException(status_code=500, detail="Failed to select first question")
# 
#     return QuizStartResponse(
#         session_id=session_data["session_id"],
#         question=QuestionOut(**question).model_dump(),
#         total_questions=session_data["total_questions"],
#     )


@router.post("/answer", response_model=AnswerResponse)
async def submit_answer(
    request: AnswerRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    from app.services.quiz_engine import get_session_state, _get_question_id
    from app.utils.logging import logger

    if not request.question_id:
        raise HTTPException(status_code=400, detail="question_id is required")

    state = await get_session_state(request.session_id, redis)
    if not state:
        logger.warning("quiz_session_not_found", session_id=request.session_id)
        raise HTTPException(status_code=404, detail="Quiz session not found")

    questions = state.get("questions", [])
    requested_id = request.question_id.strip()
    # Primary lookup: composite "source_file::question_number" ID
    question = next(
        (q for q in questions if _get_question_id(q) == requested_id),
        None,
    )
    # Fallback: bare question_number (protects stale sessions / edge cases)
    if not question:
        bare_id = requested_id.split("::")[-1]
        question = next(
            (q for q in questions
             if str(q.get("question_number", q.get("id", ""))) == bare_id),
            None,
        )
        if question:
            logger.warning(
                "question_id_bare_fallback_used",
                question_id=requested_id,
                bare_id=bare_id,
            )
    if not question:
        logger.warning(
            "question_not_found_in_session",
            session_id=request.session_id,
            question_id=requested_id,
            question_count=len(questions),
        )
        raise HTTPException(status_code=404, detail="Question not found in session")

    eval_result = await evaluate_answer(question, request.answer, state.get("mode", "subject"))

    response = UserResponse(
        id=uuid.uuid4(),
        session_id=uuid.UUID(request.session_id),
        question_id=request.question_id,
        answer=request.answer,
        score=eval_result["score"],
        time_taken=request.time_taken,
        voice_confidence=request.voice_confidence,
    )
    db.add(response)
    await db.flush()

    engine_result = await process_answer(
        session_id=request.session_id,
        question_id=request.question_id,
        score=eval_result["score"],
        redis=redis,
    )

    next_q = engine_result.get("next_question")
    return AnswerResponse(
        score=eval_result["score"],
        correct_answer=eval_result.get("correct_answer"),
        explanation=eval_result.get("explanation"),
        next_question=QuestionOut(**next_q) if next_q else None,
        is_complete=engine_result.get("is_complete", False),
        theta=engine_result.get("theta", 0.0),
    )


@router.post("/complete", response_model=QuizCompleteResponse)
async def complete_quiz(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    state = await complete_session(session_id, redis)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")

    session_q = await db.execute(
        select(QuizSession).where(QuizSession.id == uuid.UUID(session_id))
    )
    session = session_q.scalar_one_or_none()
    if session:
        session.theta = state["theta"]
        session.completed_at = datetime.utcnow()

    from app.services.quiz_engine import _get_question_id as _qid

    responses_q = await db.execute(
        select(UserResponse).where(UserResponse.session_id == uuid.UUID(session_id))
    )
    responses = responses_q.scalars().all()
    response_map = {r.question_id: r for r in responses}

    all_questions = state.get("questions", [])
    total_q_count = state.get("total_questions", len(all_questions))

    details_responses = []
    total_score = 0.0
    for q in all_questions[:total_q_count]:
        qid = _qid(q)
        r = response_map.get(qid)
        
        # Extract options (following same sanitization as _sanitize_question)
        options = q.get("options")
        if options is None:
            opts = []
            is_irt = isinstance(q.get("a"), (int, float)) and isinstance(q.get("b"), (int, float))
            if not is_irt:
                for key in ("a", "b", "c", "d"):
                    val = q.get(key)
                    if val is not None:
                        opts.append(str(val))
                options = opts if opts else None

        if r:
            total_score += float(r.score)
            details_responses.append({
                "question_text": q.get("question", q.get("text", "Unknown")),
                "answer": r.answer,
                "correct_answer": q.get("answer", q.get("correct_answer")),
                "score": float(r.score),
                "voice_confidence": float(r.voice_confidence) if r.voice_confidence is not None else None,
                "topic": q.get("topic", "General"),
                "explanation": q.get("explanation", ""),
                "options": options,
            })
        else:
            details_responses.append({
                "question_text": q.get("question", q.get("text", "Unknown")),
                "answer": "",
                "correct_answer": q.get("answer", q.get("correct_answer")),
                "score": 0.0,
                "voice_confidence": None,
                "topic": q.get("topic", "General"),
                "explanation": q.get("explanation", ""),
                "options": options,
            })

    max_score = total_q_count * 10.0

    # Summary is generated asynchronously in the background — respond immediately
    # with ai_summary=None, then the background task stores it when Ollama finishes.
    ai_summary = None

    # If this was a weekly test, mark it as completed only when ALL sub-tests for the week are done
    metadata = state.get("metadata")
    if metadata and "plan_id" in metadata and "week_number" in metadata:
        from app.models.quiz import UserStudyPlan, StudyPlanTemplate, CuetEnrollment
        plan_id = metadata["plan_id"]
        week_num = metadata["week_number"]
        test_num = metadata.get("test_number", 1)

        # Determine how many tests are required for this plan's duration
        tmpl_q2 = await db.execute(
            select(StudyPlanTemplate).where(StudyPlanTemplate.id == uuid.UUID(plan_id))
        )
        tmpl2 = tmpl_q2.scalar_one_or_none()
        duration = tmpl2.duration_months if tmpl2 else 6
        tests_per_week = 2 if duration >= 12 else 3

        is_cuet = tmpl2 and (tmpl2.exam.startswith("CUET_") or tmpl2.exam == "CUET")
        cuet_tmpl_ids = [uuid.UUID(plan_id)]
        if is_cuet:
            cuet_q = await db.execute(
                select(CuetEnrollment).where(
                    CuetEnrollment.user_id == user.id,
                    CuetEnrollment.duration_months == duration,
                )
            )
            cuet_enrollments = cuet_q.scalars().all()
            if cuet_enrollments:
                cuet_tmpl_ids = [e.template_id for e in cuet_enrollments]

        # Count how many distinct test_numbers for this week now have a completed TestResult
        done_sessions_q = await db.execute(
            select(QuizSession).where(
                QuizSession.user_id == user.id,
                QuizSession.plan_id.in_(cuet_tmpl_ids),
                QuizSession.week_number == week_num,
                QuizSession.completed_at.isnot(None),
            )
        )
        done_sessions = done_sessions_q.scalars().all()
        # Count sessions that have a TestResult (flush so our new one is visible)
        await db.flush()
        done_count = 0
        for ds in done_sessions:
            tr_check = await db.execute(
                select(TestResult.id).where(TestResult.session_id == ds.id)
            )
            if tr_check.scalar_one_or_none():
                done_count += 1
        # Include the current session we're completing right now
        done_count += 1

        if done_count >= tests_per_week:
            # All sub-tests done — mark week as complete across all matching enrolled plans
            user_plans_q = await db.execute(
                select(UserStudyPlan).where(
                    UserStudyPlan.user_id == user.id,
                    UserStudyPlan.template_id.in_(cuet_tmpl_ids),
                )
            )
            target_plans = user_plans_q.scalars().all()
            for p in target_plans:
                completed = set(p.completed_weeks or [])
                completed.add(week_num)
                p.completed_weeks = sorted(list(completed))
                if week_num >= p.current_week:
                    p.current_week = week_num + 1


    test_result = TestResult(
        id=uuid.uuid4(),
        session_id=uuid.UUID(session_id),
        user_id=user.id,
        total_score=total_score,
        max_score=max_score,
        theta_final=state["theta"],
        ai_summary=None,  # Filled by background task after Ollama completes
        details={
            "answered": len(responses), 
            "mode": state.get("mode"),
            "responses": details_responses
        },
    )
    db.add(test_result)

    question_map = {
        _qid(q): q
        for q in all_questions
    }

    # ── Resolve subject routing for update_topic_performance ────────────────
    # For single-subject tests: canonical_subject overrides mixed question subjects
    # For combined CUET tests: subject_to_plan_id routes each canonical subject to its plan UUID
    from app.services.performance_service import exam_key_to_canonical_subject
    from app.models.quiz import StudyPlanTemplate as _SPT

    session_plan_id: Optional[uuid.UUID] = None
    if metadata and "plan_id" in metadata:
        try:
            session_plan_id = uuid.UUID(metadata["plan_id"])
        except (ValueError, TypeError):
            pass

    canonical_subj: Optional[str] = None
    subject_plan_map: Optional[dict[str, uuid.UUID]] = None


    if metadata and metadata.get("plan_ids") and metadata.get("exam_keys"):
        # Combined CUET test: map canonical subject names (lowercase) → their plan UUIDs
        # Use canonical name so it matches what questions will be normalised to
        subject_plan_map = {}
        for pid_str, exam_key in zip(metadata["plan_ids"], metadata["exam_keys"]):
            try:
                pid = uuid.UUID(pid_str)
                canonical = exam_key_to_canonical_subject(exam_key).lower()  # e.g. "general aptitude"
                subject_plan_map[canonical] = pid
            except (ValueError, TypeError):
                pass
    elif session_plan_id:
        # Single-subject test: derive canonical subject from the plan's exam key
        tmpl_res = await db.execute(
            select(_SPT.exam).where(_SPT.id == session_plan_id)
        )
        exam_key = tmpl_res.scalar_one_or_none()
        if exam_key:
            canonical_subj = exam_key_to_canonical_subject(exam_key)

    await update_topic_performance(
        user_id=user.id,
        responses=responses,
        question_map=question_map,
        db=db,
        session_theta=state["theta"],
        plan_id=session_plan_id,
        subject_to_plan_id=subject_plan_map,
        canonical_subject=canonical_subj,
    )

    await db.commit()

    # Fire background summary generation — does NOT block this response
    import asyncio
    asyncio.create_task(
        run_and_store_summary(
            session_id=session_id,
            responses=details_responses,
            theta_final=state["theta"],
            mode=state.get("mode", "subject"),
        )
    )

    return QuizCompleteResponse(
        session_id=session_id,
        total_score=total_score,
        max_score=max_score,
        theta_final=state["theta"],
        ai_summary=None,  # Not ready yet — frontend polls /quiz/summary-status
        details=test_result.details,
    )


@router.get("/summary-status")
async def get_summary_status(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Poll endpoint: returns the ai_summary for a session once the background
    Ollama task has finished. Frontend polls this every few seconds until
    status == 'ready'.
    """
    from app.models.quiz import TestResult as _TR
    result_q = await db.execute(
        select(_TR).where(
            _TR.session_id == uuid.UUID(session_id),
            _TR.user_id == user.id,
        )
    )
    result_row = result_q.scalar_one_or_none()
    if not result_row:
        raise HTTPException(status_code=404, detail="Session result not found")

    if result_row.ai_summary:
        return {"status": "ready", "ai_summary": result_row.ai_summary}
    return {"status": "generating", "ai_summary": None}


def interleave_questions_by_subject(questions: list[dict]) -> list[dict]:
    """Group questions by subject/source_file, sort deterministically, and round-robin interleave across subjects."""
    if not questions:
        return []
    from collections import defaultdict
    import hashlib

    by_subject = defaultdict(list)
    for q in questions:
        key = (q.get("subject") or q.get("source_file") or "default").lower().strip()
        by_subject[key].append(q)

    sorted_groups = []
    for subj_key in sorted(by_subject.keys()):
        group = by_subject[subj_key]
        group.sort(key=lambda q: hashlib.md5((str(q.get("id", "")) + str(q.get("question", q.get("text", "")))).encode()).hexdigest())
        sorted_groups.append(group)

    interleaved = []
    max_len = max(len(g) for g in sorted_groups) if sorted_groups else 0
    for i in range(max_len):
        for group in sorted_groups:
            if i < len(group):
                interleaved.append(group[i])

    return interleaved


@router.get("/session-meta")
async def get_session_meta(
    plan_id: str,
    week_number: int,
    test_number: int = 1,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    """Return metadata about a planned weekly test (topics, question count) for instructions page."""
    # Load plan from DB
    from app.models.quiz import StudyPlanTemplate, UserStudyPlan
    usp_q = await db.execute(
        select(UserStudyPlan).where(
            UserStudyPlan.user_id == user.id,
            UserStudyPlan.template_id == uuid.UUID(plan_id),
        )
    )
    usp = usp_q.scalar_one_or_none()
    if not usp:
        raise HTTPException(status_code=404, detail="Study plan not found")

    tmpl_q = await db.execute(
        select(StudyPlanTemplate).where(StudyPlanTemplate.id == uuid.UUID(plan_id))
    )
    tmpl = tmpl_q.scalar_one_or_none()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Plan template not found")

    is_cuet = tmpl.exam.startswith("CUET_") or tmpl.exam == "CUET"
    topics: list[str] = []
    weightage = 0
    targets: list[dict] = []
    exam_keys: list[str] = [tmpl.exam]

    if is_cuet:
        from app.models.quiz import CuetEnrollment
        from sqlalchemy.orm import joinedload
        cuet_q = await db.execute(
            select(CuetEnrollment)
            .options(joinedload(CuetEnrollment.template))
            .where(
                CuetEnrollment.user_id == user.id,
                CuetEnrollment.duration_months == tmpl.duration_months,
            )
        )
        cuet_enrollments = cuet_q.scalars().all()
        if cuet_enrollments:
            exam_keys = [e.template.exam for e in cuet_enrollments]
            for e in cuet_enrollments:
                try:
                    raw = e.template.plan.strip()
                    if raw.startswith("```"):
                        raw = raw.split("```")[1].split("```")[0].strip()
                        if raw.startswith("json"):
                            raw = raw[4:].strip()
                    plan_obj = json_mod.loads(raw)
                    week_data = next((w for w in plan_obj.get("roadmap", []) if w.get("week") == week_number), None)
                    if week_data:
                        for sb in week_data.get("subjects", []):
                            t = sb.get("topic", "")
                            if t and t not in topics:
                                topics.append(t)
                            targets.append({
                                "subject": (sb.get("subject") or "").lower().strip(),
                                "topic": (sb.get("topic") or "").lower().strip(),
                                "subtopics": [s.lower().strip() for s in sb.get("subtopics", []) if s],
                            })
                except Exception:
                    pass
    else:
        try:
            raw = tmpl.plan.strip()
            if raw.startswith("```"):
                raw = raw.split("```")[1].split("```")[0].strip()
                if raw.startswith("json"):
                    raw = raw[4:].strip()
            plan_obj = json_mod.loads(raw)
            roadmap = plan_obj.get("roadmap", [])
            week_data = next((w for w in roadmap if w["week"] == week_number), None)
            if week_data:
                for sb in week_data.get("subjects", []):
                    t = sb.get("topic", "")
                    if t:
                        topics.append(t)
                    targets.append({
                        "subject": (sb.get("subject") or "").lower().strip(),
                        "topic": (sb.get("topic") or "").lower().strip(),
                        "subtopics": [s.lower().strip() for s in sb.get("subtopics", []) if s],
                    })
                weightage = week_data.get("weightage", 0)
        except Exception:
            pass

    # Count questions for this specific test's slice (mirrors start_weekly_test split logic)
    question_count = 0
    if targets:
        import hashlib
        from app.models.content_registry import SourceType

        duration_months = tmpl.duration_months
        tests_per_week = 2 if duration_months >= 12 else 3
        safe_test_number = max(1, min(test_number, tests_per_week))

        stmt = (
            select(ContentRegistry)
            .outerjoin(ContentAccess)
            .where(
                ContentRegistry.source_type == SourceType.pyq,
                or_(
                    ContentRegistry.subfolder.in_(exam_keys),
                    ContentRegistry.subfolder.ilike("CUET%") if is_cuet else False,
                ),
                or_(
                    ContentRegistry.visibility == Visibility.global_,
                    ContentAccess.org_id == user.org_id,
                ),
            )
            .distinct()
        )
        result = await db.execute(stmt)
        records = result.scalars().all()
        registries = [{"id": str(r.id), "file_path": r.file_path} for r in records]

        matched_questions = await match_questions_for_targets(targets, registries, redis)
        matched_questions = interleave_questions_by_subject(matched_questions)

        total_q = len(matched_questions)
        chunk_size = (total_q + tests_per_week - 1) // tests_per_week
        start_idx = (safe_test_number - 1) * chunk_size
        end_idx = min(start_idx + chunk_size, total_q)
        question_count = end_idx - start_idx


    return {
        "plan_id": plan_id,
        "week_number": week_number,
        "exam": "CUET" if is_cuet else tmpl.exam,
        "topics": topics,
        "weightage": weightage,
        "question_count": question_count or 0,
        "marks_per_question": 1,
        "negative_marking": False,
    }




@router.get("/session-result")
async def get_session_result(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the full result and per-question review for a completed session."""
    result_q = await db.execute(
        select(TestResult).where(TestResult.session_id == uuid.UUID(session_id))
    )
    result = result_q.scalar_one_or_none()
    if not result:
        raise HTTPException(status_code=404, detail="Test result not found")

    session_q = await db.execute(
        select(QuizSession).where(QuizSession.id == uuid.UUID(session_id))
    )
    session = session_q.scalar_one_or_none()

    details = result.details or {}
    responses = details.get("responses", [])
    answered = details.get("answered", len(responses))
    total_questions = len(responses)

    # Count questions where the student got any marks (score > 0)
    correct_count = sum(1 for r in responses if (r.get("score") or 0) > 0)
    accuracy = round(correct_count / total_questions, 3) if total_questions > 0 else 0.0

    # Time calculation
    started = session.started_at if session else None
    completed = session.completed_at if session else None
    time_seconds = int((completed - started).total_seconds()) if started and completed else 0

    return {
        "session_id": session_id,
        "plan_id": str(session.plan_id) if session and session.plan_id else None,
        "week_number": session.week_number if session else None,
        "test_number": session.test_number if session else None,
        "total_score": result.total_score,
        "max_score": result.max_score,
        "theta_final": result.theta_final,
        "ai_summary": result.ai_summary,
        "answered": answered,
        "total_questions": total_questions,
        "correct_count": correct_count,
        "time_seconds": time_seconds,
        "accuracy": accuracy,
        "responses": responses,
    }



@router.post("/generate-plan", response_model=StudyPlanResponse)
async def generate_plan_endpoint(
    request: StudyPlanRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    from app.models.content_registry import SourceType
    from app.models.quiz import StudyPlanTemplate, UserStudyPlan

    # Normalise friendly frontend exam keys → actual DB/subfolder names
    EXAM_ALIAS: dict[str, str] = {
        "GATE": "GATE_CSE_PYQ",
        "GATE CSE": "GATE_CSE_PYQ",
        "GATE_CSE": "GATE_CSE_PYQ",
    }
    exam_key = EXAM_ALIAS.get(request.exam, request.exam)

    # Enforce exam allocation: students may only generate plans for their allocated exams
    if user.role.value == "student":
        allocated = (user.metadata_ or {}).get("allocated_exams", [])
        if allocated and exam_key not in allocated:
            raise HTTPException(
                status_code=403,
                detail=f"You are not allocated to prepare for '{exam_key}'. Please contact your organization."
            )

    # 1. Check if a pre-made template already exists for this exam/duration
    template_q = await db.execute(
        select(StudyPlanTemplate).where(
            StudyPlanTemplate.exam == exam_key,
            StudyPlanTemplate.duration_months == request.duration_months
        )
    )
    template = template_q.scalar_one_or_none()
    
    if not template:
        # Template doesn't exist, generate it via AI
        # (Keep the existing registry/hierarchy logic to feed the AI)
        if user.role.value == "super_admin":
            stmt = select(ContentRegistry).where(
                ContentRegistry.source_type == SourceType.pyq,
                ContentRegistry.subfolder == exam_key
            )
        else:
            stmt = (
                select(ContentRegistry)
                .outerjoin(ContentAccess)
                .where(
                    ContentRegistry.source_type == SourceType.pyq,
                    ContentRegistry.subfolder == exam_key,
                    or_(
                        ContentRegistry.visibility == Visibility.global_,
                        ContentAccess.org_id == user.org_id
                    )
                )
                .distinct()
            )
        
        result = await db.execute(stmt)
        records = result.scalars().all()
        if not records:
            raise HTTPException(status_code=404, detail="No content found for this examination category")
        
        registries = [{"id": str(r.id), "file_path": r.file_path} for r in records]
        hierarchy = await get_pyq_subtopics(registries, redis)
        
        table_lines = []
        for subj in hierarchy:
            table_lines.append(f"{subj['subject']}")
            for topic in subj['topics']:
                table_lines.append(f"  • {topic['name']}")
                for sub in topic['subtopics']:
                    table_lines.append(f"    - {sub}")
        topic_table_str = "\n".join(table_lines)
        
        duration_weeks = request.duration_months * 4
        plan_text = await generate_study_plan(duration_weeks, topic_table_str, request.topic_proficiency)
        
        # Save as new template
        template = StudyPlanTemplate(
            exam=exam_key,
            duration_months=request.duration_months,
            plan=plan_text
        )
        db.add(template)
        await db.flush()
    else:
        plan_text = template.plan

    # 2. Link user to the template (Upsert UserStudyPlan for this specific template)
    user_plan_q = await db.execute(
        select(UserStudyPlan).where(
            UserStudyPlan.user_id == user.id,
            UserStudyPlan.template_id == template.id
        )
    )
    user_plan = user_plan_q.scalar_one_or_none()
    
    if not user_plan:
        user_plan = UserStudyPlan(
            user_id=user.id,
            template_id=template.id,
            completed_weeks=[],
            current_week=1,
            topic_proficiency=request.topic_proficiency,
        )
        db.add(user_plan)
    else:
        # Update proficiency if re-generating
        if request.topic_proficiency:
            user_plan.topic_proficiency = request.topic_proficiency

    # Track the set of exams this student is preparing for (append-only, no duplicates)
    from sqlalchemy.orm.attributes import flag_modified
    meta = dict(user.metadata_ or {})
    exams_list = meta.get("selected_exams", [])
    if exam_key not in exams_list:
        exams_list.append(exam_key)
    meta["selected_exams"] = exams_list
    user.metadata_ = meta
    flag_modified(user, "metadata_")

    await db.commit()
    
    # 3. For backward compatibility with Redis weekly tests
    # We store the plan in Redis using the template ID as the plan_id
    plan_data = {
        "plan": plan_text,
        "exam": exam_key,
        "user_id": str(user.id),
        "duration_months": request.duration_months,
    }
    await redis.setex(f"study_plan:{template.id}", 86400 * 30, json_mod.dumps(plan_data))
    
    return StudyPlanResponse(
        plan=plan_text, 
        plan_id=str(template.id),
        exam=template.exam,
        duration_months=template.duration_months,
        completed_weeks=user_plan.completed_weeks,
        current_week=user_plan.current_week
    )


@router.get("/my-plan", response_model=StudyPlanResponse)
async def get_my_plan(
    exam: Optional[str] = None,
    duration_months: Optional[int] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    """Retrieve a specific persisted study plan or the latest one."""
    from app.models.quiz import UserStudyPlan, StudyPlanTemplate
    
    from sqlalchemy.orm import joinedload
    stmt = select(UserStudyPlan).options(joinedload(UserStudyPlan.template)).join(StudyPlanTemplate).where(UserStudyPlan.user_id == user.id)
    if exam:
        stmt = stmt.where(StudyPlanTemplate.exam == exam)
    if duration_months:
        stmt = stmt.where(StudyPlanTemplate.duration_months == duration_months)
    
    # Order by most recent link
    stmt = stmt.order_by(UserStudyPlan.created_at.desc())
    
    result = await db.execute(stmt)
    user_plan = result.scalars().first()
    
    if not user_plan:
        raise HTTPException(status_code=404, detail="No matching study plan found")
    
    template = user_plan.template

    # Refresh Redis for weekly tests
    plan_data = {
        "plan": template.plan,
        "exam": template.exam,
        "user_id": str(user.id),
        "duration_months": template.duration_months,
    }
    await redis.setex(f"study_plan:{template.id}", 86400 * 30, json_mod.dumps(plan_data))
    
    return StudyPlanResponse(
        plan=template.plan, 
        plan_id=str(template.id),
        exam=template.exam,
        duration_months=template.duration_months,
        completed_weeks=user_plan.completed_weeks,
        current_week=user_plan.current_week
    )


@router.get("/plan-status")
async def get_plan_status(
    plan_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    """Return week-by-week plan status with session/result IDs for lock/unlock UI."""
    from app.models.quiz import UserStudyPlan, StudyPlanTemplate, TestResult

    try:
        plan_uuid = uuid.UUID(plan_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid plan_id")

    # Load user study plan
    plan_q = await db.execute(
        select(UserStudyPlan)
        .options(__import__('sqlalchemy.orm', fromlist=['joinedload']).joinedload(UserStudyPlan.template))
        .where(UserStudyPlan.user_id == user.id, UserStudyPlan.template_id == plan_uuid)
    )
    user_plan = plan_q.scalar_one_or_none()
    if not user_plan:
        raise HTTPException(status_code=404, detail="Study plan not found")

    template = user_plan.template
    total_weeks = template.duration_months * 4
    completed = set(user_plan.completed_weeks or [])
    current = user_plan.current_week

    # Parse plan JSON to extract week topics, subjects, priority, and subtopics
    week_topics: dict[int, list[str]] = {}
    week_subtopics: dict[int, list[str]] = {}
    week_weightage: dict[int, int] = {}
    week_subject: dict[int, str] = {}
    week_priority: dict[int, str] = {}

    PRIORITY_ORDER = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}

    try:
        clean = template.plan.strip()
        if clean.startswith('```'):
            clean = clean.split('\n', 1)[1].rsplit('```', 1)[0].strip()
        full_plan = json_mod.loads(clean)
        for wk in full_plan.get("roadmap", []):
            wn = wk.get("week")
            if wn:
                subjects = wk.get("subjects", [])
                topics = [s.get("topic", "") for s in subjects if s.get("topic")]
                subtopics = []
                for s in subjects:
                    subtopics.extend(s.get("subtopics", []))
                # Collect unique subject names for this week
                unique_subjects = list(dict.fromkeys(
                    s.get("subject", "") for s in subjects if s.get("subject")
                ))
                # Find the average priority level across all subjects this week
                priority_scores = [PRIORITY_ORDER[s.get("priority", "").upper()]
                                   for s in subjects
                                   if s.get("priority", "").upper() in PRIORITY_ORDER]
                if priority_scores:
                    avg = sum(priority_scores) / len(priority_scores)
                    if avg <= 0.5:
                        top_priority = "CRITICAL"
                    elif avg <= 1.5:
                        top_priority = "HIGH"
                    elif avg <= 2.5:
                        top_priority = "MEDIUM"
                    else:
                        top_priority = "LOW"
                else:
                    top_priority = ""
                # weightage may not exist in JSON; fall back to equal split
                weight = wk.get("weightage", 100 // total_weeks)
                week_topics[wn] = topics
                week_subtopics[wn] = subtopics
                week_weightage[wn] = weight
                week_subject[wn] = ", ".join(unique_subjects)
                week_priority[wn] = top_priority
    except Exception:
        pass

    is_cuet = template.exam.startswith("CUET_") or template.exam == "CUET"
    cuet_tmpl_ids = [plan_uuid]
    if is_cuet:
        from app.models.quiz import CuetEnrollment
        cuet_q = await db.execute(
            select(CuetEnrollment).where(
                CuetEnrollment.user_id == user.id,
                CuetEnrollment.duration_months == template.duration_months,
            )
        )
        enrollments = cuet_q.scalars().all()
        if enrollments:
            cuet_tmpl_ids = [e.template_id for e in enrollments]

    # Load existing sessions for this plan (or all enrolled CUET subject plans), keyed by (week_number, test_number)
    sessions_q = await db.execute(
        select(QuizSession).where(
            QuizSession.user_id == user.id,
            QuizSession.plan_id.in_(cuet_tmpl_ids),
            QuizSession.completed_at.isnot(None),  # only completed sessions
        )
    )
    all_sessions = sessions_q.scalars().all()


    # Build map: week_number -> {test_number -> (session, result_id)}
    week_session_map: dict[int, dict[int, tuple]] = {}
    for s in all_sessions:
        wn = s.week_number or 0
        tn = s.test_number or 1
        if wn not in week_session_map:
            week_session_map[wn] = {}
        tr_q = await db.execute(
            select(TestResult).where(TestResult.session_id == s.id)
        )
        tr = tr_q.scalar_one_or_none()
        # Keep the latest session per (week, test_number)
        week_session_map[wn][tn] = (s, str(tr.id) if tr else None)

    # Determine tests_per_week from duration
    duration_months = template.duration_months
    tests_per_week = 2 if duration_months >= 12 else 3

    weeks = []
    for wn in range(1, total_weeks + 1):
        if wn in completed:
            week_status = "completed"
        elif wn == current:
            week_status = "current"
        else:
            week_status = "locked"

        # Build per-test status list
        test_map = week_session_map.get(wn, {})
        completed_test_numbers = set(test_map.keys())
        tests = []
        for tn in range(1, tests_per_week + 1):
            if tn in completed_test_numbers:
                sess, result_id = test_map[tn]
                test_status = "completed"
                test_session_id = str(sess.id)
            elif week_status == "locked":
                test_status = "locked"
                test_session_id = None
                result_id = None
            elif (tn - 1) in completed_test_numbers or tn == 1:
                # Test is available: it's either test 1, or previous test is done
                test_status = "current"
                test_session_id = None
                result_id = None
            else:
                test_status = "locked"
                test_session_id = None
                result_id = None
            tests.append({
                "test_number": tn,
                "status": test_status,
                "session_id": test_session_id,
                "result_id": result_id,
            })

        weeks.append({
            "week": wn,
            "subject": week_subject.get(wn, ""),
            "priority": week_priority.get(wn, ""),
            "topics": week_topics.get(wn, []),
            "subtopics": week_subtopics.get(wn, []),
            "weightage": week_weightage.get(wn, max(1, 100 // total_weeks)),
            "status": week_status,
            "tests_per_week": tests_per_week,
            "tests": tests,
            # Legacy single-session fields (for backwards compat)
            "session_id": tests[0]["session_id"] if tests else None,
            "result_id": tests[0]["result_id"] if tests else None,
        })

    is_cuet = template.exam.startswith("CUET_") or template.exam == "CUET"
    cuet_subjects = []
    if is_cuet:
        from app.models.quiz import CuetEnrollment
        from sqlalchemy.orm import joinedload
        cuet_q = await db.execute(
            select(CuetEnrollment)
            .options(joinedload(CuetEnrollment.template))
            .where(
                CuetEnrollment.user_id == user.id,
                CuetEnrollment.duration_months == template.duration_months,
            )
        )
        cuet_enrollments = cuet_q.scalars().all()
        cuet_subjects = [
            {
                "plan_id": str(e.template_id),
                "exam": e.template.exam,
                "label": e.template.exam.replace("CUET_", "").replace("_", " ").title(),
            }
            for e in cuet_enrollments
        ]

    return {
        "plan_id": plan_id,
        "exam": template.exam,
        "is_cuet": is_cuet,
        "cuet_subjects": cuet_subjects,
        "current_week": current,
        "total_weeks": total_weeks,
        "weeks": weeks,
    }



@router.get("/my-plans")
async def get_my_plans(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all exam journeys (UserStudyPlan + template info) for the current user."""
    from app.models.quiz import UserStudyPlan, StudyPlanTemplate
    from sqlalchemy.orm import joinedload

    result = await db.execute(
        select(UserStudyPlan)
        .options(joinedload(UserStudyPlan.template))
        .where(UserStudyPlan.user_id == user.id)
        .order_by(UserStudyPlan.created_at.desc())
    )
    plans = result.scalars().all()

    return [
        {
            "plan_id": str(p.template_id),
            "exam": p.template.exam,
            "duration_months": p.template.duration_months,
            "current_week": p.current_week,
            "total_weeks": p.template.duration_months * 4,
            "completed_weeks": p.completed_weeks or [],
            "topic_proficiency": p.topic_proficiency,
            "created_at": p.created_at.isoformat(),
        }
        for p in plans
    ]


@router.post("/complete-week")
async def complete_week(
    week_number: int,
    plan_id: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark a specific week as completed in the user's study plan."""
    from app.models.quiz import UserStudyPlan
    from sqlalchemy.orm import joinedload

    stmt = select(UserStudyPlan).options(joinedload(UserStudyPlan.template)).where(UserStudyPlan.user_id == user.id)
    if plan_id:
        try:
            stmt = stmt.where(UserStudyPlan.template_id == uuid.UUID(plan_id))
        except ValueError:
            pass

    result = await db.execute(stmt.order_by(UserStudyPlan.created_at.desc()))
    user_plan = result.scalars().first()

    if not user_plan:
        raise HTTPException(status_code=404, detail="No matching study plan found")

    is_cuet = user_plan.template.exam.startswith("CUET_") or user_plan.template.exam == "CUET"

    if is_cuet:
        all_cuet_q = await db.execute(
            select(UserStudyPlan)
            .options(joinedload(UserStudyPlan.template))
            .where(UserStudyPlan.user_id == user.id)
        )
        all_user_plans = all_cuet_q.scalars().all()
        target_plans = [
            p for p in all_user_plans
            if p.template.duration_months == user_plan.template.duration_months
            and (p.template.exam.startswith("CUET_") or p.template.exam == "CUET")
        ]
        for p in target_plans:
            cw = set(p.completed_weeks or [])
            cw.add(week_number)
            p.completed_weeks = sorted(list(cw))
            if week_number >= p.current_week:
                p.current_week = week_number + 1
    else:
        completed = set(user_plan.completed_weeks or [])
        completed.add(week_number)
        user_plan.completed_weeks = sorted(list(completed))
        if week_number >= user_plan.current_week:
            user_plan.current_week = week_number + 1

    await db.commit()
    return {"status": "success", "completed_weeks": user_plan.completed_weeks, "current_week": user_plan.current_week}



@router.post("/start-weekly-test", response_model=QuizStartResponse)
async def start_weekly_test(
    request: WeeklyTestRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    from app.models.content_registry import SourceType
    from app.models.quiz import StudyPlanTemplate, CuetEnrollment
    from sqlalchemy.orm import joinedload

    tmpl_q = await db.execute(
        select(StudyPlanTemplate).where(StudyPlanTemplate.id == uuid.UUID(request.plan_id))
    )
    tmpl = tmpl_q.scalar_one_or_none()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Study plan not found")

    is_cuet = tmpl.exam.startswith("CUET_") or tmpl.exam == "CUET"
    targets: list[dict] = []
    exam_keys: list[str] = [tmpl.exam]

    if is_cuet:
        cuet_q = await db.execute(
            select(CuetEnrollment)
            .options(joinedload(CuetEnrollment.template))
            .where(
                CuetEnrollment.user_id == user.id,
                CuetEnrollment.duration_months == tmpl.duration_months,
            )
        )
        cuet_enrollments = cuet_q.scalars().all()
        if cuet_enrollments:
            exam_keys = [e.template.exam for e in cuet_enrollments]
            for e in cuet_enrollments:
                try:
                    raw = e.template.plan.strip()
                    if raw.startswith("```"):
                        raw = raw.split("```")[1].split("```")[0].strip()
                        if raw.startswith("json"):
                            raw = raw[4:].strip()
                    plan_obj = json_mod.loads(raw)
                    week_data = next((w for w in plan_obj.get("roadmap", []) if w.get("week") == request.week_number), None)
                    if week_data:
                        for sb in week_data.get("subjects", []):
                            targets.append({
                                "subject": (sb.get("subject") or "").lower().strip(),
                                "topic": (sb.get("topic") or "").lower().strip(),
                                "subtopics": [s.lower().strip() for s in sb.get("subtopics", []) if s],
                            })
                except Exception:
                    pass
    else:
        try:
            raw = tmpl.plan.strip()
            if raw.startswith("```"):
                raw = raw.split("```")[1].split("```")[0].strip()
                if raw.startswith("json"):
                    raw = raw[4:].strip()
            plan_obj = json_mod.loads(raw)
            roadmap = plan_obj.get("roadmap", [])
            week_data = next((w for w in roadmap if w["week"] == request.week_number), None)
            if week_data:
                for sb in week_data.get("subjects", []):
                    targets.append({
                        "subject": (sb.get("subject") or "").lower().strip(),
                        "topic": (sb.get("topic") or "").lower().strip(),
                        "subtopics": [s.lower().strip() for s in sb.get("subtopics", []) if s],
                    })
        except Exception:
            pass

    if not targets:
        raise HTTPException(status_code=400, detail="Could not extract topics from this week's plan")
    
    # Get registries for the exam(s)
    stmt = (
        select(ContentRegistry)
        .outerjoin(ContentAccess)
        .where(
            ContentRegistry.source_type == SourceType.pyq,
            or_(
                ContentRegistry.subfolder.in_(exam_keys),
                ContentRegistry.subfolder.ilike("CUET%") if is_cuet else False,
            ),
            or_(
                ContentRegistry.visibility == Visibility.global_,
                ContentAccess.org_id == user.org_id
            )
        )
        .distinct()
    )


    result = await db.execute(stmt)
    records = result.scalars().all()
    registries = [{"id": str(r.id), "file_path": r.file_path} for r in records]
    
    # 5. Load ALL questions and filter by plan targets using shared helper
    matched_questions = await match_questions_for_targets(targets, registries, redis)

    if not matched_questions:
        raise HTTPException(status_code=404, detail=f"No questions found for Week {request.week_number} topics")
    
    # 6. Round-robin interleave questions across subjects and slice by test_number
    duration_months = tmpl.duration_months
    tests_per_week = 2 if duration_months >= 12 else 3
    test_number = max(1, min(request.test_number, tests_per_week))

    matched_questions = interleave_questions_by_subject(matched_questions)

    # Split into equal buckets

    total_q = len(matched_questions)
    chunk_size = (total_q + tests_per_week - 1) // tests_per_week  # ceiling division
    start_idx = (test_number - 1) * chunk_size
    end_idx = min(start_idx + chunk_size, total_q)
    test_questions = matched_questions[start_idx:end_idx]

    if not test_questions:
        raise HTTPException(status_code=404, detail=f"No questions for Test {test_number} of Week {request.week_number}")

    # 7. Start session with this test's question slice
    # For CUET combined tests, include plan_ids + exam_keys so complete_quiz
    # can route each question's subject to the correct plan for PerformanceSummary.
    if is_cuet and cuet_enrollments:
        plan_ids_list = [str(e.template_id) for e in cuet_enrollments]
        session_metadata = {
            "plan_id": request.plan_id,
            "plan_ids": plan_ids_list,
            "exam_keys": exam_keys,
            "week_number": request.week_number,
            "test_number": test_number,
            "cuet_combined": True,
        }
    else:
        session_metadata = {
            "plan_id": request.plan_id,
            "week_number": request.week_number,
            "test_number": test_number,
        }

    session_data = await start_session(
        user_id=str(user.id),
        content_registry_id=None,
        mode="pyq",
        questions=test_questions,
        redis=redis,
        db=db,
        metadata=session_metadata,
        max_questions=None,
    )

    # Persist plan_id + week_number + test_number to the QuizSession row
    try:
        session_q = await db.execute(
            select(QuizSession).where(QuizSession.id == uuid.UUID(session_data["session_id"]))
        )
        session_row = session_q.scalar_one_or_none()
        if session_row:
            session_row.plan_id = uuid.UUID(request.plan_id)
            session_row.week_number = request.week_number
            session_row.test_number = test_number
            await db.commit()
    except Exception:
        pass  # Non-critical — Redis metadata is the primary source

    question = session_data.get("question")
    return QuizStartResponse(
        session_id=session_data["session_id"],
        question=QuestionOut(**question).model_dump(),
        total_questions=session_data["total_questions"],
    )


# ─────────────────────────────────────────────────────────────────────────────
# CUET Multi-Subject Enrollment & Quiz
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/available-cuet-subjects")
async def get_available_cuet_subjects(
    duration_months: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return CUET subject keys that have a plan template for the given duration."""
    from app.models.quiz import StudyPlanTemplate

    result = await db.execute(
        select(StudyPlanTemplate.exam, StudyPlanTemplate.id)
        .where(
            StudyPlanTemplate.exam.like("CUET_%"),
            StudyPlanTemplate.duration_months == duration_months,
        )
        .order_by(StudyPlanTemplate.exam)
    )
    rows = result.all()

    # Friendly display label: "CUET_CHEMISTRY" → "Chemistry"
    def _label(key: str) -> str:
        return key.replace("CUET_", "").replace("_", " ").title()

    return [
        {"key": row.exam, "label": _label(row.exam), "plan_id": str(row.id)}
        for row in rows
    ]


from pydantic import BaseModel as _BM


class CuetEnrollRequest(_BM):
    duration_months: int
    subjects: List[str]  # List of CUET_* exam keys


@router.post("/enroll-cuet")
async def enroll_cuet(
    request: CuetEnrollRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    """Enroll a student in multiple CUET subjects. Subjects are locked after enrollment."""
    from app.models.quiz import StudyPlanTemplate, UserStudyPlan, CuetEnrollment
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    if not request.subjects:
        raise HTTPException(status_code=400, detail="Select at least one subject.")

    # Prevent re-enrollment: check if user already has any CUET enrollment for this duration
    existing_q = await db.execute(
        select(CuetEnrollment).where(
            CuetEnrollment.user_id == user.id,
            CuetEnrollment.duration_months == request.duration_months,
        ).limit(1)
    )
    if existing_q.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail=f"You are already enrolled in a {request.duration_months}-month CUET plan. "
                   "Subjects cannot be added after enrollment."
        )

    enrolled = []
    for subject_key in request.subjects:
        if not subject_key.startswith("CUET_"):
            continue

        # Look up the template
        tmpl_q = await db.execute(
            select(StudyPlanTemplate).where(
                StudyPlanTemplate.exam == subject_key,
                StudyPlanTemplate.duration_months == request.duration_months,
            )
        )
        template = tmpl_q.scalar_one_or_none()
        if not template:
            raise HTTPException(
                status_code=404,
                detail=f"No study plan template found for {subject_key} ({request.duration_months} months). "
                       "Please ask your administrator to generate the plan first."
            )

        # Upsert UserStudyPlan (week-level progress tracker)
        usp_q = await db.execute(
            select(UserStudyPlan).where(
                UserStudyPlan.user_id == user.id,
                UserStudyPlan.template_id == template.id,
            )
        )
        user_plan = usp_q.scalar_one_or_none()
        if not user_plan:
            user_plan = UserStudyPlan(
                user_id=user.id,
                template_id=template.id,
                completed_weeks=[],
                current_week=1,
            )
            db.add(user_plan)

        # Create CuetEnrollment row
        enrollment = CuetEnrollment(
            user_id=user.id,
            template_id=template.id,
            duration_months=request.duration_months,
        )
        db.add(enrollment)

        # Cache plan in Redis
        await redis.setex(
            f"study_plan:{template.id}",
            86400 * 30,
            json_mod.dumps({"plan": template.plan, "exam": template.exam, "duration_months": template.duration_months}),
        )

        enrolled.append({
            "plan_id": str(template.id),
            "exam": template.exam,
            "duration_months": template.duration_months,
        })

    # Track selected_exams in user metadata (for future reference)
    from sqlalchemy.orm.attributes import flag_modified
    meta = dict(user.metadata_ or {})
    exams_list = meta.get("selected_exams", [])
    for e in enrolled:
        if e["exam"] not in exams_list:
            exams_list.append(e["exam"])
    meta["selected_exams"] = exams_list
    user.metadata_ = meta
    flag_modified(user, "metadata_")

    await db.commit()

    return {
        "status": "enrolled",
        "duration_months": request.duration_months,
        "subjects": enrolled,
    }


@router.get("/my-cuet-plans")
async def get_my_cuet_plans(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all CUET enrollments for the current user, grouped by duration."""
    from app.models.quiz import CuetEnrollment, StudyPlanTemplate, UserStudyPlan
    from sqlalchemy.orm import joinedload

    result = await db.execute(
        select(CuetEnrollment)
        .options(joinedload(CuetEnrollment.template))
        .where(CuetEnrollment.user_id == user.id)
        .order_by(CuetEnrollment.duration_months, CuetEnrollment.created_at)
    )
    enrollments = result.scalars().all()

    if not enrollments:
        return []

    # Load UserStudyPlan progress for each enrolled template
    template_ids = [e.template_id for e in enrollments]
    usp_result = await db.execute(
        select(UserStudyPlan).where(
            UserStudyPlan.user_id == user.id,
            UserStudyPlan.template_id.in_(template_ids),
        )
    )
    usp_map = {usp.template_id: usp for usp in usp_result.scalars().all()}

    # Group by duration_months
    groups: dict[int, list] = {}
    for e in enrollments:
        usp = usp_map.get(e.template_id)
        subject_info = {
            "plan_id": str(e.template_id),
            "exam": e.template.exam,
            "label": e.template.exam.replace("CUET_", "").replace("_", " ").title(),
            "current_week": usp.current_week if usp else 1,
            "total_weeks": e.duration_months * 4,
            "completed_weeks": usp.completed_weeks or [] if usp else [],
        }
        groups.setdefault(e.duration_months, []).append(subject_info)

    return [
        {"duration_months": dur, "subjects": subjects}
        for dur, subjects in sorted(groups.items())
    ]


class CuetWeeklyTestRequest(_BM):
    """Request body for starting a combined CUET weekly test across all enrolled subjects."""
    duration_months: int       # Used to look up the enrollment group
    week_number: int
    test_number: int = 1       # 1, 2, or 3


@router.post("/start-cuet-weekly-test", response_model=QuizStartResponse)
async def start_cuet_weekly_test(
    request: CuetWeeklyTestRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    """Start a combined weekly test that merges topics from ALL enrolled CUET subjects for the given week.

    Questions from all subjects are pooled and split into 3 sub-tests per week.
    """
    import hashlib
    from app.models.quiz import CuetEnrollment, StudyPlanTemplate
    from app.models.content_registry import SourceType

    TESTS_PER_WEEK = 3  # Fixed for CUET

    # 1. Load all enrolled subjects for this user/duration
    enroll_result = await db.execute(
        select(CuetEnrollment)
        .options(__import__('sqlalchemy.orm', fromlist=['joinedload']).joinedload(CuetEnrollment.template))
        .where(
            CuetEnrollment.user_id == user.id,
            CuetEnrollment.duration_months == request.duration_months,
        )
    )
    enrollments = enroll_result.scalars().all()
    if not enrollments:
        raise HTTPException(status_code=404, detail="No CUET enrollment found for this duration.")

    # 2. For each subject, extract week targets from its plan
    all_targets: list[dict] = []
    exam_keys: list[str] = []

    for enrollment in enrollments:
        template = enrollment.template
        exam_keys.append(template.exam)

        try:
            clean = template.plan.strip()
            if clean.startswith("```"):
                clean = clean.split("\n", 1)[1].rsplit("```", 1)[0].strip()
            plan_obj = json_mod.loads(clean)
            week_data = next(
                (w for w in plan_obj.get("roadmap", []) if w["week"] == request.week_number),
                None,
            )
        except Exception:
            week_data = None

        if week_data:
            for subj_block in week_data.get("subjects", []):
                all_targets.append({
                    "subject": (subj_block.get("subject") or "").lower().strip(),
                    "topic": (subj_block.get("topic") or "").lower().strip(),
                    "subtopics": [s.lower().strip() for s in subj_block.get("subtopics", []) if s],
                })

    if not all_targets:
        raise HTTPException(
            status_code=400,
            detail=f"Week {request.week_number} not found in any enrolled subject plan."
        )

    # 3. Load question registries for all enrolled exam keys
    stmt = (
        select(ContentRegistry)
        .outerjoin(ContentAccess)
        .where(
            ContentRegistry.source_type == SourceType.pyq,
            ContentRegistry.subfolder.in_(exam_keys),
            or_(
                ContentRegistry.visibility == Visibility.global_,
                ContentAccess.org_id == user.org_id,
            ),
        )
        .distinct()
    )
    reg_result = await db.execute(stmt)
    records = reg_result.scalars().all()
    registries = [{"id": str(r.id), "file_path": r.file_path} for r in records]

    if not registries:
        raise HTTPException(status_code=404, detail="No question banks found for enrolled CUET subjects.")

    # 4. Match questions across all subjects' targets
    matched_questions = await match_questions_for_targets(all_targets, registries, redis)
    if not matched_questions:
        raise HTTPException(
            status_code=404,
            detail=f"No questions found for Week {request.week_number} across enrolled subjects."
        )

    # 5. Deterministic 3-way split by MD5 hash
    test_number = max(1, min(request.test_number, TESTS_PER_WEEK))
    matched_questions.sort(key=lambda q: hashlib.md5(
        q.get("question", q.get("text", "")).encode()
    ).hexdigest())

    total_q = len(matched_questions)
    chunk_size = (total_q + TESTS_PER_WEEK - 1) // TESTS_PER_WEEK
    start_idx = (test_number - 1) * chunk_size
    end_idx = min(start_idx + chunk_size, total_q)
    test_questions = matched_questions[start_idx:end_idx]

    if not test_questions:
        raise HTTPException(
            status_code=404,
            detail=f"No questions for Test {test_number} of Week {request.week_number}"
        )

    # Use the first enrolled subject's plan_id as the session anchor
    primary_plan_id = str(enrollments[0].template_id)

    # 6. Start session
    session_data = await start_session(
        user_id=str(user.id),
        content_registry_id=None,
        mode="pyq",
        questions=test_questions,
        redis=redis,
        db=db,
        metadata={
            "plan_id": primary_plan_id,
            "plan_ids": [str(e.template_id) for e in enrollments],
            "exam_keys": exam_keys,
            "week_number": request.week_number,
            "test_number": test_number,
            "cuet_combined": True,
            "duration_months": request.duration_months,
        },
        max_questions=None,
    )

    # Persist session metadata to QuizSession row
    try:
        session_q = await db.execute(
            select(QuizSession).where(QuizSession.id == uuid.UUID(session_data["session_id"]))
        )
        session_row = session_q.scalar_one_or_none()
        if session_row:
            session_row.plan_id = uuid.UUID(primary_plan_id)
            session_row.week_number = request.week_number
            session_row.test_number = test_number
            await db.commit()
    except Exception:
        pass

    question = session_data.get("question")
    return QuizStartResponse(
        session_id=session_data["session_id"],
        question=QuestionOut(**question).model_dump(),
        total_questions=session_data["total_questions"],
    )

