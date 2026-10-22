import uuid
import enum
from typing import Optional
from datetime import datetime

from sqlalchemy import String, Enum, ForeignKey, DateTime, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class UserRole(str, enum.Enum):
    student = "student"
    org_admin = "org_admin"
    super_admin = "super_admin"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    phone: Mapped[str] = mapped_column(String(20), index=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    first_name: Mapped[str] = mapped_column(String(150), default="")
    last_name: Mapped[str] = mapped_column(String(150), default="")
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.student)
    org_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=True)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    @property
    def name(self) -> str:
        """Full name for backward compatibility with the rest of the codebase."""
        return f"{self.first_name} {self.last_name}".strip()

    @property
    def org_name(self) -> Optional[str]:
        return self.organization.name if self.organization else None

    organization = relationship("Organization", back_populates="users")
    quiz_sessions = relationship("QuizSession", back_populates="user")
    test_results = relationship("TestResult", back_populates="user")
    performance_summaries = relationship("PerformanceSummary", back_populates="user")
    job_evaluations = relationship("JobEvaluation", back_populates="user")
    study_plans = relationship("UserStudyPlan", back_populates="user")
    cuet_enrollments = relationship("CuetEnrollment", back_populates="user")
    credentials = relationship("StudentCredentials", back_populates="user", uselist=False, cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_users_org_id", "org_id"),
        # Phone uniqueness: enforced only for non-student roles (partial index in migration)
        # Email uniqueness: enforced only for non-student roles (partial index in migration)
    )

