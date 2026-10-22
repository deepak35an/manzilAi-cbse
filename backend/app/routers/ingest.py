import uuid

from fastapi import APIRouter, Depends, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.middleware.auth import require_role
from app.models.user import User
from app.services.ingestion_service import process_pdf, get_staged_json

router = APIRouter()


@router.post("/pdf")
async def ingest_pdf(
    file: UploadFile = File(...),
    source_type: str = Form("standard"),
    subject: str = Form(None),
    user: User = Depends(require_role(["super_admin", "org_admin"])),
):
    task_id = str(uuid.uuid4())
    pdf_bytes = await file.read()
    result = await process_pdf(
        pdf_bytes=pdf_bytes,
        task_id=task_id,
        source_type=source_type,
        subject=subject,
    )
    return result


@router.get("/status/{task_id}")
async def ingestion_status(
    task_id: str,
    user: User = Depends(require_role(["super_admin", "org_admin"])),
):
    data = await get_staged_json(task_id)
    if data is None:
        return {"task_id": task_id, "status": "processing"}
    return {
        "task_id": task_id,
        "status": "ready",
        "question_count": len(data.get("questions", [])),
    }
