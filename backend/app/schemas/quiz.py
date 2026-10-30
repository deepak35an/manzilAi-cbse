from pydantic import BaseModel, field_validator
from typing import Optional, List, Any
from datetime import datetime


class QuizStartRequest(BaseModel):
    content_registry_id: str
    mode: str = "subject"
    topics: Optional[List[str]] = None


class PyqQuizStartRequest(BaseModel):
    subtopics: List[str]
    mode: str = "pyq"
    prep_duration: Optional[int] = None


class QuizStartResponse(BaseModel):
    session_id: str
    question: dict
    total_questions: int


class StudyPlanRequest(BaseModel):
    exam: str
    # Optional for topic-wise (durationless) templates; required for week-wise generation
    duration_months: Optional[int] = None
    topic_proficiency: Optional[dict] = None  # {topic_name: 1-5 rating}


class StudyPlanResponse(BaseModel):
    plan: str
    plan_id: str
    exam: str
    duration_months: Optional[int] = None
    completed_weeks: Optional[List[int]] = []
    current_week: Optional[int] = 1
    plan_type: Optional[str] = None  # e.g. TOPIC_WISE_TESTS
    total_weeks: Optional[int] = None  # weeks OR topic count (API field name kept for compat)


class WeeklyTestRequest(BaseModel):
    plan_id: str
    week_number: int  # Week number OR topic sequence for topic-wise plans
    exam: str
    test_number: int = 1  # Sub-test within the week (always 1 for topic-wise)


class QuestionOut(BaseModel):
    id: str
    text: str
    type: Optional[str] = "MCQ"
    options: Optional[List[str]] = None
    difficulty: float
    topic: Optional[str] = None
    subject: Optional[str] = None
    subtopic: Optional[str] = None
    source_file: Optional[str] = None

    @field_validator("type", mode="before")
    @classmethod
    def validate_type(cls, v: Any) -> str:
        if not v or not isinstance(v, str):
            return "MCQ"
        v_upper = v.strip().upper()
        if v_upper in ("MCQ", "MSQ", "NAT"):
            return v_upper
        return v



class AnswerRequest(BaseModel):
    session_id: str
    question_id: str
    answer: str
    time_taken: float = 0.0
    voice_confidence: Optional[float] = None


class AnswerResponse(BaseModel):
    score: float
    correct_answer: Optional[str] = None
    explanation: Optional[str] = None
    next_question: Optional[QuestionOut] = None
    is_complete: bool = False
    theta: float


class QuizCompleteResponse(BaseModel):
    session_id: str
    total_score: float
    max_score: float
    theta_final: float
    ai_summary: Optional[str] = None
    details: Optional[dict] = None


class TestResultResponse(BaseModel):
    id: str
    session_id: str
    total_score: float
    max_score: float
    theta_final: float
    ai_summary: Optional[str] = None
    details: Optional[dict] = None
    created_at: datetime

    model_config = {"from_attributes": True}
