from __future__ import annotations

import asyncio
import logging
from enum import Enum
from typing import Any, Awaitable, Callable, Dict, List, Optional, Set

logger = logging.getLogger("cup_work.events")


class EventType(str, Enum):
    AGENT_STARTED = "AGENT_STARTED"
    OBSERVING_SCREEN = "OBSERVING_SCREEN"
    THINKING = "THINKING"
    PLANNING = "PLANNING"
    TOOL_EXECUTING = "TOOL_EXECUTING"
    TOOL_COMPLETED = "TOOL_COMPLETED"
    ASKING_USER = "ASKING_USER"
    USER_RESPONDED = "USER_RESPONDED"
    COMMENTARY = "COMMENTARY"
    GOAL_VERIFIED = "GOAL_VERIFIED"
    TASK_COMPLETED = "TASK_COMPLETED"
    TASK_FAILED = "TASK_FAILED"
    TTS_SPEAK = "TTS_SPEAK"
    TTS_STREAM_START = "TTS_STREAM_START"
    TTS_STREAM_CHUNK = "TTS_STREAM_CHUNK"
    TTS_STREAM_END = "TTS_STREAM_END"
    HITL_QUESTION = "HITL_QUESTION"
    AGENT_STEP_UPDATE = "AGENT_STEP_UPDATE"
    STATE_CHANGE = "STATE_CHANGE"
    TODO_UPDATED = "TODO_UPDATED"


EventHandler = Callable[[str, Dict[str, Any]], Awaitable[None]]


class EventBus:
    """Small typed pub/sub used by the executor and sub-agents.

    Subscribers register per EventType and receive ``(event_type, payload)``.
    The executor forwards externally visible events to Electron over the
    existing WebSocket bridge; commentary translates raw events to speech.
    """

    def __init__(self) -> None:
        self._subscribers: Dict[str, Set[EventHandler]] = {}

    def subscribe(self, event_type: EventType, handler: EventHandler) -> None:
        key = event_type.value
        self._subscribers.setdefault(key, set()).add(handler)

    def unsubscribe(self, event_type: EventType, handler: EventHandler) -> None:
        key = event_type.value
        handlers = self._subscribers.get(key)
        if handlers:
            handlers.discard(handler)

    async def publish(self, event_type: EventType, payload: Optional[Dict[str, Any]] = None) -> None:
        data = payload or {}
        key = event_type.value
        handlers = list(self._subscribers.get(key, set()))
        if not handlers:
            logger.debug(f"Event {key} published with no subscribers: {data}")
            return

        await asyncio.gather(
            *(self._safe_call(handler, key, data) for handler in handlers),
            return_exceptions=True,
        )

    async def _safe_call(self, handler: EventHandler, key: str, data: Dict[str, Any]) -> None:
        try:
            await handler(key, data)
        except Exception:
            logger.exception(f"Event handler failed for {key}")


event_bus = EventBus()
