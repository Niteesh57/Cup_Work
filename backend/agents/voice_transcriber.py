from __future__ import annotations

import asyncio
import base64
import logging
from typing import Optional
from google.genai import types
from backend.core.client import get_genai_client
from backend.config import config

logger = logging.getLogger("hey_jave.transcribe")


class VoiceTranscriber:
    """Multimodal audio transcriber using Google GenAI SDK.

    Transcribes microphone WAV / WebM audio directly via Gemini.
    """

    def __init__(self, model: Optional[str] = None):
        self.model = model or config.DEFAULT_MODEL

    async def transcribe_audio_base64(self, audio_base64: str, mime_type: str = "audio/wav", api_key: Optional[str] = None) -> str:
        """Transcribes base64-encoded audio."""
        if not audio_base64 or len(audio_base64) < 50:
            raise ValueError("Audio data is missing or too short.")

        try:
            audio_bytes = base64.b64decode(audio_base64)
        except Exception as e:
            raise ValueError(f"Failed to decode base64 audio: {e}")

        return await self.transcribe_audio_bytes(audio_bytes, mime_type=mime_type, api_key=api_key)

    async def transcribe_audio_bytes(self, audio_bytes: bytes, mime_type: str = "audio/wav", api_key: Optional[str] = None) -> str:
        """Transcribes raw audio bytes."""
        client = get_genai_client(api_key=api_key)
        logger.info(f"Transcribing audio ({len(audio_bytes)} bytes, mime={mime_type}) using {self.model}...")

        prompt_part = "Transcribe this spoken audio exactly as heard. Return ONLY the transcribed text without quotes, markdown, or commentary."
        audio_part = types.Part.from_bytes(data=audio_bytes, mime_type=mime_type)

        def _call_gemini():
            return client.models.generate_content(
                model=self.model,
                contents=[audio_part, prompt_part],
                config=types.GenerateContentConfig(
                    temperature=0.1,
                )
            )

        response = await asyncio.to_thread(_call_gemini)
        transcript = (response.text or "").strip()
        logger.info(f"Transcription result: {transcript}")
        return transcript


voice_transcriber = VoiceTranscriber()
