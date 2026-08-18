from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from google.adk import Runner
from google.adk.agents.context_cache_config import ContextCacheConfig
from google.adk.apps import App
from google.adk.sessions import InMemorySessionService
from google.genai import types

from backend.agent.executor import executor_manager
from backend.agent.root_agent import root_agent
from backend.core.client import get_genai_client

logger = logging.getLogger("hey_jave.adk")


class AdkRunner:
    """Thin ADK Runner wrapper used by the server and tests.

    Keeps a single in-memory session service and delegates routing to the
    root LlmAgent. The custom executor and sub-agents are invoked through ADK
    transfer machinery.
    """

    def __init__(self) -> None:
        # Ensure GOOGLE_APPLICATION_CREDENTIALS / project / location env vars are
        # set to absolute, resolved values BEFORE the ADK Gemini client builds its
        # own genai.Client() from the environment. get_genai_client() does this
        # resolution (it also sets GOOGLE_GENAI_USE_VERTEXAI etc.).
        get_genai_client()

        self._session_service = InMemorySessionService()
        self._app = App(
            name="hey-jave",
            root_agent=root_agent,
            context_cache_config=ContextCacheConfig(),
        )
        self._runner = Runner(
            app=self._app,
            session_service=self._session_service,
            auto_create_session=True,
        )

    async def run(
        self,
        prompt: Optional[str] = None,
        audio_base64: Optional[str] = None,
        mime_type: Optional[str] = "audio/wav",
        user_id: str = "default",
        task_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        import base64
        import time

        session_id = task_id or f"adk-session-{abs(hash(user_id + (prompt or '') + str(time.time())))}"
        parts: list[types.Part] = []

        # 1. Automatically capture and attach the current screen for ALL agents & sub-agents
        try:
            from backend.bridge.electron_bridge import electron_bridge
            shot = await electron_bridge.execute_tool("take_screenshot", {}, task_id=session_id)
            screenshot_b64 = shot.get("base64") if isinstance(shot, dict) else None
            if screenshot_b64:
                raw_bytes = base64.b64decode(screenshot_b64)
                logger.info(f"Attached live desktop screenshot to ADK message ({len(raw_bytes)} bytes)")
                parts.append(types.Part.from_bytes(data=raw_bytes, mime_type="image/png"))
        except Exception as e:
            logger.warning(f"Could not auto-capture initial screenshot: {e}")

        # 2. Attach spoken voice audio if provided
        if audio_base64:
            try:
                audio_bytes = base64.b64decode(audio_base64)
                logger.info(f"Adding multimodal audio part to ADK message ({len(audio_bytes)} bytes, mime={mime_type})")
                parts.append(types.Part.from_bytes(data=audio_bytes, mime_type=mime_type or "audio/wav"))
            except Exception as e:
                logger.error(f"Failed to decode audio bytes for ADK: {e}")

        if prompt:
            parts.append(types.Part.from_text(text=prompt))
        elif audio_base64:
            parts.append(types.Part.from_text(text="Listen to the user's spoken voice command in the attached audio and execute the requested desktop actions based on the attached screen."))
        else:
            parts.append(types.Part.from_text(text=""))

        new_message = types.Content(
            role="user",
            parts=parts,
        )

        control = executor_manager.get_or_create(session_id)
        final_text = ""
        agent_texts: list[str] = []
        events = []

        try:
            async for event in self._runner.run_async(
                user_id=user_id,
                session_id=session_id,
                new_message=new_message,
            ):
                if control.cancel_requested.is_set():
                    logger.info(f"ADK task {session_id} cancelled by user.")
                    return {
                        "success": False,
                        "message": "Task cancelled by user.",
                        "taskId": session_id,
                        "events": events,
                    }

                if not await control.wait_if_paused():
                    return {
                        "success": False,
                        "message": "Task cancelled by user.",
                        "taskId": session_id,
                        "events": events,
                    }

                events.append(event)
                if event.content and event.content.parts:
                    text = "\n".join(p.text for p in event.content.parts if p.text).strip()
                    if text and event.author not in ("user",):
                        agent_texts.append(text)
                        final_text = text

            if not final_text and agent_texts:
                final_text = agent_texts[-1]

            return {
                "success": True,
                "message": final_text or "Task complete.",
                "taskId": session_id,
                "events": events,
            }
        finally:
            executor_manager.remove(session_id)


adk_runner = AdkRunner()
