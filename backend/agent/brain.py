import asyncio
import json
import logging
import time
import uuid
from typing import Any, Dict, List, Optional
from google.genai import types
from backend.config import config
from backend.core.client import get_genai_client
from backend.tools.definitions import get_desktop_tools
from backend.bridge.electron_bridge import electron_bridge
from backend.memory.memory_manager import memory_manager
from backend.storage.sqlite_store import sqlite_store

logger = logging.getLogger("hey_jave.brain")

SYSTEM_INSTRUCTION = """You are Hey Jave, a high-performance Windows Desktop Automation AI Agent and concise desktop assistant.

When the user asks for desktop actions (opening apps, clicking, typing, navigating, organizing windows):
Execute the task step-by-step using your provided automation tools.

3-Step Execution Strategy & Hierarchy:
1. Low-Level / Spatial: Move mouse ('mouse_move'), click ('mouse_click'), type ('keyboard_type'), key press ('keyboard_key').
2. UI Automation: Query windows ('get_open_windows') for coordinates and titles, then use 'uia_click' / 'uia_type'.
3. Vision Fallback: Take screenshot ('take_screenshot') to inspect the screen when needed.

Browser Navigation Rules:
- To navigate to a website in a browser: use 'focus_window', press hotkey CTRL+L to select the address bar, then 'keyboard_type' the URL, then 'keyboard_key' ENTER.

Special Tools:
- 'ask_human'      -> Pause and ask the user a clarifying question before continuing.
- 'highlight_box'  -> Draw a colored step-guide box on screen (user performs manual action).
- 'show_screenpad' -> Show a command, code snippet, or markdown in the ScreenPad overlay.
- 'wait_seconds'   -> Sleep N seconds then continue.

Conversational & General Questions:
- If the user asks a general question, greeting, or conversational query, answer directly and concisely (1-2 sentences unless more is requested). Never use emojis. Speak plainly.

Summary:
- When a desktop task is finished, provide a brief, clear confirmation of what was done."""

class AgentBrain:
    """
    Hey Jave Agent Brain:
    Orchestrates multi-turn planning, tool calling, execution loop,
    memory storage, and live event streaming to the frontend.
    """

    def __init__(self, default_model: Optional[str] = None):
        self.default_model = default_model or config.DEFAULT_MODEL
        self._active_tasks: Dict[str, bool] = {}

    def stop_task(self, task_id: str):
        """Signals an active task to stop."""
        self._active_tasks[task_id] = False
        logger.info(f"Task {task_id} stop requested.")

    async def execute_prompt(
        self,
        prompt: str,
        task_id: Optional[str] = None,
        user_id: str = "default",
        model: Optional[str] = None,
        api_key: Optional[str] = None,
        max_iterations: int = 15
    ) -> Dict[str, Any]:
        """
        Executes a user prompt through the Gemini model and tool-calling execution loop.
        """
        task_id = task_id or f"task-{uuid.uuid4().hex[:8]}"
        self._active_tasks[task_id] = True
        model_name = model or self.default_model

        logger.info(f"[AgentBrain] Starting task {task_id} with model '{model_name}': {prompt}")
        await electron_bridge.broadcast({"type": "TASK_START", "taskId": task_id, "prompt": prompt})

        client = get_genai_client(api_key=api_key)
        tools = get_desktop_tools()

        # Build context from long/short memory
        memory_context = memory_manager.format_context_prompt(user_id)
        effective_system_instruction = SYSTEM_INSTRUCTION
        if memory_context:
            effective_system_instruction += f"\n\nContext & Preferences:\n{memory_context}"

        contents: List[Any] = [
            types.Content(role="user", parts=[types.Part.from_text(text=prompt)])
        ]

        steps: List[Dict[str, Any]] = []
        iteration = 0
        final_text = ""

        try:
            while iteration < max_iterations:
                if not self._active_tasks.get(task_id, True):
                    logger.info(f"Task {task_id} was stopped by user.")
                    final_text = "Task was stopped by user."
                    break

                iteration += 1
                logger.info(f"[AgentBrain] Loop turn {iteration} for task {task_id}")

                def _call_model():
                    return client.models.generate_content(
                        model=model_name,
                        contents=contents,
                        config=types.GenerateContentConfig(
                            system_instruction=effective_system_instruction,
                            tools=tools,
                            temperature=0.2,
                        )
                    )

                response = await asyncio.to_thread(_call_model)

                # Check for function calls in model response candidates
                candidate = response.candidates[0] if response.candidates else None
                if not candidate or not candidate.content:
                    final_text = response.text or "Completed."
                    break

                contents.append(candidate.content)

                # Extract function calls
                function_calls = [
                    part.function_call for part in candidate.content.parts
                    if part.function_call is not None
                ]

                # If no function calls, we reached the final answer!
                if not function_calls:
                    final_text = response.text or "Done."
                    break

                # Execute all function calls requested in this turn
                response_parts: List[types.Part] = []

                for fc in function_calls:
                    func_name = fc.name
                    func_args = dict(fc.args) if fc.args else {}
                    step_id = f"step-{len(steps) + 1}-{uuid.uuid4().hex[:4]}"

                    step_info: Dict[str, Any] = {
                        "id": step_id,
                        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                        "thought": f"Executing {func_name}...",
                        "actionName": func_name,
                        "parameters": func_args,
                        "success": False
                    }

                    # Broadcast live step update to UI
                    await electron_bridge.broadcast({
                        "type": "AGENT_STEP_UPDATE",
                        "taskId": task_id,
                        "step": step_info
                    })

                    # Execute tool via bridge
                    tool_result = await electron_bridge.execute_tool(func_name, func_args, task_id=task_id)

                    # Check for screenshot or images in result
                    screenshot_url = None
                    if isinstance(tool_result, dict):
                        step_info["success"] = tool_result.get("success", True)
                        if "base64" in tool_result and tool_result["base64"]:
                            screenshot_url = f"data:image/png;base64,{tool_result['base64']}"
                            step_info["screenshotUrl"] = screenshot_url
                    else:
                        step_info["success"] = True

                    step_info["result"] = tool_result
                    steps.append(step_info)

                    # Update step in UI
                    await electron_bridge.broadcast({
                        "type": "AGENT_STEP_UPDATE",
                        "taskId": task_id,
                        "step": step_info
                    })

                    # Add function response part
                    resp_dict = {"result": tool_result}
                    response_parts.append(
                        types.Part.from_function_response(
                            name=func_name,
                            response=resp_dict
                        )
                    )

                contents.append(types.Content(role="tool", parts=response_parts))

            # Store turn in short-term memory
            memory_manager.add_turn(user_id, "USER", prompt)
            memory_manager.add_turn(user_id, "AGENT", final_text or "Task completed.")

            return {
                "success": True,
                "message": final_text or "Task completed successfully.",
                "steps": steps,
                "taskId": task_id
            }

        except Exception as e:
            logger.exception(f"Error in AgentBrain execution for task {task_id}: {e}")
            err_msg = str(e)
            return {
                "success": False,
                "message": f"Error: {err_msg}",
                "error": err_msg,
                "steps": steps,
                "taskId": task_id
            }
        finally:
            self._active_tasks.pop(task_id, None)

agent_brain = AgentBrain()
