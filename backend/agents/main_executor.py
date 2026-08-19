from __future__ import annotations

import asyncio
import base64
import logging
import time
import uuid
from enum import Enum
from typing import Any, AsyncGenerator, Dict, List, Optional

from google.adk.agents import BaseAgent
from google.adk.agents.invocation_context import InvocationContext
from google.adk.events import Event
from google.genai import types

from backend.config import config
from backend.core.client import get_genai_client
from backend.tools.definitions import get_desktop_tools
from backend.bridge.electron_bridge import electron_bridge
from backend.agents.goal_verifier import goal_verifier, VerificationResult
from backend.agents.hitl_manager import hitl_manager
from backend.events.event_bus import EventType, event_bus
from backend.memory.memory_manager import memory_manager
from backend.storage.sqlite_store import sqlite_store

logger = logging.getLogger("hey_jave.executor")


class AgentState(str, Enum):
    OBSERVING = "observing"
    ANALYZING = "analyzing"
    PLANNING = "planning"
    WAITING_HITL = "waiting_hitl"
    PAUSED = "paused"
    ACTING = "acting"
    VERIFYING = "verifying"
    COMPLETED = "completed"
    FAILED = "failed"


EXECUTOR_SYSTEM_INSTRUCTION = """You are Hey Jave's Main Desktop Executor, an autonomous Windows automation agent.

Your goal is to execute the user's task on Windows end-to-end:
1. Analyze the user goal and the provided screen observation (screenshot, windows, interactive UI elements).
2. Before taking action, announce your next step in one concise sentence (read aloud to user).
3. Execute the appropriate desktop tools (e.g. smart_ui_action, uia_invoke, uia_set_value, keyboard_type, press_hotkey, launch_app, browser tools).
4. Verify if the task is complete. If finished, reply with a short confirmation message and stop calling tools.

Rules:
- Prefer semantic UI Automation tools (smart_ui_action, uia_invoke, uia_set_value) and browser tools over blind mouse clicking.
- If an application is already open, reuse its window.
- Use `ask_human` if you require human confirmation, sensitive decisions, or credentials.
- When done, return a clear summary message."""

OBSERVATION_TOOLS = {
    "take_screenshot",
    "screenshot_region",
    "get_active_window",
    "get_open_windows",
    "get_screen_resolution",
    "uia_get_tree",
    "uia_get_interactive_elements",
    "uia_search_elements",
    "uia_inspect_element_at",
    "uia_get_text",
    "uia_find",
    "resolve_element",
    "read_clipboard",
    "get_process_list",
    "browser_find_element",
    "browser_get_text",
    "browser_list_elements",
    "browser_get_url",
}


class ExecutorTask:
    """In-memory control state for a running executor task."""

    def __init__(self, task_id: str) -> None:
        self.task_id = task_id
        self.pause_requested = asyncio.Event()
        self.resume_requested = asyncio.Event()
        self.cancel_requested = asyncio.Event()
        self.paused = False

    def request_pause(self) -> None:
        self.pause_requested.set()

    def request_resume(self) -> None:
        self.pause_requested.clear()
        self.paused = False
        self.resume_requested.set()

    def request_cancel(self) -> None:
        self.cancel_requested.set()
        self.resume_requested.set()
        self.pause_requested.clear()

    async def wait_if_paused(self) -> bool:
        if not self.pause_requested.is_set():
            return True
        self.paused = True
        await event_bus.publish(EventType.STATE_CHANGE, {"taskId": self.task_id, "state": AgentState.PAUSED.value})
        await self.resume_requested.wait()
        self.resume_requested.clear()
        if self.cancel_requested.is_set():
            return False
        self.paused = False
        await event_bus.publish(EventType.STATE_CHANGE, {"taskId": self.task_id, "state": AgentState.PLANNING.value})
        return True


