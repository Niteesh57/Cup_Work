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


EXECUTOR_SYSTEM_INSTRUCTION = """You are Hey Jave's Main Executor, an ultra-precise Windows desktop automation agent.

Work through the user's goal using this loop:
1. Analyze what you know and the latest screen observation and UI elements tree.
2. Announce your plan in one short spoken sentence.
3. Execute desktop tool calls. You can call independent read-only tools in parallel; keep clicks, typing, and other mutations ordered.
4. Verify whether the goal is now achieved.

Observation & Low-Level Component Grounding rules:
- At the start of a task, the system gives you:
  1. A screenshot of the desktop.
  2. The list of open top-level windows.
  3. The Windows UI Automation (UIA) tree of interactive elements with exact bounding rectangles [x, y, width, height], center coordinates (centerX, centerY), and pre-calculated box_2d: [ymin, xmin, ymax, xmax].
- NEVER attempt blind mouse clicking by guessing pixel coordinates.
- All UI button clicks, field inputs, dropdowns, tabs, and selections MUST be performed via:
  1. `smart_ui_action`: High-precision action that validates the target across Windows UIA and Chrome DOM before acting.
  2. Native UIA pattern methods: `uia_invoke` (for buttons/menuitems), `uia_set_value` (for text inputs), `uia_select` (for tabs/lists), `uia_toggle` (for checkboxes).
  3. Browser DOM tools: `browser_click`, `browser_type`, `browser_search` (for web pages in Chrome/Edge).
  4. `resolve_element` when you need to inspect element candidates or confidence before acting.
- `mouse_click` is restricted to non-accessible canvas/game surfaces where no UIA node or DOM element exists.
- When the user asks to highlight, draw boxes, or suggest moves (e.g. Chess or games):
  - Call `show_annotations` with exact boxes and arrows using the pre-calculated box_2d or exact element bounds from `uia_search_elements` / `uia_get_interactive_elements`.
- Parallel Tool Calling:
  - Execute read/search tools concurrently in one turn. Keep UI mutations sequential, except that `smart_ui_action` internally runs its own local read probes in parallel before the action.

HITL & Interaction rules:
- Before your first action, speak one short sentence announcing it (e.g., "I'll open the search window and locate the button."). This is read aloud to the user.
- If a suitable browser or application is already open or visible in the taskbar, do NOT launch a new one. Reuse it.
- Use `ask_human` for security-sensitive choices, user preferences, or genuine ambiguity.
- When the goal is completed, reply with a short confirmation message and stop calling tools."""

# Read-only calls the model may use to observe state. They do not mutate the
# desktop, so they should not exhaust the task's mutation action budget.
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
        if not task:
            for tid, t in self._tasks.items():
                if tid.startswith(task_id) or task_id.startswith(tid) or "adk" in tid:
                    task = t
                    break
        if task:
            task.request_pause()
            return True
        return False

    def resume(self, task_id: str) -> bool:
        task = self._tasks.get(task_id)
        if not task:
            for tid, t in self._tasks.items():
                if tid.startswith(task_id) or task_id.startswith(tid) or "adk" in tid:
                    task = t
                    break
        if task:
            task.request_resume()
            return True
        return False

    def cancel(self, task_id: str) -> bool:
        task = self._tasks.get(task_id)
        if not task:
            for tid, t in self._tasks.items():
                if tid.startswith(task_id) or task_id.startswith(tid) or "adk" in tid:
                    task = t
                    break
        if task:
            task.request_cancel()
            return True
        return False


executor_manager = ExecutorManager()


