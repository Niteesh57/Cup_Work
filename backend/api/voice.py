import logging
from typing import Any, Dict
from fastapi import APIRouter, Body

from backend.agents import voice_transcriber
from backend.voice.tts_streamer import tts_streamer, SUPPORTED_VOICES
from backend.models import TranscribeRequest

logger = logging.getLogger("hey_jave.api.voice")

router = APIRouter(tags=["Voice & TTS"])


@router.post("/api/voice/transcribe")
async def transcribe_voice(req: TranscribeRequest):
    """Transcribes base64 encoded audio using Gemini Multimodal."""
    try:
        text = await voice_transcriber.transcribe_audio_base64(
            audio_base64=req.audioBase64,
            mime_type=req.mimeType or "audio/wav",
            api_key=req.apiKey,
        )
        return {"success": True, "text": text}
    except Exception as e:
        logger.error(f"Transcription error: {e}")
        return {"success": False, "error": str(e)}


@router.get("/api/voice/tts-voices")
async def get_tts_voices():
    """Returns available Gemini TTS voice profiles."""
    return {"voices": SUPPORTED_VOICES, "default": "Kore"}


@router.post("/api/voice/speak-stream")
@router.post("/api/voice/speak")
async def speak_gemini_tts(data: Dict[str, Any] = Body(...)):
    """Streams spoken audio chunks directly to the device using Gemini TTS."""
    text = str(data.get("text", "")).strip()
    voice = str(data.get("voice", "Kore"))
    task_id = str(data.get("taskId", ""))
    device_id = data.get("deviceId")
    style = data.get("style")

    if not text:
        return {"success": False, "error": "No text provided to speak"}

    try:
        stream_id = await tts_streamer.speak_text(
            text=text,
            voice_name=voice,
            task_id=task_id,
            device_id=device_id,
            style=style,
        )
        return {"success": True, "streamId": stream_id}
    except Exception as e:
        logger.error(f"Gemini TTS streaming error: {e}")
        return {"success": False, "error": str(e)}


@router.post("/api/voice/stop-tts")
async def stop_gemini_tts(data: Dict[str, Any] = Body(...)):
    task_id = str(data.get("taskId", ""))
    stream_id = str(data.get("streamId", ""))
    if stream_id:
        tts_streamer.cancel_stream(stream_id)
    elif task_id:
        tts_streamer.cancel_task_streams(task_id)
    return {"success": True}