class ExecutorManager:
    """Registry of active executor tasks for pause/resume/cancel control."""

    def __init__(self) -> None:
        self._tasks: Dict[str, ExecutorTask] = {}

    def get_or_create(self, task_id: str) -> ExecutorTask:
        if task_id not in self._tasks:
            self._tasks[task_id] = ExecutorTask(task_id)
        return self._tasks[task_id]

    def remove(self, task_id: str) -> None:
        self._tasks.pop(task_id, None)

    def pause(self, task_id: str) -> bool:
        task = self._tasks.get(task_id) or next((t for tid, t in self._tasks.items() if task_id in tid or tid in task_id), None)
        if task:
            task.request_pause()
            return True
        return False

    def resume(self, task_id: str) -> bool:
        task = self._tasks.get(task_id) or next((t for tid, t in self._tasks.items() if task_id in tid or tid in task_id), None)
        if task:
            task.request_resume()
            return True
        return False

    def cancel(self, task_id: str) -> bool:
        task = self._tasks.get(task_id) or next((t for tid, t in self._tasks.items() if task_id in tid or tid in task_id), None)
        if task:
            task.request_cancel()
            return True
        return False


executor_manager = ExecutorManager()


class MainExecutorAgent:
    """Direct desktop agent execution loop using Google GenAI & desktop tools."""

    def __init__(self, model_name: Optional[str] = None) -> None:
        self._model_name = model_name or config.DEFAULT_MODEL
        self._max_actions = 25
        self._max_llm_calls = 35

    async def execute_prompt(
        self,
        prompt: str,
        task_id: Optional[str] = None,
        image_base64: Optional[str] = None,
        audio_base64: Optional[str] = None,
        mime_type: Optional[str] = None,
        model: Optional[str] = None,
        user_id: str = "default",
    ) -> Dict[str, Any]:
        task_id = task_id or f"task-{uuid.uuid4().hex[:8]}"
        model_name = model or self._model_name
        control = executor_manager.get_or_create(task_id)
        steps: List[Dict[str, Any]] = []
        llm_calls = 0
        actions = 0

        started_ms = int(time.time() * 1000)
        sqlite_store.save_agent_session(task_id, prompt or "[Voice Action]", "RUNNING", AgentState.OBSERVING.value, timestamp_ms=started_ms)

        await event_bus.publish(EventType.AGENT_STARTED, {"taskId": task_id, "prompt": prompt})
        await electron_bridge.broadcast({"type": "TASK_START", "taskId": task_id, "prompt": prompt})

        try:
            await self._set_state(task_id, AgentState.OBSERVING)
            await event_bus.publish(EventType.OBSERVING_SCREEN, {"taskId": task_id})

            init_tasks = [
                electron_bridge.execute_tool("take_screenshot", {}, task_id=task_id) if not image_base64 else asyncio.sleep(0),
                electron_bridge.execute_tool("get_open_windows", {}, task_id=task_id),
                electron_bridge.execute_tool("uia_get_interactive_elements", {"maxElements": 40}, task_id=task_id),
            ]
            init_results = await asyncio.gather(*init_tasks, return_exceptions=True)

            if not image_base64 and isinstance(init_results[0], dict) and init_results[0].get("base64"):
                image_base64 = init_results[0].get("base64")

            open_windows: List[str] = []
            if isinstance(init_results[1], dict) and init_results[1].get("windows"):
                open_windows = [w.get("title", "").strip() for w in init_results[1]["windows"] if w.get("title", "").strip()]

            interactive_elements_text = ""
            if isinstance(init_results[2], dict) and init_results[2].get("elements"):
                elements = init_results[2]["elements"]
                interactive_elements_text = "\n".join(
                    f"[{el.get('controlType')}] '{el.get('name')}' bounds={el.get('bounds')} center=({el.get('bounds', {}).get('centerX')}, {el.get('bounds', {}).get('centerY')})"
                    for el in elements[:35]
                )

            obs_parts: List[types.Part] = []
            if image_base64:
                obs_parts.append(types.Part.from_bytes(data=base64.b64decode(image_base64), mime_type="image/png"))

            obs_parts.append(types.Part.from_text(text=(
                f"Task Goal: {prompt or '[Execute request]'}\n"
                f"Open Windows: {json_str(open_windows)}\n"
                f"Interactive Elements:\n{interactive_elements_text or 'None detected.'}"
            )))

            if audio_base64:
                try:
                    obs_parts.append(types.Part.from_bytes(data=base64.b64decode(audio_base64), mime_type=mime_type or "audio/wav"))
                except Exception as e:
                    logger.warning(f"Failed to attach audio bytes: {e}")

            contents: List[types.Content] = [types.Content(role="user", parts=obs_parts)]
            memory_manager.add_turn(user_id, "USER", prompt or "[Voice Action]")
            system_instruction = EXECUTOR_SYSTEM_INSTRUCTION

            client = get_genai_client()
            tools = get_desktop_tools()

            while actions < self._max_actions and llm_calls < self._max_llm_calls:
                if control.cancel_requested.is_set():
                    return self._finish(task_id, False, "Task cancelled by user.", steps, AgentState.FAILED, user_id)
                if not await control.wait_if_paused():
                    return self._finish(task_id, False, "Task cancelled by user.", steps, AgentState.FAILED, user_id)

                llm_calls += 1
                await self._set_state(task_id, AgentState.PLANNING)
                await event_bus.publish(EventType.THINKING, {"taskId": task_id})

                def _call_model():
                    return client.models.generate_content(
                        model=model_name,
                        contents=contents,
                        config=types.GenerateContentConfig(
                            system_instruction=system_instruction,
                            tools=tools,
                            temperature=0.2,
                        ),
                    )

                response = await asyncio.to_thread(_call_model)
                candidate = response.candidates[0] if response.candidates else None
                if not candidate or not candidate.content:
                    final_text = "Task complete."
                    return self._finish(task_id, True, final_text, steps, AgentState.COMPLETED, user_id)

                contents.append(candidate.content)
                function_calls = [p.function_call for p in candidate.content.parts if p.function_call is not None]
                narrative = "\n".join(p.text for p in candidate.content.parts if p.text).strip()

                if narrative and function_calls:
                    await self._speak(task_id, narrative)

                if not function_calls:
                    # Verification check before declaring completion
                    await self._set_state(task_id, AgentState.VERIFYING)
                    screenshot = await self._screenshot(task_id)
                    verdict = await goal_verifier.check(prompt, screenshot) if screenshot else VerificationResult(True, 1.0, "")
                    if verdict.passed:
                        final_text = narrative or "Task complete."
                        return self._finish(task_id, True, final_text, steps, AgentState.COMPLETED, user_id)

                    contents.append(types.Content(
                        role="user",
                        parts=[types.Part.from_text(text=f"Verification: {verdict.missing or 'Goal not fully achieved'}. Continue to fulfill goal.")],
                    ))
                    continue

                # Execute tool calls
                tool_response_parts: List[types.Part] = []
                for fc in function_calls:
                    func_name = fc.name
                    func_args = dict(fc.args) if fc.args else {}

                    if func_name == "ask_human":
                        question = str(func_args.get("question", "Can I proceed?"))
                        options = list(func_args.get("options") or [])
                        await self._set_state(task_id, AgentState.WAITING_HITL)
                        answer = await hitl_manager.ask(question=question, options=options, task_id=task_id, user_id=user_id)
                        res = {"success": True, "answer": answer or "", "question": question}
                        step_result = {"result": res, "success": True, "actionName": func_name}
                    else:
                        await self._set_state(task_id, AgentState.ACTING)
                        step_result = await self._execute_tool(func_name, func_args, task_id)
                        if func_name not in OBSERVATION_TOOLS:
                            actions += 1

                    steps.append(step_result)
                    tool_response_parts.append(types.Part.from_function_response(
                        name=func_name,
                        response={"result": step_result.get("result")},
                    ))

                if tool_response_parts:
                    contents.append(types.Content(role="tool", parts=tool_response_parts))

            return self._finish(task_id, True, "Completed all planned steps.", steps, AgentState.COMPLETED, user_id)

        except Exception as e:
            logger.exception(f"Executor error on task {task_id}: {e}")
            return self._finish(task_id, False, f"Error during execution: {e}", steps, AgentState.FAILED, user_id)

    async def _execute_tool(self, tool_name: str, args: Dict[str, Any], task_id: str) -> Dict[str, Any]:
        started_ms = int(time.time() * 1000)
        try:
            res = await electron_bridge.execute_tool(tool_name, args, task_id=task_id)
            duration_ms = int(time.time() * 1000) - started_ms
            success = bool(res.get("success", True)) if isinstance(res, dict) else True
            try:
                sqlite_store.save_action(task_id, tool_name, args, res, success, duration_ms, started_ms)
            except Exception as le:
                logger.warning(f"Could not persist action log: {le}")
            return {"actionName": tool_name, "args": args, "result": res, "success": success, "durationMs": duration_ms}
        except Exception as e:
            duration_ms = int(time.time() * 1000) - started_ms
            err_dict = {"success": False, "error": str(e)}
            try:
                sqlite_store.save_action(task_id, tool_name, args, err_dict, False, duration_ms, started_ms)
            except Exception as le:
                logger.warning(f"Could not persist action error log: {le}")
            return {"actionName": tool_name, "args": args, "result": err_dict, "success": False, "durationMs": duration_ms}

    async def _set_state(self, task_id: str, state: AgentState) -> None:
        await event_bus.publish(EventType.STATE_CHANGE, {"taskId": task_id, "state": state.value})

    async def _speak(self, task_id: str, text: str) -> None:
        await event_bus.publish(EventType.TTS_SPEAK, {"taskId": task_id, "text": text})

    async def _screenshot(self, task_id: str) -> Optional[str]:
        try:
            res = await electron_bridge.execute_tool("take_screenshot", {}, task_id=task_id)
            return res.get("base64") if isinstance(res, dict) else None
        except Exception:
            return None

    def _finish(self, task_id: str, success: bool, message: str, steps: List[Dict[str, Any]], state: AgentState, user_id: str) -> Dict[str, Any]:
        sqlite_store.update_agent_session_status(task_id, "COMPLETED" if success else "FAILED", state.value)
        memory_manager.add_turn(user_id, "AGENT", message)
        event_type = EventType.TASK_COMPLETED if success else EventType.TASK_FAILED
        asyncio.create_task(event_bus.publish(event_type, {"taskId": task_id, "success": success, "result": message}))
        return {
            "success": success,
            "message": message,
            "taskId": task_id,
            "steps": steps,
        }


