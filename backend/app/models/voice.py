import uuid

from sqlalchemy import Float, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class VoiceAnalysis(Base):
    __tablename__ = "voice_analysis"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    response_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("user_responses.id"), unique=True)
    transcription: Mapped[str | None] = mapped_column(Text, nullable=True)
    audio_features: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    text_confidence: Mapped[float] = mapped_column(Float, default=0.0)
    audio_confidence: Mapped[float] = mapped_column(Float, default=0.0)
    final_confidence: Mapped[float] = mapped_column(Float, default=0.0)

    response = relationship("UserResponse", back_populates="voice_analysis")
