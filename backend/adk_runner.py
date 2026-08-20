from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from google.adk import Runner
from google.adk.agents.context_cache_config import ContextCacheConfig
from google.adk.apps import App
from google.adk.sessions import InMemorySessionService
from google.genai import types

from backend.agents import executor_manager, root_agent
from backend.core.client import get_genai_client
from backend.memory.memory_manager import memory_manager

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

        import asyncio
        self._user_locks: dict[str, asyncio.Lock] = {}
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
        device_id: str = "desktop-main",
        task_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        import asyncio
        if user_id not in self._user_locks:
            self._user_locks[user_id] = asyncio.Lock()

        user_lock = self._user_locks[user_id]
        if user_lock.locked():
            logger.warning(f"[AdkRunner] Rejecting concurrent request for user {user_id}: another task is running")
            return {
                "success": False,
                "message": "Another task is already in progress. Please wait for it to complete or click Stop.",
                "taskId": task_id or "task-busy",
                "steps": [],
            }

        async with user_lock:
            return await self._run_internal(
                prompt=prompt,
                audio_base64=audio_base64,
                mime_type=mime_type,
                user_id=user_id,
                device_id=device_id,
                task_id=task_id,
            )

    async def _run_internal(
        self,
        prompt: Optional[str] = None,
        audio_base64: Optional[str] = None,
        mime_type: Optional[str] = "audio/wav",
        user_id: str = "default",
        device_id: str = "desktop-main",
        task_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        import base64
        import time
        import uuid
        from backend.bridge.electron_bridge import electron_bridge

        session_id = task_id or f"adk-session-{abs(hash(user_id + (prompt or '') + str(time.time())))}"
        parts: list[types.Part] = []

        # Fetch active user preferences, active todos, and short-term context
        agent_context = memory_manager.get_agent_context(user_id=user_id, device_id=device_id)

        # Record user turn in short-term memory
        memory_manager.add_turn(
            user_id=user_id,
            device_id=device_id,
            role="USER",
            content=prompt or "[Voice Action]",
            session_id=session_id,
        )

        # 1. Attach spoken voice audio if provided
        if audio_base64:
            try:
                audio_bytes = base64.b64decode(audio_base64)
                logger.info(f"Adding multimodal audio part to ADK message ({len(audio_bytes)} bytes, mime={mime_type})")
                parts.append(types.Part.from_bytes(data=audio_bytes, mime_type=mime_type or "audio/wav"))
            except Exception as e:
                logger.error(f"Failed to decode audio bytes for ADK: {e}")

        # 2. Attach prompt with injected context
        context_header = f"[ACTIVE CONTEXT - PREFERENCES & TODOS]\n{agent_context}\n\n[USER COMMAND]\n" if agent_context else ""
        if prompt:
            parts.append(types.Part.from_text(text=f"{context_header}{prompt}"))
        elif audio_base64:
            parts.append(types.Part.from_text(text=f"{context_header}Listen to the user's spoken voice command in the attached audio and execute the requested actions or whiteboard lecture."))
        else:
            parts.append(types.Part.from_text(text=context_header))

        new_message = types.Content(
            role="user",
            parts=parts,
        )

        control = executor_manager.get_or_create(session_id)
        final_text = ""
        agent_texts: list[str] = []
        events = []
        executed_steps: list[dict[str, Any]] = []
        whiteboard_data: Optional[dict[str, Any]] = None

        # Notify frontend of task start
        await electron_bridge.broadcast({
            "type": "TASK_START",
            "taskId": session_id,
            "prompt": prompt or "[Voice Action]",
            "activeAgent": "root",
        })

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
                        "steps": executed_steps,
                        "events": events,
                    }

                if not await control.wait_if_paused():
                    return {
                        "success": False,
                        "message": "Task cancelled by user.",
                        "taskId": session_id,
                        "steps": executed_steps,
                        "events": events,
                    }

                events.append(event)

                # Broadcast active agent taking charge & state change
                author = event.author or "root"
                if author != "user":
                    has_tools = False
                    thought_text = ""
                    if event.content and event.content.parts:
                        thought_text = "\n".join(p.text for p in event.content.parts if getattr(p, "text", None)).strip()
                        for p in event.content.parts:
                            fc = getattr(p, "function_call", None)
                            if fc:
                                has_tools = True
                                # Clean function args
                                raw_args = dict(fc.args) if fc.args else {}
                                clean_args = {}
                                for k, v in raw_args.items():
                                    if isinstance(v, str) and len(v) > 200 and k.lower().endswith(("base64", "bytes", "data")):
                                        clean_args[k] = f"[base64 payload {len(v)} chars]"
                                    else:
                                        clean_args[k] = v

                                if fc.name in ("draw_whiteboard_lecture", "draw_whiteboard_step", "draw_whiteboard_lecture_tool", "draw_whiteboard_step_tool", "draw_mermaid_diagram"):
                                    whiteboard_data = raw_args

                                step_dict = {
                                    "id": f"step-{uuid.uuid4().hex[:6]}",
                                    "agentName": author,
                                    "actionName": fc.name,
                                    "thought": thought_text or f"Active agent {author} invoking {fc.name}",
                                    "parameters": clean_args,
                                    "args": raw_args,
                                    "timestamp": time.strftime("%H:%M:%S"),
                                    "success": True,
                                }
                                executed_steps.append(step_dict)
                                await electron_bridge.broadcast({
                                    "type": "AGENT_STEP_UPDATE",
                                    "taskId": session_id,
                                    "step": step_dict,
                                    "activeAgent": author,
                                })

                    await electron_bridge.broadcast({
                        "type": "STATE_CHANGE",
                        "taskId": session_id,
                        "activeAgent": author,
                        "agentName": author,
                        "state": "acting" if has_tools else "planning",
                    })

                if event.content and event.content.parts:
                    text = "\n".join(p.text for p in event.content.parts if p.text).strip()
                    if text and event.author not in ("user",):
                        agent_texts.append(text)
                        final_text = text

            if not final_text and agent_texts:
                final_text = agent_texts[-1]

            final_msg = final_text or "Task complete."
            # Record agent turn in short-term memory
            memory_manager.add_turn(
                user_id=user_id,
                device_id=device_id,
                role="AGENT",
                content=final_msg,
                session_id=session_id,
            )

            return {
                "success": True,
                "message": final_msg,
                "taskId": session_id,
                "steps": executed_steps,
                "whiteboardData": whiteboard_data,
                "hadWhiteboard": bool(whiteboard_data),
                "events": events,
            }
        finally:
            executor_manager.remove(session_id)



adk_runner = AdkRunner()

