"""IRT-based adaptive quiz engine with Redis session state."""
import json
import uuid
from typing import Optional, List
from datetime import datetime

import redis.asyncio as aioredis
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.quiz import QuizSession, QuizMode
from app.services.question_service import filter_by_difficulty, sort_by_difficulty_proximity, get_difficulty_value
from app.utils.logging import logger

SESSION_TTL = 7200  # 2 hours

THETA_CORRECT = 0.3
THETA_PARTIAL = 0.1
THETA_INCORRECT = -0.3


async def start_session(
    user_id: str,
    content_registry_id: Optional[str],
    mode: str,
    questions: List[dict],
    redis: aioredis.Redis,
    db: AsyncSession,
    metadata: Optional[dict] = None,
    max_questions: Optional[int] = None,
) -> dict:
    session_id = str(uuid.uuid4())

    session = QuizSession(
        id=uuid.UUID(session_id),
        user_id=uuid.UUID(user_id),
        content_registry_id=uuid.UUID(content_registry_id) if content_registry_id else None,
        mode=QuizMode(mode),
        theta=0.0,
    )
    db.add(session)
    await db.flush()

    state = {
        "session_id": session_id,
        "user_id": user_id,
        "content_registry_id": content_registry_id,
        "mode": mode,
        "theta": 0.0,
        "answered_ids": [],
        "question_index": 0,
        "total_questions": len(questions) if max_questions is None else min(max_questions, len(questions)),
        "questions": questions,
        "metadata": metadata,
    }
    await redis.setex(f"quiz_session:{session_id}", SESSION_TTL, json.dumps(state))

    first_question = select_next_question(questions, 0.0, [])
    logger.info("quiz_session_started", session_id=session_id, total_q=len(questions))

    return {
        "session_id": session_id,
        "question": _sanitize_question(first_question) if first_question else None,
        "total_questions": state["total_questions"],
    }


async def process_answer(
    session_id: str,
    question_id: str,
    score: float,
    redis: aioredis.Redis,
) -> dict:
    """Update theta and return next question after an answer is evaluated."""
    state = await _get_session_state(session_id, redis)
    if state is None:
        return {"error": "Session not found or expired"}

    theta = state["theta"]
    if score >= 8:
        theta += THETA_CORRECT
    elif score >= 4:
        theta += THETA_PARTIAL
    else:
        theta += THETA_INCORRECT

    state["theta"] = round(theta, 4)
    state["answered_ids"].append(question_id)
    state["question_index"] += 1

    is_complete = state["question_index"] >= state["total_questions"]
    next_question = None

    if not is_complete:
        next_question = select_next_question(
            state["questions"], theta, state["answered_ids"]
        )

    await redis.setex(f"quiz_session:{session_id}", SESSION_TTL, json.dumps(state))

    return {
        "theta": theta,
        "next_question": _sanitize_question(next_question) if next_question else None,
        "is_complete": is_complete,
        "question_index": state["question_index"],
    }


def _get_question_id(q: dict) -> str:
    """Return a globally unique question ID: '<source_file>::<question_number>'.
    Falls back to bare question_number/id when source_file is absent (single-file sessions).
    """
    num = str(q.get("question_number", q.get("id", "")))
    src = q.get("source_file", "")
    if src:
        return f"{src}::{num}"
    return num


def select_next_question(
    questions: List[dict],
    theta: float,
    answered_ids: List[str],
) -> Optional[dict]:
    """IRT selection: pick the unanswered question closest to current theta."""
    available = [q for q in questions if _get_question_id(q) not in answered_ids]
    if not available:
        return None

    close_match = filter_by_difficulty(available, theta, tolerance=0.2)
    candidates = close_match if close_match else sort_by_difficulty_proximity(available, theta)

    # For CUET multi-subject sessions, balance subjects among candidates
    is_cuet_session = any(
        (q.get("source_file") or "").startswith("CUET") or (q.get("subject") or "").lower() in ("chemistry", "biology", "english", "physics", "accountancy", "economics", "history", "gat")
        for q in candidates
    )
    if is_cuet_session:
        distinct_subjects = { (q.get("subject") or "").lower().strip() for q in candidates if (q.get("subject") or "").strip() }
        if len(distinct_subjects) > 1:
            answered_questions = [q for q in questions if _get_question_id(q) in answered_ids]
            subject_counts = {}
            for q in answered_questions:
                s = (q.get("subject") or "").lower().strip()
                if s:
                    subject_counts[s] = subject_counts.get(s, 0) + 1

            def get_subj_count(q: dict) -> int:
                s = (q.get("subject") or "").lower().strip()
                return subject_counts.get(s, 0) if s else 0

            candidates.sort(key=lambda q: (get_subj_count(q), abs(get_difficulty_value(q) - theta)))
            return candidates[0]

    # Standard single-subject IRT selection (GATE)
    if close_match:
        return close_match[0]
    sorted_q = sort_by_difficulty_proximity(available, theta)
    return sorted_q[0] if sorted_q else None




async def get_session_state(session_id: str, redis: aioredis.Redis) -> Optional[dict]:
    return await _get_session_state(session_id, redis)


async def complete_session(session_id: str, redis: aioredis.Redis) -> Optional[dict]:
    state = await _get_session_state(session_id, redis)
    if state:
        await redis.delete(f"quiz_session:{session_id}")
    return state


async def _get_session_state(session_id: str, redis: aioredis.Redis) -> Optional[dict]:
    data = await redis.get(f"quiz_session:{session_id}")
    if data is None:
        return None
    return json.loads(data)


def _sanitize_question(question: dict) -> dict:
    """Strip answer fields before sending to student. Supports new flat format."""
    q_id = _get_question_id(question)
    q_text = question.get("question", question.get("text", ""))

    options = question.get("options")
    if options is None:
        opts = []
        # If 'a' and 'b' are numeric, they are IRT parameters, not options.
        # Options in this format are already in the 'question' text.
        is_irt = isinstance(question.get("a"), (int, float)) and isinstance(question.get("b"), (int, float))
        
        if not is_irt:
            for key in ("a", "b", "c", "d"):
                val = question.get(key)
                if val is not None:
                    opts.append(str(val))
            options = opts if opts else None

    raw_type = question.get("type")
    if not raw_type:
        q_type = "MCQ"
    else:
        q_type_str = str(raw_type).strip()
        if q_type_str.lower() in ("mcq", "single", "single_choice"):
            q_type = "MCQ"
        elif q_type_str.lower() in ("msq", "multiple", "multiple_choice"):
            q_type = "MSQ"
        elif q_type_str.lower() in ("nat", "numerical"):
            q_type = "NAT"
        elif q_type_str.lower() == "subjective":
            q_type = "subjective"
        else:
            q_type = q_type_str.upper()

    return {
        "id": q_id,
        "text": q_text,
        "type": q_type,
        "options": options,
        "difficulty": get_difficulty_value(question),
        "topic": question.get("topic"),
        "subject": question.get("subject"),
        "subtopic": question.get("subtopic"),
        "source_file": question.get("source_file"),
    }

