from __future__ import annotations

import asyncio
import base64
import logging
import time
import uuid
from enum import Enum
from typing import Any, Dict, List, Optional

from google.genai import types

from backend.config import config
from backend.core.client import get_genai_client
from backend.tools.definitions import get_desktop_tools
from backend.bridge.electron_bridge import electron_bridge
from backend.agent.goal_verifier import goal_verifier, VerificationResult
from backend.agent.hitl_manager import hitl_manager
from backend.events.event_bus import EventType, event_bus
from backend.memory.memory_manager import memory_manager
from backend.storage.sqlite_store import sqlite_store

logger = logging.getLogger("hey_jave.executor")


class AgentState(str, Enum):
    OBSERVING = "observing"
    ANALYZING = "analyzing"
    PLANNING = "planning"
    SAFETY_CHECK = "safety_check"
    WAITING_HITL = "waiting_hitl"
    PAUSED = "paused"
    ACTING = "acting"
    VERIFYING = "verifying"
    COMPLETED = "completed"
    FAILED = "failed"


EXECUTOR_SYSTEM_INSTRUCTION = """You are Hey Jave's Main Executor, a careful Windows desktop automation agent.

Work through the user's goal using this loop:
1. Observe the current screen/windows when needed.
2. Analyze what you see.
3. Plan the next concrete action.
4. Perform a safety check before risky actions.
5. Execute exactly one desktop tool call.
6. Verify whether the goal is now achieved.

Rules:
- Prefer the least invasive action that achieves the goal.
- Use spatial actions first, then UI Automation, then vision.
- Never execute a shell command or kill a process without user confirmation.
- When something is ambiguous, pause and ask the user a single question.
- Provide a short final confirmation when the goal is complete."""


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
        self.resume_requested.set()
        self.pause_requested.clear()
        self.paused = False

    def request_cancel(self) -> None:
        self.cancel_requested.set()
        self.resume_requested.set()
        self.pause_requested.clear()

    async def wait_if_paused(self) -> bool:
        """Block until resumed. Returns False if cancelled while paused."""
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
        task = self._tasks.get(task_id)
        if task:
            task.request_pause()
            return True
        return False

    def resume(self, task_id: str) -> bool:
        task = self._tasks.get(task_id)
        if task:
            task.request_resume()
            return True
        return False

    def cancel(self, task_id: str) -> bool:
        task = self._tasks.get(task_id)
        if task:
            task.request_cancel()
            return True
        return False


executor_manager = ExecutorManager()


