from fastapi import APIRouter, Depends, UploadFile, File

from app.middleware.auth import get_current_user
from app.models.user import User
from app.schemas.voice import VoiceProcessResponse
from app.services.voice_service import process_voice

router = APIRouter()


@router.post("/process", response_model=VoiceProcessResponse)
async def process_voice_endpoint(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    audio_bytes = await file.read()
    result = await process_voice(audio_bytes, filename=file.filename or "audio.wav")
    return VoiceProcessResponse(**result)