class MainExecutorAgent:
    """Core autonomous desktop agent executor driving the perception-action-verification loop."""

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
        sqlite_store.save_agent_session(task_id, prompt or "[Spoken Voice Command]", "RUNNING", AgentState.OBSERVING.value, timestamp_ms=started_ms)

        await event_bus.publish(EventType.AGENT_STARTED, {"taskId": task_id, "prompt": prompt})
        await electron_bridge.broadcast({"type": "TASK_START", "taskId": task_id, "prompt": prompt})

        try:
            # ── Initial observation: screenshot + windows + interactive UI elements tree in parallel
            await self._set_state(task_id, AgentState.OBSERVING)
            await event_bus.publish(EventType.OBSERVING_SCREEN, {"taskId": task_id})

            initial_tasks = []
            if not image_base64:
                initial_tasks.append(electron_bridge.execute_tool("take_screenshot", {}, task_id=task_id))
            else:
                initial_tasks.append(asyncio.sleep(0))

            initial_tasks.append(electron_bridge.execute_tool("get_open_windows", {}, task_id=task_id))
            initial_tasks.append(electron_bridge.execute_tool("uia_get_interactive_elements", {"maxElements": 45}, task_id=task_id))

            init_results = await asyncio.gather(*initial_tasks, return_exceptions=True)

            # 1. Process screenshot
            shot_res = init_results[0]
            if not image_base64 and isinstance(shot_res, dict) and shot_res.get("base64"):
                image_base64 = shot_res.get("base64")

            # 2. Process open windows
            initial_windows: List[str] = []
            win_res = init_results[1]
            if isinstance(win_res, dict) and win_res.get("windows"):
                initial_windows = [
                    str(w.get("title", "")).strip()
                    for w in win_res["windows"]
                    if str(w.get("title", "")).strip()
                ]

            # 3. Process interactive UI tree elements with exact bounds & center coordinates
            interactive_elements_text = ""
            uia_res = init_results[2]
            if isinstance(uia_res, dict) and uia_res.get("elements"):
                elems = uia_res.get("elements", [])
                lines = ["Visible UI objects & interactive controls (with exact pixel coordinates & bounds):"]
                for el in elems[:35]:
                    name = str(el.get("name", "")).strip()
                    ctype = str(el.get("controlType", "")).strip()
                    auto_id = str(el.get("automationId", "")).strip()
                    b = el.get("bounds", {})
                    cx, cy = b.get("centerX", 0), b.get("centerY", 0)
                    x, y, w, h = b.get("x", 0), b.get("y", 0), b.get("width", 0), b.get("height", 0)
                    id_str = f" | ID='{auto_id}'" if auto_id else ""
                    name_str = f" '{name}'" if name else ""
                    lines.append(f"- [{ctype}]{name_str}{id_str} -> Center: ({cx}, {cy}) | Bounds: [x={x}, y={y}, w={w}, h={h}]")
                if len(lines) > 1:
                    interactive_elements_text = "\n".join(lines)

            contents: List[types.Content] = []
            obs_parts: List[types.Part] = []

            # Attach current screen image by default
            if image_base64:
                try:
                    image_bytes = base64.b64decode(image_base64)
                    obs_parts.append(types.Part.from_bytes(data=image_bytes, mime_type="image/png"))
                except Exception as e:
                    logger.error(f"Failed to decode initial image in executor: {e}")

            # Attach spoken voice audio if provided
            if audio_base64:
                try:
                    audio_bytes = base64.b64decode(audio_base64)
                    obs_parts.append(types.Part.from_bytes(data=audio_bytes, mime_type=mime_type or "audio/wav"))
                except Exception as e:
                    logger.error(f"Failed to decode audio in executor: {e}")

            if initial_windows:
                obs_parts.append(types.Part.from_text(text=(
                    "Open windows right now:\n" + "\n".join(f"- {t}" for t in initial_windows[:15])
                )))

            if interactive_elements_text:
                obs_parts.append(types.Part.from_text(text=interactive_elements_text))

            obs_parts.append(types.Part.from_text(text=(
                f"Task: {prompt}\n\n"
                "The current screen screenshot and Windows UI Automation element tree are attached above. "
                "Use the exact coordinates from the UI tree for clicking, moving the mouse, or drawing boxes/highlights. "
                "Start by stating in ONE short sentence what you will do first, then execute the step."
            )))
            contents.append(types.Content(role="user", parts=obs_parts))

            memory_manager.add_turn(user_id, "USER", prompt or "[Spoken Voice Command]")
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
                    final_text = "Task complete."
                    await event_bus.publish(EventType.TASK_COMPLETED, {"taskId": task_id, "result": final_text})
                    return self._finish(task_id, True, final_text, steps, AgentState.COMPLETED, user_id)

                contents.append(candidate.content)
                function_calls = [
                    p.function_call for p in candidate.content.parts if p.function_call is not None
                ]

                # Speak the model's narrative line when it accompanies an action
                narrative = "\n".join(p.text for p in candidate.content.parts if p.text).strip()
                if narrative and function_calls:
                    await self._speak_sync(task_id, narrative)

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
                        final_text = narrative or "Task complete."
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

                # Execute requested function calls with parallel tool execution
                response_parts: List[types.Part] = []
                observation_parts: List[types.Part] = []

                async def _exec_single_call(fc_item: Any) -> tuple[Any, Dict[str, Any], bool]:
                    func_name = fc_item.name
                    func_args = dict(fc_item.args) if fc_item.args else {}
                    is_obs = func_name in OBSERVATION_TOOLS

                    if func_name == "ask_human":
                        question = str(func_args.get("question", "Can I continue?"))
                        options = list(func_args.get("options") or [])
                        await self._set_state(task_id, AgentState.WAITING_HITL)
                        answer = await hitl_manager.ask(
                            question=question,
                            options=options,
                            task_id=task_id,
                            user_id=user_id,
                        )
                        res = {"success": bool(answer), "answer": answer or "", "question": question}
                        return fc_item, {"result": res, "success": True, "actionName": func_name}, is_obs

                    if not await self._safety_gate(func_name, func_args, task_id, user_id):
                        res = {"success": False, "message": "Action denied by user"}
                        return fc_item, {"result": res, "success": False, "actionName": func_name}, is_obs

                    step_res = await self._execute_tool_call(fc_item, task_id)
                    return fc_item, step_res, is_obs

                # Join independent observations in parallel, but never race
                # desktop mutations. A click and a type launched concurrently
                # are inherently nondeterministic even if both tools succeed.
                # ``smart_ui_action`` keeps its own local probes parallel and
                # performs the chosen action only after that join completes.
                observation_calls = [fc for fc in function_calls if fc.name in OBSERVATION_TOOLS]
                mutation_calls = [fc for fc in function_calls if fc.name not in OBSERVATION_TOOLS]
                exec_results = []
                if observation_calls:
                    exec_results.extend(await asyncio.gather(*[_exec_single_call(fc) for fc in observation_calls]))
                for fc in mutation_calls:
                    exec_results.append(await _exec_single_call(fc))

                has_mutation = False
                last_mutation_fc = None

                for fc_item, step_result, is_obs in exec_results:
                    if not is_obs and fc_item.name != "ask_human":
                        actions += 1
                        has_mutation = True
                        last_mutation_fc = fc_item
                    steps.append(step_result)
                    response_parts.append(types.Part.from_function_response(
                        name=fc_item.name,
                        response={"result": step_result.get("result")},
                    ))

                # If a mutation action was executed, capture post-action observation
                if has_mutation and last_mutation_fc and not last_mutation_fc.name.startswith("browser_"):
                    await asyncio.sleep(0.4)
                    await self._set_state(task_id, AgentState.VERIFYING)
                    await event_bus.publish(EventType.OBSERVING_SCREEN, {"taskId": task_id})
                    screenshot_b64, region_origin = await self._screenshot_for_action(
                        task_id, last_mutation_fc.name, dict(last_mutation_fc.args) if last_mutation_fc.args else {}
                    )
                    if screenshot_b64:
                        observation_parts.append(
                            types.Part.from_bytes(
                                data=base64.b64decode(screenshot_b64),
                                mime_type="image/png",
                            )
                        )
                        if region_origin:
                            observation_parts.append(types.Part.from_text(text=(
                                f"NOTE: this screenshot shows only a region starting at "
                                f"absolute screen coordinates ({region_origin[0]}, {region_origin[1]}). "
                                "Any mouse_click(x, y) you make must use ABSOLUTE screen "
                                "coordinates (add the region origin to in-image pixels)."
                            )))

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
    async def _speak_sync(self, task_id: str, text: str) -> None:
        """Speaks text and blocks until the TTS finishes.

        Uses the Electron main-process SAPI bridge via the synchronous tool so
        the narrative finishes before the next action executes. Falls back to a
        fire-and-forget event if the bridge is unavailable or fails.
        """
        text = (text or "").strip()
        if not text:
            return
        try:
            res = await electron_bridge.execute_tool("speak_sync", {"text": text}, task_id=task_id)
            if isinstance(res, dict) and res.get("success") is False:
                await event_bus.publish(EventType.TTS_SPEAK, {"text": text})
        except Exception:
            await event_bus.publish(EventType.TTS_SPEAK, {"text": text})

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

    async def _screenshot_for_action(self, task_id: str, tool: str, args: Dict[str, Any]) -> tuple[str, Optional[tuple[int, int]]]:
        """Captures the cheapest useful region after an action.

        Returns ``(base64, region_origin)`` where region_origin is the absolute
        screen coordinate of the region's top-left corner (None for a full
        screenshot). The origin lets the model translate in-image pixel clicks
        to absolute screen coordinates.
        """
        if tool in ("mouse_click", "mouse_move", "drag_drop"):
            x = args.get("x", args.get("x1"))
            y = args.get("y", args.get("y1"))
            if isinstance(x, (int, float)) and isinstance(y, (int, float)):
                ox = max(0, int(x) - 200)
                oy = max(0, int(y) - 200)
                res = await electron_bridge.execute_tool(
                    "screenshot_region",
                    {"x": ox, "y": oy, "width": 400, "height": 400},
                    task_id=task_id,
                )
                if isinstance(res, dict) and res.get("base64"):
                    return str(res["base64"]), (ox, oy)

        try:
            window = await electron_bridge.execute_tool("get_active_window", {}, task_id=task_id)
            bounds = window.get("bounds") if isinstance(window, dict) else None
            if isinstance(bounds, dict) and all(k in bounds for k in ("x", "y", "width", "height")):
                ox = max(0, int(bounds["x"]))
                oy = max(0, int(bounds["y"]))
                res = await electron_bridge.execute_tool(
                    "screenshot_region",
                    {
                        "x": ox,
                        "y": oy,
                        "width": max(1, int(bounds["width"])),
                        "height": max(1, int(bounds["height"])),
                    },
                    task_id=task_id,
                )
                if isinstance(res, dict) and res.get("base64"):
                    return str(res["base64"]), (ox, oy)
        except Exception:
            pass

        return await self._screenshot(task_id), None

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