class MainExecutorAgent:
    """Imperative observe→analyze→plan→act→verify desktop agent.

    Kept as a plain class because the FastAPI server calls ``execute_prompt``
    directly. It must suspend for HITL, persist to SQLite, and re-observe after
    every action — behavior that a plain generate/tool loop does not provide.
    """

    def __init__(
        self,
        model: Optional[str] = None,
        max_actions: int = 15,
        max_llm_calls: int = 60,
    ) -> None:
        self._model_name = model or config.DEFAULT_MODEL
        self._max_actions = max_actions
        self._max_llm_calls = max_llm_calls

    # ── Direct execution path ──────────────────────────────────────────────
    async def execute_prompt(
        self,
        prompt: str,
        task_id: Optional[str] = None,
        user_id: str = "default",
        model: Optional[str] = None,
    ) -> Dict[str, Any]:
        task_id = task_id or f"task-{uuid.uuid4().hex[:8]}"
        model_name = model or self._model_name
        control = executor_manager.get_or_create(task_id)
        steps: List[Dict[str, Any]] = []
        llm_calls = 0
        actions = 0

        started_ms = int(time.time() * 1000)
        sqlite_store.save_agent_session(task_id, prompt, "RUNNING", AgentState.OBSERVING.value, timestamp_ms=started_ms)

        await event_bus.publish(EventType.AGENT_STARTED, {"taskId": task_id, "prompt": prompt})
        await electron_bridge.broadcast({"type": "TASK_START", "taskId": task_id, "prompt": prompt})

        try:
            contents: List[types.Content] = [
                types.Content(role="user", parts=[types.Part.from_text(text=prompt)])
            ]
            memory_manager.add_turn(user_id, "USER", prompt)
            memory_context = memory_manager.format_context_prompt(user_id)
            system_instruction = EXECUTOR_SYSTEM_INSTRUCTION
            if memory_context:
                system_instruction += f"\n\nContext & Preferences:\n{memory_context}"

            client = get_genai_client()
            tools = get_desktop_tools()

            while actions < self._max_actions and llm_calls < self._max_llm_calls:
                if control.cancel_requested.is_set():
                    await event_bus.publish(EventType.TASK_FAILED, {"taskId": task_id, "reason": "cancelled"})
                    return self._finish(task_id, False, "Task cancelled by user.", steps, AgentState.FAILED, user_id)

                if not await control.wait_if_paused():
                    await event_bus.publish(EventType.TASK_FAILED, {"taskId": task_id, "reason": "cancelled"})
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
                    final_text = response.text or "Task complete."
                    await event_bus.publish(EventType.TASK_COMPLETED, {"taskId": task_id, "result": final_text})
                    return self._finish(task_id, True, final_text, steps, AgentState.COMPLETED, user_id)

                contents.append(candidate.content)
                function_calls = [
                    p.function_call for p in candidate.content.parts if p.function_call is not None
                ]

                if not function_calls:
                    # No tool call: verify actual screen state before declaring success.
                    await self._set_state(task_id, AgentState.VERIFYING)
                    await event_bus.publish(EventType.OBSERVING_SCREEN, {"taskId": task_id})
                    screenshot = await self._screenshot(task_id)
                    verdict = await goal_verifier.check(prompt, screenshot) if screenshot else VerificationResult(True, 1.0, "")
                    await event_bus.publish(EventType.GOAL_VERIFIED, {
                        "taskId": task_id,
                        "achieved": verdict.achieved,
                        "confidence": verdict.confidence,
                        "missing": verdict.missing,
                    })
                    if verdict.passed:
                        final_text = response.text or "Task complete."
                        await event_bus.publish(EventType.TASK_COMPLETED, {"taskId": task_id, "result": final_text})
                        return self._finish(task_id, True, final_text, steps, AgentState.COMPLETED, user_id)

                    # Goal not achieved; feed verification back and continue.
                    contents.append(types.Content(
                        role="user",
                        parts=[types.Part.from_text(text=(
                            f"Goal verification failed: {verdict.missing or 'goal not yet achieved'}. "
                            "Observe again and continue."
                        ))],
                    ))
                    continue

                # Execute every requested function call (usually one).
                response_parts: List[types.Part] = []
                observation_parts: List[types.Part] = []
                for fc in function_calls:
                    if actions >= self._max_actions:
                        break
                    if control.cancel_requested.is_set():
                        break

                    if not await self._safety_gate(fc.name, dict(fc.args) if fc.args else {}, task_id, user_id):
                        resp = {"result": {"success": False, "message": "Action denied by user"}}
                        response_parts.append(types.Part.from_function_response(name=fc.name, response=resp))
                        continue

                    actions += 1
                    step = await self._execute_tool_call(fc, task_id)
                    steps.append(step)

                    response_parts.append(types.Part.from_function_response(
                        name=fc.name,
                        response={"result": step.get("result")},
                    ))

                    # Re-observe after every action: capture the screen and feed
                    # it back to the model so the next planning turn sees reality.
                    await self._set_state(task_id, AgentState.VERIFYING)
                    await event_bus.publish(EventType.OBSERVING_SCREEN, {"taskId": task_id})
                    screenshot_b64 = await self._screenshot_for_action(task_id, fc.name, dict(fc.args) if fc.args else {})
                    if screenshot_b64:
                        observation_parts.append(
                            types.Part.from_bytes(
                                data=base64.b64decode(screenshot_b64),
                                mime_type="image/png",
                            )
                        )

                if response_parts:
                    contents.append(types.Content(role="tool", parts=response_parts))
                if observation_parts:
                    contents.append(types.Content(
                        role="user",
                        parts=[types.Part.from_text(text="Screen observation after action:")] + observation_parts,
                    ))

            final_text = "Reached action limit before completing the goal."
            await event_bus.publish(EventType.TASK_FAILED, {"taskId": task_id, "reason": final_text})
            return self._finish(task_id, False, final_text, steps, AgentState.FAILED, user_id)

        except Exception as e:
            logger.exception(f"Executor error for task {task_id}: {e}")
            await event_bus.publish(EventType.TASK_FAILED, {"taskId": task_id, "reason": str(e)})
            return self._finish(task_id, False, f"Error: {e}", steps, AgentState.FAILED, user_id)
        finally:
            executor_manager.remove(task_id)

    # ── Helpers ────────────────────────────────────────────────────────────
    async def _execute_tool_call(self, fc: Any, task_id: str) -> Dict[str, Any]:
        func_name = fc.name
        func_args = dict(fc.args) if fc.args else {}
        step_id = f"step-{uuid.uuid4().hex[:6]}"

        step: Dict[str, Any] = {
            "id": step_id,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "thought": f"Executing {func_name}",
            "actionName": func_name,
            "parameters": func_args,
            "success": False,
        }

        await self._set_state(task_id, AgentState.ACTING)
        await event_bus.publish(EventType.TOOL_EXECUTING, {"taskId": task_id, "tool": func_name, "step": step})
        await electron_bridge.broadcast({"type": "AGENT_STEP_UPDATE", "taskId": task_id, "step": step})

        result = await electron_bridge.execute_tool(func_name, func_args, task_id=task_id)

        if isinstance(result, dict):
            step["success"] = result.get("success", True)
            if result.get("base64"):
                step["screenshotUrl"] = f"data:image/png;base64,{result['base64']}"
        else:
            step["success"] = True
        step["result"] = result

        await event_bus.publish(EventType.TOOL_COMPLETED, {"taskId": task_id, "tool": func_name, "result": result})
        await electron_bridge.broadcast({"type": "AGENT_STEP_UPDATE", "taskId": task_id, "step": step})
        return step

    async def _screenshot(self, task_id: str) -> str:
        result = await electron_bridge.execute_tool("take_screenshot", {}, task_id=task_id)
        return str(result.get("base64", "")) if isinstance(result, dict) else ""

    async def _screenshot_for_action(self, task_id: str, tool: str, args: Dict[str, Any]) -> str:
        """Captures the cheapest useful region after an action.

        Prefers ``screenshot_region`` when the action carries coordinates, then
        the active window bounds, and finally a full screenshot.
        """
        if tool in ("mouse_click", "mouse_move", "drag_drop"):
            x = args.get("x", args.get("x1"))
            y = args.get("y", args.get("y1"))
            if isinstance(x, (int, float)) and isinstance(y, (int, float)):
                res = await electron_bridge.execute_tool(
                    "screenshot_region",
                    {"x": max(0, int(x) - 200), "y": max(0, int(y) - 200), "width": 400, "height": 400},
                    task_id=task_id,
                )
                if isinstance(res, dict) and res.get("base64"):
                    return str(res["base64"])

        try:
            window = await electron_bridge.execute_tool("get_active_window", {}, task_id=task_id)
            bounds = window.get("bounds") if isinstance(window, dict) else None
            if isinstance(bounds, dict) and all(k in bounds for k in ("x", "y", "width", "height")):
                res = await electron_bridge.execute_tool(
                    "screenshot_region",
                    {
                        "x": max(0, int(bounds["x"])),
                        "y": max(0, int(bounds["y"])),
                        "width": max(1, int(bounds["width"])),
                        "height": max(1, int(bounds["height"])),
                    },
                    task_id=task_id,
                )
                if isinstance(res, dict) and res.get("base64"):
                    return str(res["base64"])
        except Exception:
            pass

        return await self._screenshot(task_id)

    async def _safety_gate(self, tool: str, args: Dict[str, Any], task_id: str, user_id: str) -> bool:
        if tool == "kill_process":
            await self._set_state(task_id, AgentState.SAFETY_CHECK)
            answer = await hitl_manager.ask(
                question="May I terminate this process?",
                options=["Yes", "No"],
                task_id=task_id,
                user_id=user_id,
            )
            return answer.strip().lower() in ("yes", "y", "approve", "ok")

        if tool == "execute_command":
            command = str(args.get("command", "")).strip().lower()
            allowlist_prefixes = ("where", "echo", "dir", "tasklist", "ipconfig", "ver")
            if command and not command.startswith(allowlist_prefixes):
                await self._set_state(task_id, AgentState.SAFETY_CHECK)
                answer = await hitl_manager.ask(
                    question=f"May I run this command? {command}",
                    options=["Yes", "No"],
                    task_id=task_id,
                    user_id=user_id,
                )
                return answer.strip().lower() in ("yes", "y", "approve", "ok")

        return True

    async def _set_state(self, task_id: str, state: AgentState) -> None:
        now = int(time.time() * 1000)
        sqlite_store.update_agent_session_status(task_id, "RUNNING", state.value, now)
        await event_bus.publish(EventType.STATE_CHANGE, {"taskId": task_id, "state": state.value})

    def _finish(self, task_id: str, success: bool, message: str, steps: List[Dict[str, Any]], final_state: AgentState, user_id: str = "default") -> Dict[str, Any]:
        memory_manager.add_turn(user_id, "AGENT", message)
        sqlite_store.update_agent_session_status(task_id, final_state.value, final_state.value, int(time.time() * 1000))
        return {"success": success, "message": message, "steps": steps, "taskId": task_id}


main_executor_agent = MainExecutorAgent()
