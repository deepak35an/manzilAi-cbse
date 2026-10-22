from pydantic import BaseModel
from typing import Optional, List


class ParseJdRequest(BaseModel):
    job_description: str


class ParseJdResponse(BaseModel):
    skills: List[str]
    experience_level: Optional[str] = None
    role_title: Optional[str] = None


class GenerateQuestionsRequest(BaseModel):
    skills: List[str]
    difficulty: str = "medium"
    count: int = 10


class GenerateQuestionsResponse(BaseModel):
    task_id: str
    content_registry_id: Optional[str] = None
    question_count: int


class JobReportResponse(BaseModel):
    overall_score: float
    skill_scores: dict
    readiness_percentage: float
    ai_summary: Optional[str] = None
    improvement_roadmap: Optional[List[dict]] = None
