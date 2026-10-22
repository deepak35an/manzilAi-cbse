"""Job evaluation: JD parsing, skill-targeted question generation, reports."""
import io
import json
import uuid
from typing import List, Optional

import aiofiles
import pdfplumber
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.job import JobEvaluation
from app.models.quiz import TestResult, UserResponse, QuizSession
from app.services.ai.gemini_client import parse_job_description, generate_skill_questions
from app.services.ai.gemma_client import generate_summary
from app.utils.helpers import resolve_content_path
from app.utils.logging import logger


async def parse_jd(job_description: str) -> dict:
    return await parse_job_description(job_description)


async def parse_jd_pdf(pdf_bytes: bytes, description: Optional[str] = None) -> dict:
    """Extract text from PDF and parse it as a job description."""
    text_parts: List[str] = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)

    extracted = "\n".join(text_parts)
    if not extracted.strip():
        return {"skills": [], "experience_level": "unknown", "role_title": "unknown"}

    if description:
        extracted = f"{description}\n\n{extracted}"

    return await parse_job_description(extracted)


async def generate_job_questions(
    skills: List[str],
    difficulty: str,
    count: int,
    user_id: str,
    db: AsyncSession,
) -> dict:
    """Generate skill-targeted questions and save to staging."""
    questions = await generate_skill_questions(skills, difficulty, count)
    task_id = str(uuid.uuid4())

    bank = {
        "id": task_id,
        "title": f"Job Assessment {task_id[:8]}",
        "subject": "Job Skills",
        "source_type": "job",
        "questions": questions,
    }

    staging_path = resolve_content_path(".staging", f"{task_id}.json")
    async with aiofiles.open(staging_path, "w") as f:
        await f.write(json.dumps(bank, indent=2))

    return {"task_id": task_id, "question_count": len(questions)}


async def get_job_report(
    session_id: str,
    user_id: str,
    db: AsyncSession,
) -> dict:
    """Generate a job readiness report from quiz results."""
    result_q = await db.execute(
        select(TestResult).where(
            TestResult.session_id == uuid.UUID(session_id),
            TestResult.user_id == uuid.UUID(user_id),
        )
    )
    test_result = result_q.scalar_one_or_none()
    if not test_result:
        return {"error": "No results found for this session"}

    resp_q = await db.execute(
        select(UserResponse).where(UserResponse.session_id == uuid.UUID(session_id))
    )
    responses = resp_q.scalars().all()

    skill_scores = {}
    for resp in responses:
        topic = "General"
        skill_scores.setdefault(topic, [])
        skill_scores[topic].append(resp.score)

    avg_skill_scores = {k: round(sum(v) / len(v), 2) for k, v in skill_scores.items()}
    overall = round(sum(avg_skill_scores.values()) / max(1, len(avg_skill_scores)), 2)
    readiness = round((overall / 10) * 100, 1)

    roadmap = []
    for skill, score in sorted(avg_skill_scores.items(), key=lambda x: x[1]):
        if score < 7:
            roadmap.append({
                "skill": skill,
                "current_score": score,
                "priority": "high" if score < 4 else "medium",
                "suggestion": f"Focus on improving {skill} fundamentals",
            })

    return {
        "overall_score": overall,
        "skill_scores": avg_skill_scores,
        "readiness_percentage": readiness,
        "ai_summary": test_result.ai_summary,
        "improvement_roadmap": roadmap,
    }