def json_str(obj: Any) -> str:
    import json
    return json.dumps(obj)


main_executor_agent = MainExecutorAgent()


class MainExecutorAdkAgent(BaseAgent):
    """ADK wrapper around the desktop executor."""

    def __init__(self, **kwargs) -> None:
        super().__init__(
            name="main_executor",
            description="Executes Windows desktop automation tasks end to end (opening apps, clicking UI elements, typing, browser actions).",
            **kwargs,
        )

    async def _run_async_impl(self, ctx: InvocationContext) -> AsyncGenerator[Event, None]:
        text_parts = []
        audio_b64 = None
        image_b64 = None
        mime_type = "audio/wav"

        if ctx.user_content and ctx.user_content.parts:
            for p in ctx.user_content.parts:
                if p.text:
                    text_parts.append(p.text)
                elif p.inline_data:
                    m = p.inline_data.mime_type or ""
                    if "audio" in m and p.inline_data.data:
                        audio_b64 = base64.b64encode(p.inline_data.data).decode("utf-8")
                        mime_type = p.inline_data.mime_type or "audio/wav"
                    elif "image" in m and p.inline_data.data:
                        image_b64 = base64.b64encode(p.inline_data.data).decode("utf-8")

        prompt = "\n".join(text_parts).strip() or "Execute the requested desktop action."
        user_id = ctx.user_id or "default"
        task_id = str(ctx.session.state.get("task_id", "")) or f"adk-{ctx.invocation_id[:8]}"

        result = await main_executor_agent.execute_prompt(
            prompt=prompt,
            audio_base64=audio_b64,
            image_base64=image_b64,
            mime_type=mime_type,
            task_id=task_id,
            user_id=user_id,
        )

        text = str(result.get("message") or "Task complete.")
        ctx.set_agent_state(self.name, end_of_agent=True)
        yield Event(
            invocation_id=ctx.invocation_id,
            author=self.name,
            branch=ctx.branch,
            content=types.Content(
                role="model",
                parts=[types.Part.from_text(text=text)],
            ),
        )


main_executor_adk_agent = MainExecutorAdkAgent()
