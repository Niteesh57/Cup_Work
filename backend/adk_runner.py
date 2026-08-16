from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from google.adk import Runner
from google.adk.agents.context_cache_config import ContextCacheConfig
from google.adk.apps import App
from google.adk.sessions import InMemorySessionService
from google.genai import types

from backend.agent.root_agent import root_agent

logger = logging.getLogger("hey_jave.adk")


class AdkRunner:
    """Thin ADK Runner wrapper used by the server and tests.

    Keeps a single in-memory session service and delegates routing to the
    root LlmAgent. The custom executor and sub-agents are invoked through ADK
    transfer machinery.
    """

    def __init__(self) -> None:
        self._session_service = InMemorySessionService()
        self._app = App(
            name="hey-jave",
            root_agent=root_agent,
            context_cache_config=ContextCacheConfig(),
        )
        self._runner = Runner(
            app=self._app,
            session_service=self._session_service,
        )

    async def run(
        self,
        prompt: str,
        user_id: str = "default",
        task_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        session_id = task_id or f"adk-session-{abs(hash(user_id + prompt))}"
        new_message = types.Content(
            role="user",
            parts=[types.Part.from_text(text=prompt)],
        )

        final_text = ""
        events = []
        async for event in self._runner.run_async(
            user_id=user_id,
            session_id=session_id,
            new_message=new_message,
        ):
            events.append(event)
            if event.content and event.content.parts:
                text = "\n".join(p.text for p in event.content.parts if p.text).strip()
                if text and event.author not in ("user",):
                    final_text = text

        return {
            "success": True,
            "message": final_text or "Task complete.",
            "taskId": session_id,
            "events": events,
        }


adk_runner = AdkRunner()
