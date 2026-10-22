"""Answer evaluation service -- uses Gemma (Ollama) exclusively for grading."""
import re
from typing import Optional

from app.services.ai.gemma_client import generate_grading, generate_summary
from app.services.question_service import get_difficulty_value
from app.utils.logging import logger


def _get_correct_answer(question: dict) -> str | None:
    ans = question.get("answer", question.get("correct_answer"))
    if isinstance(ans, list):
        return ",".join(str(x) for x in ans)
    if ans is not None:
        return str(ans)
    return None


def _get_question_text(question: dict) -> str:
    return question.get("question", question.get("text", ""))


def _get_option_label(option_str: str) -> str:
    option_str = option_str.strip()
    match = re.match(r'^\(?([A-H])(?:\)|\]|\.|\s|$)', option_str, re.IGNORECASE)
    if match:
        return match.group(1).upper()
    return option_str.upper()


def _get_selected_labels(answer_str: str, options: list) -> set:
    selected = set()
    if not answer_str:
        return selected

    # 1. Check if any option string is in the answer
    if options:
        for opt in options:
            if opt in answer_str:
                selected.add(_get_option_label(opt))

    # 2. Fallback: split by comma and extract labels
    if not selected:
        parts = [p.strip() for p in answer_str.split(',')]
        for part in parts:
            label = _get_option_label(part)
            if len(label) == 1 and label.isalpha():
                selected.add(label)

    return selected


async def evaluate_answer(
    question: dict,
    answer: str,
    mode: str = "subject",
) -> dict:
    """
    Evaluate a student answer.
    - MCQ, MSQ, NAT: Deterministic grading.
    - Subjective/other: Gemma AI grading.
    """
    correct_answer = _get_correct_answer(question)
    raw_type = str(question.get("type", "")).strip().upper()
    options = question.get("options") or []

    if not raw_type:
        if options and len(options) > 0:
            q_type = "MCQ"
        elif any(k in question for k in ("a", "b", "c", "d")) and not (isinstance(question.get("a"), (int, float)) and isinstance(question.get("b"), (int, float))):
            q_type = "MCQ"
        elif correct_answer is not None:
            q_type = "MCQ"
        else:
            q_type = "SUBJECTIVE"
    else:
        q_type = raw_type

    if q_type in ("MCQ", "MSQ", "NAT") and correct_answer is not None:

        score = 0.0
        options = question.get("options") or []
        student_ans = answer or ""

        if q_type == "MCQ":
            student_clean = student_ans.strip()
            correct_clean = correct_answer.strip()

            if student_clean.lower() == correct_clean.lower():
                score = 10.0
            elif _get_option_label(student_clean) == _get_option_label(correct_clean):
                score = 10.0
            else:
                score = -2.5 if mode == "pyq" else 0.0

        elif q_type == "MSQ":
            student_set = _get_selected_labels(student_ans, options)
            correct_set = _get_selected_labels(correct_answer, options)

            if not student_set:
                score = 0.0
            else:
                incorrect_selected = student_set.difference(correct_set)
                correct_selected = student_set.intersection(correct_set)

                if len(incorrect_selected) > 0:
                    score = -2.5 if mode == "pyq" else 0.0
                elif len(correct_selected) == len(correct_set):
                    score = 10.0
                elif len(correct_selected) > 0 and mode == "pyq":
                    score = 5.0
                else:
                    score = 0.0

        elif q_type == "NAT":
            try:
                if abs(float(student_ans.strip()) - float(correct_answer.strip())) < 1e-4:
                    score = 10.0
                else:
                    score = 0.0
            except ValueError:
                if student_ans.strip().lower() == correct_answer.strip().lower():
                    score = 10.0
                else:
                    score = 0.0

        return {
            "score": score,
            "correct_answer": correct_answer,
            "explanation": "",
        }

    # Fallback to Gemma for subjective/other questions
    result = await generate_grading(
        question_text=_get_question_text(question),
        correct_answer=correct_answer or "Not provided",
        student_answer=answer or "No answer",
        difficulty=get_difficulty_value(question),
        mode=mode,
    )

    return {
        "score": result.get("score", 0.0),
        "correct_answer": correct_answer,
        "explanation": "",  # Feedback suppressed per user request
    }


async def generate_session_summary(
    responses: list,
    theta_final: float,
    mode: str,
) -> Optional[str]:
    """Generate an AI summary of the quiz session using Gemma."""
    try:
        summary = await generate_summary(responses, theta_final, mode)
        return summary
    except Exception as e:
        logger.error("summary_generation_failed", error=str(e))
        return None


async def run_and_store_summary(
    session_id: str,
    responses: list,
    theta_final: float,
    mode: str,
) -> None:
    """
    Background task: generate a session summary via Ollama and persist it to
    the TestResult row in PostgreSQL. Also sets a Redis flag once done.

    This is designed to run as a fire-and-forget asyncio task so the
    /quiz/complete endpoint can return immediately without blocking.
    """
    import uuid as _uuid
    from app.database import AsyncSessionLocal
    from app.models.quiz import TestResult

    logger.info("summary_bg_task_started", session_id=session_id)

    summary = await generate_session_summary(responses, theta_final, mode)
    if not summary:
        logger.warning("summary_bg_task_no_result", session_id=session_id)
        return

    try:
        async with AsyncSessionLocal() as db:
            from sqlalchemy import select
            result_q = await db.execute(
                select(TestResult).where(TestResult.session_id == _uuid.UUID(session_id))
            )
            result_row = result_q.scalar_one_or_none()
            if result_row:
                result_row.ai_summary = summary
                await db.commit()
                logger.info("summary_bg_task_stored", session_id=session_id)
            else:
                logger.warning("summary_bg_task_result_not_found", session_id=session_id)
    except Exception as e:
        logger.error("summary_bg_task_db_error", session_id=session_id, error=str(e))
