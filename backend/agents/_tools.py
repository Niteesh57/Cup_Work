from __future__ import annotations

import base64
from typing import Any, List, Optional

from google.adk.tools import ToolContext
from google.genai import types

from backend.bridge.electron_bridge import electron_bridge
from backend.agents.hitl_manager import hitl_manager


def _tool_ids(tool_context: Optional[ToolContext]) -> tuple[str, str]:
    """Extracts task/user ids available to a desktop-facing tool."""
    if tool_context is None:
        return "", "default"
    return str(tool_context.state.get("task_id", "")), tool_context.user_id


async def show_screenpad_tool(
    title: str,
    content: str,
    content_type: str = "markdown",
    message: str = "",
    tool_context: ToolContext = None,
) -> dict[str, Any]:
    """Displays content in the on-screen Windows Scratchpad overlay for the user to copy or review."""
    task_id, _ = _tool_ids(tool_context)
    return await electron_bridge.execute_tool(
        "show_screenpad",
        {"title": title, "content": content, "type": content_type, "message": message},
        task_id=task_id,
    )


async def show_annotations_tool(
    boxes: List[dict[str, Any]],
    arrows: Optional[List[dict[str, Any]]] = None,
    duration_seconds: float = 0.0,
    tool_context: ToolContext = None,
) -> dict[str, Any]:
    """Draws colored boxes, arrows, and labels directly on screen for visual guidance."""
    task_id, _ = _tool_ids(tool_context)
    return await electron_bridge.execute_tool(
        "show_annotations",
        {"boxes": boxes, "arrows": arrows or [], "durationSeconds": duration_seconds},
        task_id=task_id,
    )


async def uia_get_interactive_elements_tool(
    window_title: Optional[str] = None,
    max_elements: int = 40,
    tool_context: ToolContext = None,
) -> dict[str, Any]:
    """Retrieves interactive UI controls on screen with pre-computed bounding boxes."""
    task_id, _ = _tool_ids(tool_context)
    return await electron_bridge.execute_tool(
        "uia_get_interactive_elements",
        {"windowTitle": window_title, "maxElements": max_elements},
        task_id=task_id,
    )


async def uia_search_elements_tool(
    query: str,
    window_title: Optional[str] = None,
    tool_context: ToolContext = None,
) -> dict[str, Any]:
    """Searches UI elements by text, name, class, or AutomationId."""
    task_id, _ = _tool_ids(tool_context)
    return await electron_bridge.execute_tool(
        "uia_search_elements",
        {"query": query, "windowTitle": window_title},
        task_id=task_id,
    )


async def ask_human_tool(
    question: str,
    options: Optional[List[str]] = None,
    tool_context: ToolContext = None,
) -> dict[str, Any]:
    """Prompts the user with a question and selectable options via the on-screen Windows Scratchpad overlay."""
    task_id, user_id = _tool_ids(tool_context)
    try:
        res = await electron_bridge.execute_tool(
            "ask_human",
            {"question": question, "options": options or []},
            task_id=task_id,
        )
        if isinstance(res, dict):
            if "answer" in res and res["answer"]:
                return {"answer": str(res["answer"])}
            if isinstance(res.get("result"), dict) and res["result"].get("answer"):
                return {"answer": str(res["result"]["answer"])}
    except Exception:
        pass

    # Fallback to hitl_manager if bridge direct call fails
    answer = await hitl_manager.ask(
        question=question,
        options=options or [],
        task_id=task_id,
        user_id=user_id,
    )
    return {"answer": answer or ""}
