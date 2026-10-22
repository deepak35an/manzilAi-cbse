"""Voice processing: Sarvam STT + Praat acoustic analysis."""
import tempfile
from pathlib import Path
from typing import Optional

import httpx
import numpy as np

from app.config import settings
from app.utils.logging import logger

SARVAM_STT_URL = "https://api.sarvam.ai/speech-to-text"


async def process_voice(audio_bytes: bytes, filename: str = "audio.wav") -> dict:
    """Process voice input: STT + acoustic analysis -> composite confidence."""
    transcription_result = await _sarvam_stt(audio_bytes, filename)
    text_confidence = transcription_result.get("confidence", 0.0)
    transcription = transcription_result.get("transcript", "")

    audio_result = _analyze_acoustics(audio_bytes)
    audio_confidence = audio_result.get("confidence", 0.0)

    final_confidence = 0.6 * text_confidence + 0.4 * audio_confidence

    return {
        "transcription": transcription,
        "text_confidence": round(text_confidence, 4),
        "audio_confidence": round(audio_confidence, 4),
        "final_confidence": round(final_confidence, 4),
        "audio_features": audio_result.get("features", {}),
    }


async def _sarvam_stt(audio_bytes: bytes, filename: str) -> dict:
    """Send audio to Sarvam AI Saaras v3 for transcription."""
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                SARVAM_STT_URL,
                headers={"api-subscription-key": settings.SARVAM_API_KEY},
                files={"file": (filename, audio_bytes, "audio/wav")},
                data={"model": "saaras:v3", "language_code": "en-IN"},
            )
            response.raise_for_status()
            data = response.json()
            return {
                "transcript": data.get("transcript", ""),
                "confidence": data.get("confidence", 0.5),
            }
    except httpx.HTTPStatusError as e:
        logger.error("sarvam_stt_http_error", status_code=e.response.status_code, response=e.response.text)
        return {"transcript": "", "confidence": 0.0}
    except Exception as e:
        logger.error("sarvam_stt_failed", error=str(e))
        return {"transcript": "", "confidence": 0.0}


def _analyze_acoustics(audio_bytes: bytes) -> dict:
    """Analyze audio features using the advanced acoustic_utils toolkit."""
    try:
        from app.utils.acoustic_utils import extract_features, calculate_acoustic_confidence
        
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            f.write(audio_bytes)
            temp_path = f.name

        features = extract_features(temp_path)
        confidence = calculate_acoustic_confidence(features)

        Path(temp_path).unlink(missing_ok=True)

        return {
            "confidence": round(confidence, 4),
            "features": features or {},
        }
    except Exception as e:
        logger.error("acoustic_analysis_failed", error=str(e))
        return {"confidence": 0.5, "features": {}}
    except Exception as e:
        logger.error("acoustic_analysis_failed", error=str(e))
        return {"confidence": 0.5, "features": {}}
