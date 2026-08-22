from __future__ import annotations

import asyncio
import base64
import logging
import re
import uuid
from typing import Any, AsyncGenerator, Dict, List, Optional, Set

from google import genai
from google.genai import types

from backend.config import config
from backend.events.event_bus import EventType, event_bus

logger = logging.getLogger("cup_work.tts_streamer")

SUPPORTED_VOICES: Dict[str, str] = {
    "Kore": "Firm & Confident",
    "Puck": "Upbeat & Dynamic",
    "Zephyr": "Bright & Crisp",
    "Fenrir": "Excitable & High-Energy",
    "Aoede": "Breezy & Natural",
    "Sulafat": "Warm & Inviting",
    "Enceladus": "Breathy & Relaxed",
    "Achird": "Friendly & Approachable",
    "Leda": "Youthful & Clear",
    "Charon": "Informative & Authoritative",
    "Orus": "Firm & Direct",
    "Callirrhoe": "Easy-going & Fluid",
    "Autonoe": "Bright & Cheerful",
    "Iapetus": "Clear & Articulate",
    "Umbriel": "Easy-going & Calm",
    "Algieba": "Smooth & Resonant",
    "Despina": "Smooth & Polished",
    "Erinome": "Clear & Sharp",
    "Algenib": "Gravelly & Deep",
    "Rasalgethi": "Informative & Grounded",
    "Laomedeia": "Upbeat & Cheerful",
    "Achernar": "Soft & Gentle",
    "Alnilam": "Firm & Structured",
    "Schedar": "Even & Balanced",
    "Gacrux": "Mature & Steady",
    "Pulcherrima": "Forward & Engaging",
    "Zubenelgenubi": "Casual & Modern",
    "Vindemiatrix": "Gentle & Friendly",
    "Sadachbia": "Lively & Vibrant",
    "Sadaltager": "Knowledgeable & Experienced",
}

# Recognized emotional & expressive audio tags
AUDIO_TAGS: Set[str] = {
    "amazed", "crying", "curious", "excited", "excitedly", "sighs", "gasp",
    "giggles", "laughs", "mischievously", "panicked", "sarcastic", "serious",
    "shouting", "tired", "trembling", "whispers", "cheerfully", "warm",
    "thoughtful", "very fast", "very slow", "confidently", "calmly",
}


def clean_text_for_tts(text: str) -> str:
    """Prepares text for Gemini TTS, removing code blocks while preserving inline audio tags."""
    if not text:
        return ""
    # Strip markdown code blocks (e.g. ```python ... ```)
    text = re.sub(r"```[\s\S]*?```", " [here is the code snippet] ", text)
    # Strip inline code formatting backticks while keeping words
    text = re.sub(r"`([^`]+)`", r"\1", text)
    # Strip markdown header symbols (### -> "")
    text = re.sub(r"#{1,6}\s+", "", text)
    # Strip bold / italic stars while keeping text
    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
    text = re.sub(r"\*([^*]+)\*", r"\1", text)
    # Convert markdown links [title](url) -> title
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    # Remove remaining markdown symbols
    text = re.sub(r"[*_~|>#\-=]{2,}", " ", text)
    # Collapse multiple whitespaces
    text = re.sub(r"\s{2,}", " ", text).strip()
    return text


def build_directorial_prompt(
    transcript: str,
    voice_name: str = "Kore",
    style: Optional[str] = None,
) -> str:
    """Constructs a clean prompt for Gemini TTS that triggers optimal natural vocal inflection."""
    transcript = transcript.strip()
    if not transcript:
        return ""

    # If transcript already contains audio tags (e.g. [excitedly], [whispers]), use it directly
    has_tag = transcript.startswith("[") or bool(re.search(r"\[[a-zA-Z\s,]+\]", transcript))

    if has_tag:
        return transcript

    # Otherwise format with natural tone instruction
    default_style = style or "cheerful, warm, articulate and natural"
    return f"Say in a {default_style} tone: {transcript}"


