import uuid
import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import String, Integer, Float, DateTime, ForeignKey, Text, Index, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class QuizMode(str, enum.Enum):
    subject = "subject"
    pyq = "pyq"
    job = "job"


class QuizSession(Base):
    __tablename__ = "quiz_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    content_registry_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("content_registry.id"), nullable=True)
    plan_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("study_plan_templates.id", ondelete="SET NULL"), nullable=True)
    week_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    test_number: Mapped[int | None] = mapped_column(Integer, nullable=True)  # Which sub-test within the week (1/2/3)
    theta: Mapped[float] = mapped_column(Float, default=0.0)
    mode: Mapped[QuizMode] = mapped_column(String(20), default=QuizMode.subject)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    user = relationship("User", back_populates="quiz_sessions")
    responses = relationship("UserResponse", back_populates="session", cascade="all, delete-orphan")
    result = relationship("TestResult", back_populates="session", uselist=False)

    __table_args__ = (
        Index("ix_quiz_sessions_user_id", "user_id"),
        Index("ix_quiz_sessions_plan_id", "plan_id"),
    )


class UserResponse(Base):
    __tablename__ = "user_responses"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("quiz_sessions.id", ondelete="CASCADE"))
    question_id: Mapped[str] = mapped_column(Text)
    answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    score: Mapped[float] = mapped_column(Float, default=0.0)
    time_taken: Mapped[float] = mapped_column(Float, default=0.0)
    voice_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    session = relationship("QuizSession", back_populates="responses")
    voice_analysis = relationship("VoiceAnalysis", back_populates="response", uselist=False)


class TestResult(Base):
    __tablename__ = "test_results"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("quiz_sessions.id"), unique=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    total_score: Mapped[float] = mapped_column(Float, default=0.0)
    max_score: Mapped[float] = mapped_column(Float, default=0.0)
    theta_final: Mapped[float] = mapped_column(Float, default=0.0)
    ai_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    details: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    session = relationship("QuizSession", back_populates="result")
    user = relationship("User", back_populates="test_results")

    __table_args__ = (
        Index("ix_test_results_user_id", "user_id"),
    )


class PerformanceSummary(Base):
    __tablename__ = "performance_summary"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    # plan_id scopes this row to a specific exam journey (GATE / CUET_CHEMISTRY / etc.)
    # NULL = legacy unscoped data (pre-migration). New data always has plan_id set.
    plan_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("study_plan_templates.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    subject: Mapped[str] = mapped_column(String(255))
    avg_theta: Mapped[float] = mapped_column(Float, default=0.0)
    total_attempts: Mapped[int] = mapped_column(Integer, default=0)
    weak_topics: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # Cached AI-generated strength/weakness report; NULL means regeneration needed.
    # Scoped per plan_id — regenerated per plan when topic performance changes.
    ai_report: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="performance_summaries")

    __table_args__ = (
        # Unique per (user, plan, subject) — allows same subject across different plans
        Index(
            "ix_performance_summary_user_plan_subject",
            "user_id", "plan_id", "subject",
            unique=True,
        ),
    )



class StudyPlanTemplate(Base):
    __tablename__ = "study_plan_templates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    exam: Mapped[str] = mapped_column(String(255))
    # NULL = topic-wise (durationless) template; non-null = classic week-wise plan
    duration_months: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    plan: Mapped[str] = mapped_column(Text)             # Full JSON plan text
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Partial unique indexes (see alembic g1a2b3c4d5e6):
    # - (exam, duration_months) unique when duration_months IS NOT NULL
    # - exam unique when duration_months IS NULL (topic-wise)
    __table_args__ = (
        Index(
            "ix_study_plan_templates_exam_duration",
            "exam", "duration_months",
            unique=True,
            postgresql_where=text("duration_months IS NOT NULL"),
        ),
        Index(
            "ix_study_plan_templates_exam_topicwise",
            "exam",
            unique=True,
            postgresql_where=text("duration_months IS NULL"),
        ),
    )

class UserStudyPlan(Base):
    __tablename__ = "user_study_plans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    template_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("study_plan_templates.id"))
    
    # Progress tracking
    # Progress: week numbers OR topic sequence numbers (topic-wise plans)
    completed_weeks: Mapped[dict | None] = mapped_column(JSONB, default=list)
    current_week: Mapped[int] = mapped_column(Integer, default=1)
    topic_proficiency: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # From onboarding sliders
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Constraint: one progress record per user per template
    __table_args__ = (
        Index("ix_user_study_plans_user_template", "user_id", "template_id", unique=True),
    )

    user = relationship("User", back_populates="study_plans")
    template = relationship("StudyPlanTemplate")


class CuetEnrollment(Base):
    """Groups a student's multi-subject CUET enrollment.

    Each row links a user to one subject's StudyPlanTemplate for a specific
    duration. A student enrolling in 3 CUET subjects creates 3 rows with the
    same duration_months. Subjects are locked at enrollment time.
    """
    __tablename__ = "cuet_enrollments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    template_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("study_plan_templates.id", ondelete="CASCADE"))
    # Denormalized for fast grouping queries without a join
    duration_months: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="cuet_enrollments")
    template = relationship("StudyPlanTemplate")

    __table_args__ = (
        # One enrollment per user per subject-template (prevents duplicate subjects)
        UniqueConstraint("user_id", "template_id", name="uq_cuet_enrollment_user_template"),
        Index("ix_cuet_enrollments_user_duration", "user_id", "duration_months"),
    )
