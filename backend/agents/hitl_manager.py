from __future__ import annotations

import asyncio
import logging
import time
import uuid
from typing import Any, Dict, List, Optional

from backend.bridge.electron_bridge import electron_bridge
from backend.events.event_bus import EventType, event_bus
from backend.storage.sqlite_store import sqlite_store

logger = logging.getLogger("hey_jave.hitl")


class HitlManager:
    """Non-blocking human-in-the-loop coordinator.

    `ask` persists the question to SQLite, emits `HITL_QUESTION` (which the
    frontend turns into voice + ScreenPad), then waits for a `HUMAN_RESPONSE`
    over the existing WebSocket. The first answer wins. Answers can be saved as
    preferences so the same question is skipped on later runs.
    """

    def __init__(self) -> None:
        self._pending: Dict[str, asyncio.Future] = {}

    async def ask(
        self,
        question: str,
        options: Optional[List[str]] = None,
        task_id: str = "",
        user_id: str = "default",
        preference_key: Optional[str] = None,
        timeout: float = 300.0,
    ) -> str:
        # Preference shortcut: skip asking when we already have an answer.
        if preference_key:
            saved = sqlite_store.get_preference(user_id, preference_key)
            if saved:
                return str(saved["value"])

        hitl_id = str(uuid.uuid4())
        now = int(time.time() * 1000)
        sqlite_store.enqueue_hitl(hitl_id, task_id, question, options, "pending", now)

        future = asyncio.get_running_loop().create_future()
        self._pending[hitl_id] = future

        await event_bus.publish(EventType.STATE_CHANGE, {"taskId": task_id, "state": "waiting_hitl"})
        await event_bus.publish(EventType.HITL_QUESTION, {
            "id": hitl_id,
            "taskId": task_id,
            "question": question,
            "options": options or [],
        })
        await event_bus.publish(EventType.TTS_SPEAK, {"text": question})

        try:
            answer = await asyncio.wait_for(future, timeout=timeout)
        except asyncio.TimeoutError:
            self._pending.pop(hitl_id, None)
            sqlite_store.resolve_hitl(hitl_id, "", now)
            return ""
        finally:
            self._pending.pop(hitl_id, None)

        sqlite_store.resolve_hitl(hitl_id, answer, int(time.time() * 1000))
        sqlite_store.add_clarification(
            clarification_id=hitl_id,
            task_id=task_id,
            question=question,
            answer=answer,
            saved_as_preference=1 if preference_key else 0,
            timestamp_ms=now,
        )

        if preference_key:
            sqlite_store.set_preference(user_id, preference_key, answer, timestamp_ms=now)

        await event_bus.publish(EventType.USER_RESPONDED, {"taskId": task_id, "answer": answer})
        return answer

    def resolve(self, response_id: str, answer: str) -> bool:
        """Called by the WebSocket handler when a HUMAN_RESPONSE arrives."""
        future = self._pending.get(response_id)
        if future and not future.done():
            future.set_result(answer)
            return True
        return False

    def resolve_pending_by_task(self, task_id: str, answer: str) -> bool:
        """Best-effort resolution when the response has no explicit HITL id."""
        for hitl_id, future in list(self._pending.items()):
            if not future.done():
                future.set_result(answer)
                return True
        return False


hitl_manager = HitlManager()