class GeminiTtsStreamer:
    """High-performance streaming Text-to-Speech service using Google Gemini TTS.

    Replaces all local device TTS (Windows SAPI / Web Speech API) by streaming
    high-fidelity 24kHz 16-bit PCM audio chunks directly to the frontend.
    Features intelligent chunk coalescing to eliminate network jitter and breaking voice.
    """

    PRIMARY_MODEL = "gemini-3.1-flash-tts-preview"
    FALLBACK_MODELS = ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"]

    # Coalesce 1920-byte micro-chunks into smooth playback blocks
    INITIAL_BURST_BYTES = 3840   # ~80ms for instant start
    STEADY_CHUNK_BYTES = 9600    # ~200ms for zero-jitter smooth playback

    def __init__(self) -> None:
        self._active_streams: Dict[str, asyncio.Event] = {}

    def cancel_stream(self, stream_id: str) -> None:
        """Signals cancellation for a specific audio stream."""
        cancel_evt = self._active_streams.get(stream_id)
        if cancel_evt:
            cancel_evt.set()

    def cancel_task_streams(self, task_id: str) -> None:
        """Cancels all active audio streams for a task."""
        for s_id in list(self._active_streams.keys()):
            if s_id.startswith(f"{task_id}-"):
                self.cancel_stream(s_id)

    async def generate_speech_stream(
        self,
        text: str,
        voice_name: str = "Kore",
        task_id: str = "",
        device_id: Optional[str] = None,
        style: Optional[str] = None,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Async generator yielding coalesced base64 PCM audio chunks streamed from Gemini TTS."""
        from backend.bridge.electron_bridge import electron_bridge

        cleaned_text = clean_text_for_tts(text)
        if not cleaned_text or len(cleaned_text.strip()) == 0:
            return

        # Cancel any prior in-progress TTS streams to strictly prevent stream interleaving
        for old_id in list(self._active_streams.keys()):
            self.cancel_stream(old_id)

        stream_id = f"{task_id or 'tts'}-{uuid.uuid4().hex[:8]}"
        cancel_event = asyncio.Event()
        self._active_streams[stream_id] = cancel_event

        # Ensure API client is initialized with configured API key
        api_key = config.GEMINI_API_KEY
        if not api_key:
            logger.error("Cannot stream Gemini TTS: GEMINI_API_KEY is not configured.")
            return

        client = genai.Client(api_key=api_key)
        voice = voice_name if voice_name in SUPPORTED_VOICES else "Zephyr"
        prompt = build_directorial_prompt(
            transcript=cleaned_text,
            voice_name=voice,
            style=style,
        )

        models_to_try = [self.PRIMARY_MODEL] + self.FALLBACK_MODELS
        start_payload = {
            "type": EventType.TTS_STREAM_START.value,
            "streamId": stream_id,
            "taskId": task_id,
            "deviceId": device_id,
            "text": cleaned_text,
            "voice": voice,
            "sampleRate": 24000,
            "channels": 1,
        }

        # Broadcast stream start via event_bus (server.py forwarder handles WebSocket broadcast)
        await event_bus.publish(EventType.TTS_STREAM_START, start_payload)

        try:
            for model_name in models_to_try:
                if cancel_event.is_set():
                    logger.info(f"TTS stream {stream_id} cancelled before start.")
                    break

                try:
                    logger.info(f"Starting Gemini TTS stream (model={model_name}, voice={voice}, streamId={stream_id})")

                    contents_payload = [
                        types.Content(
                            role="user",
                            parts=[
                                types.Part.from_text(text=f"## Transcript:\n{prompt}"),
                            ],
                        ),
                    ]

                    def _fetch_stream(m=model_name, c=contents_payload, v=voice):
                        return client.models.generate_content_stream(
                            model=m,
                            contents=c,
                            config=types.GenerateContentConfig(
                                temperature=1,
                                response_modalities=["AUDIO"],
                                speech_config=types.SpeechConfig(
                                    voice_config=types.VoiceConfig(
                                        prebuilt_voice_config=types.PrebuiltVoiceConfig(
                                            voice_name=v
                                        )
                                    )
                                ),
                            ),
                        )

                    stream = await asyncio.to_thread(_fetch_stream)
                    chunk_index = 0
                    pcm_buffer = bytearray()
                    is_initial_chunk = True

                    def _get_next_chunk(iterator):
                        try:
                            return next(iterator), False
                        except StopIteration:
                            return None, True
                        except Exception as ex:
                            raise ex

                    stream_iter = iter(stream)
                    while not cancel_event.is_set():
                        chunk_data, is_done = await asyncio.to_thread(_get_next_chunk, stream_iter)
                        if is_done:
                            break
                        if not chunk_data:
                            continue

                        # Extract raw PCM audio bytes from response candidates
                        for cand in getattr(chunk_data, "candidates", []) or []:
                            if cand.content and cand.content.parts:
                                for part in cand.content.parts:
                                    if part.inline_data and part.inline_data.data:
                                        pcm_buffer.extend(part.inline_data.data)

                        threshold = self.INITIAL_BURST_BYTES if is_initial_chunk else self.STEADY_CHUNK_BYTES
                        if len(pcm_buffer) >= threshold:
                            out_bytes = bytes(pcm_buffer)
                            pcm_buffer.clear()
                            is_initial_chunk = False

                            b64_audio = base64.b64encode(out_bytes).decode("ascii")
                            chunk_payload = {
                                "type": EventType.TTS_STREAM_CHUNK.value,
                                "streamId": stream_id,
                                "taskId": task_id,
                                "deviceId": device_id,
                                "chunkIndex": chunk_index,
                                "audioChunk": b64_audio,
                                "sampleRate": 24000,
                                "channels": 1,
                            }
                            chunk_index += 1

                            await event_bus.publish(EventType.TTS_STREAM_CHUNK, chunk_payload)
                            yield chunk_payload

                    # Flush remaining buffer at stream end
                    if len(pcm_buffer) > 0 and not cancel_event.is_set():
                        out_bytes = bytes(pcm_buffer)
                        pcm_buffer.clear()
                        b64_audio = base64.b64encode(out_bytes).decode("ascii")
                        chunk_payload = {
                            "type": EventType.TTS_STREAM_CHUNK.value,
                            "streamId": stream_id,
                            "taskId": task_id,
                            "deviceId": device_id,
                            "chunkIndex": chunk_index,
                            "audioChunk": b64_audio,
                            "sampleRate": 24000,
                            "channels": 1,
                        }
                        chunk_index += 1

                        await event_bus.publish(EventType.TTS_STREAM_CHUNK, chunk_payload)
                        yield chunk_payload

                    # Broadcast stream completion event
                    end_payload = {
                        "type": EventType.TTS_STREAM_END.value,
                        "streamId": stream_id,
                        "taskId": task_id,
                        "deviceId": device_id,
                        "totalChunks": chunk_index,
                    }
                    await event_bus.publish(EventType.TTS_STREAM_END, end_payload)

                    # Stream succeeded with this model
                    logger.info(f"Gemini TTS stream {stream_id} finished successfully with {chunk_index} coalesced chunks.")
                    return

                except Exception as e:
                    logger.warning(f"Gemini TTS streaming failed on model {model_name}: {e}. Trying fallback...")
                    continue

        finally:
            self._active_streams.pop(stream_id, None)
            end_payload = {
                "type": EventType.TTS_STREAM_END.value,
                "streamId": stream_id,
                "taskId": task_id,
                "deviceId": device_id,
            }
            await event_bus.publish(EventType.TTS_STREAM_END, end_payload)
            await electron_bridge.broadcast(end_payload, target_device_id=device_id, task_id=task_id)

    async def speak_text(
        self,
        text: str,
        voice_name: str = "Kore",
        task_id: str = "",
        device_id: Optional[str] = None,
        style: Optional[str] = None,
    ) -> str:
        """Convenience method that runs speech streaming to completion."""
        last_stream_id = ""
        async for chunk in self.generate_speech_stream(
            text=text,
            voice_name=voice_name,
            task_id=task_id,
            device_id=device_id,
            style=style,
        ):
            last_stream_id = chunk.get("streamId", "")
        return last_stream_id

    async def test_stream(self) -> bool:
        """Diagnostic self-test for TTS streaming."""
        chunks = 0
        async for _ in self.generate_speech_stream(
            text="[excitedly] Hello! Testing Gemini TTS streaming with high quality.",
            voice_name="Kore",
        ):
            chunks += 1
        return chunks > 0


tts_streamer = GeminiTtsStreamer()
