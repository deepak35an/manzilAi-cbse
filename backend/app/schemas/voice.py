from pydantic import BaseModel
from typing import Optional


class VoiceProcessResponse(BaseModel):
    transcription: str
    text_confidence: float
    audio_confidence: float
    final_confidence: float
    audio_features: Optional[dict] = None
