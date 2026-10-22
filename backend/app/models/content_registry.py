import uuid
import enum
from datetime import datetime

from sqlalchemy import String, Integer, Enum, DateTime, ForeignKey, Text, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class RootFolder(str, enum.Enum):
    subjectwise = "subjectwise"
    examination = "examination"
    job = "job"


class SourceType(str, enum.Enum):
    standard = "standard"
    pyq = "pyq"
    job = "job"


class Visibility(str, enum.Enum):
    global_ = "global"
    org_specific = "org_specific"


class ContentRegistry(Base):
    __tablename__ = "content_registry"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    file_path: Mapped[str] = mapped_column(Text, unique=True)
    root_folder: Mapped[RootFolder] = mapped_column(Enum(RootFolder))
    subfolder: Mapped[str] = mapped_column(String(255))
    title: Mapped[str] = mapped_column(String(500))
    subject: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source_type: Mapped[SourceType] = mapped_column(Enum(SourceType), default=SourceType.standard)
    question_count: Mapped[int] = mapped_column(Integer, default=0)
    visibility: Mapped[Visibility] = mapped_column(Enum(Visibility), default=Visibility.global_)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    access_list = relationship("ContentAccess", back_populates="content_registry", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_content_registry_root_subfolder", "root_folder", "subfolder"),
        Index("ix_content_registry_visibility", "visibility"),
    )


class ContentAccess(Base):
    __tablename__ = "content_access"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    content_registry_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("content_registry.id", ondelete="CASCADE"))
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"))

    content_registry = relationship("ContentRegistry", back_populates="access_list")
    organization = relationship("Organization", back_populates="content_access")
