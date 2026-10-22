"""PDF ingestion pipeline: PDF -> text -> Gemini -> JSON questions -> filesystem."""
import json
import uuid
from pathlib import Path
from typing import Optional

import aiofiles

from app.services.ai.gemini_client import extract_questions_from_text
from app.utils.helpers import resolve_content_path
from app.utils.logging import logger


async def process_pdf(
    pdf_bytes: bytes,
    task_id: str,
    source_type: str = "standard",
    subject: Optional[str] = None,
) -> dict:
    """Extract text from PDF, generate questions via Gemini, save to staging."""
    text = _extract_text_from_pdf(pdf_bytes)
    if not text.strip():
        return {"task_id": task_id, "status": "failed", "error": "No text extracted from PDF"}

    markdown_text = _convert_to_markdown(text)

    questions = await extract_questions_from_text(
        text=markdown_text,
        source_type=source_type,
        subject=subject,
    )

    if not questions:
        return {"task_id": task_id, "status": "failed", "error": "No questions generated"}

    for q in questions:
        if "id" not in q:
            q["id"] = str(uuid.uuid4())
        q["difficulty"] = max(0.0, min(1.0, float(q.get("difficulty", 0.5))))

    bank = {
        "id": task_id,
        "title": f"Generated Bank {task_id[:8]}",
        "subject": subject or "General",
        "source_type": source_type,
        "created_at": None,
        "difficulty_distribution": _compute_distribution(questions),
        "questions": questions,
    }

    staging_path = resolve_content_path(".staging", f"{task_id}.json")
    async with aiofiles.open(staging_path, "w") as f:
        await f.write(json.dumps(bank, indent=2))

    logger.info("pdf_ingestion_complete", task_id=task_id, questions=len(questions))
    return {"task_id": task_id, "status": "ready", "question_count": len(questions)}


async def get_staged_json(task_id: str) -> Optional[dict]:
    staging_path = resolve_content_path(".staging", f"{task_id}.json")
    if not staging_path.exists():
        return None
    async with aiofiles.open(staging_path, "r") as f:
        return json.loads(await f.read())


async def update_staged_json(task_id: str, questions: list) -> dict:
    staging_path = resolve_content_path(".staging", f"{task_id}.json")
    if not staging_path.exists():
        return {"error": "Staged file not found"}

    async with aiofiles.open(staging_path, "r") as f:
        bank = json.loads(await f.read())

    bank["questions"] = questions
    bank["difficulty_distribution"] = _compute_distribution(questions)

    async with aiofiles.open(staging_path, "w") as f:
        await f.write(json.dumps(bank, indent=2))

    return {"status": "updated", "question_count": len(questions)}


async def confirm_staged_json(
    task_id: str,
    root_folder: str,
    subfolder: str,
    filename: str,
) -> Optional[bytes]:
    """Move staged JSON to the target folder. Returns file content bytes."""
    staging_path = resolve_content_path(".staging", f"{task_id}.json")
    if not staging_path.exists():
        return None

    async with aiofiles.open(staging_path, "r") as f:
        content = await f.read()

    target_path = resolve_content_path(root_folder, subfolder, filename)
    target_path.parent.mkdir(parents=True, exist_ok=True)

    async with aiofiles.open(target_path, "w") as f:
        await f.write(content)

    staging_path.unlink()
    logger.info("staged_json_confirmed", task_id=task_id, target=str(target_path))
    return content.encode()


def _extract_text_from_pdf(pdf_bytes: bytes) -> str:
    try:
        import pdfplumber
        import io
        text_parts = []
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page in pdf.pages:
                text_parts.append(page.extract_text() or "")
        return "\n\n".join(text_parts)
    except Exception as e:
        logger.error("pdf_extraction_failed", error=str(e))
        return ""


def _convert_to_markdown(text: str) -> str:
    """Basic text-to-markdown conversion."""
    lines = text.split("\n")
    md_lines = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            md_lines.append("")
        elif stripped.isupper() and len(stripped) < 100:
            md_lines.append(f"## {stripped}")
        else:
            md_lines.append(stripped)
    return "\n".join(md_lines)


def _compute_distribution(questions: list) -> dict:
    easy = sum(1 for q in questions if q.get("difficulty", 0.5) < 0.33)
    medium = sum(1 for q in questions if 0.33 <= q.get("difficulty", 0.5) < 0.67)
    hard = sum(1 for q in questions if q.get("difficulty", 0.5) >= 0.67)
    return {"easy": easy, "medium": medium, "hard": hard}
