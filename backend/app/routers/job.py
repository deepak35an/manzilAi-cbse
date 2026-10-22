from fastapi import APIRouter, Depends, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.dependencies import get_db
from app.middleware.auth import get_current_user
from app.models.user import User
from app.schemas.job import (
    ParseJdRequest,
    ParseJdResponse,
    GenerateQuestionsRequest,
    GenerateQuestionsResponse,
    JobReportResponse,
)
from app.services.job_service import parse_jd, parse_jd_pdf, generate_job_questions, get_job_report

router = APIRouter()


@router.post("/parse", response_model=ParseJdResponse)
async def parse_jd_endpoint(
    request: ParseJdRequest,
    user: User = Depends(get_current_user),
):
    result = await parse_jd(request.job_description)
    return ParseJdResponse(**result)


@router.post("/parse-pdf", response_model=ParseJdResponse)
async def parse_jd_pdf_endpoint(
    file: UploadFile = File(...),
    description: Optional[str] = Form(None),
    user: User = Depends(get_current_user),
):
    pdf_bytes = await file.read()
    result = await parse_jd_pdf(pdf_bytes, description)
    return ParseJdResponse(**result)


@router.post("/generate-questions", response_model=GenerateQuestionsResponse)
async def generate_questions_endpoint(
    request: GenerateQuestionsRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await generate_job_questions(
        skills=request.skills,
        difficulty=request.difficulty,
        count=request.count,
        user_id=str(user.id),
        db=db,
    )
    return GenerateQuestionsResponse(**result)


@router.get("/report/{session_id}", response_model=JobReportResponse)
async def job_report_endpoint(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await get_job_report(session_id, str(user.id), db)
    if "error" in result:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=result["error"])
    return JobReportResponse(**result)
