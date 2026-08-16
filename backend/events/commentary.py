from __future__ import annotations

import re
from typing import Any, Dict, Optional

from backend.events.event_bus import EventType, event_bus

# Direct mapping for high-level events.
EVENT_COMMENTARY: Dict[str, str] = {
    EventType.AGENT_STARTED.value: "Okay, I'll take care of that.",
    EventType.OBSERVING_SCREEN.value: "Let me see what's currently open.",
    EventType.PLANNING.value: "Working out the best approach.",
    EventType.TASK_COMPLETED.value: "Done. {result}",
    EventType.TASK_FAILED.value: "I wasn't able to complete that. {reason}",
}

# Low-level tool events that should be grouped rather than spoken individually.
NAVIGATION_TOOLS = {"mouse_move", "mouse_click", "keyboard_type", "keyboard_key", "press_hotkey", "scroll", "drag_drop"}
NAVIGATION_COMMENTARY = "Navigating on screen."


class CommentaryTranslator:
    """Translates raw agent events into short, natural spoken sentences.

    High-level events use ``EVENT_COMMENTARY``. Navigation tool events are
    grouped: only the first in a burst emits ``TTS_SPEAK``, avoiding a string
    of "navigating... navigating... navigating..." for one click.
    """

    def __init__(self) -> None:
        self._last_navigation_spoken = False

    async def start(self) -> None:
        event_bus.subscribe(EventType.AGENT_STARTED, self._on_high_level)
        event_bus.subscribe(EventType.OBSERVING_SCREEN, self._on_high_level)
        event_bus.subscribe(EventType.PLANNING, self._on_high_level)
        event_bus.subscribe(EventType.TASK_COMPLETED, self._on_high_level)
        event_bus.subscribe(EventType.TASK_FAILED, self._on_high_level)
        event_bus.subscribe(EventType.TOOL_EXECUTING, self._on_tool_executing)
        event_bus.subscribe(EventType.TASK_COMPLETED, self._reset_burst)
        event_bus.subscribe(EventType.TASK_FAILED, self._reset_burst)
        event_bus.subscribe(EventType.AGENT_STARTED, self._reset_burst)

    async def _on_high_level(self, event_type: str, payload: Dict[str, Any]) -> None:
        template = EVENT_COMMENTARY.get(event_type)
        if not template:
            return

        text = template
        if "{result}" in text:
            text = text.replace("{result}", str(payload.get("result", "completed")))
        if "{reason}" in text:
            text = text.replace("{reason}", str(payload.get("reason", "an error occurred")))

        await event_bus.publish(EventType.COMMENTARY, {"text": text})
        await event_bus.publish(EventType.TTS_SPEAK, {"text": text})

    async def _on_tool_executing(self, event_type: str, payload: Dict[str, Any]) -> None:
        tool = str(payload.get("tool", "")).lower()
        if tool in NAVIGATION_TOOLS:
            if self._last_navigation_spoken:
                return
            self._last_navigation_spoken = True
            await event_bus.publish(EventType.COMMENTARY, {"text": NAVIGATION_COMMENTARY})
            await event_bus.publish(EventType.TTS_SPEAK, {"text": NAVIGATION_COMMENTARY})

    async def _reset_burst(self, event_type: str, payload: Dict[str, Any]) -> None:
        self._last_navigation_spoken = False


commentary_translator = CommentaryTranslator()


def strip_markdown_for_tts(text: str) -> str:
    """Remove markdown syntax so Windows SAPI reads plain words."""
    text = re.sub(r"```[\s\S]*?```", "", text)
    text = re.sub(r"`[^`]+`", "", text)
    text = re.sub(r"#{1,6}\s+", "", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
    text = re.sub(r"\*([^*]+)\*", r"\1", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"[*_~|>#\-=]", "", text)
    return re.sub(r"\s{2,}", " ", text).strip()
