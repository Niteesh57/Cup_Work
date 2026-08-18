from __future__ import annotations

from typing import Any, List, Optional

from google.adk.tools import ToolContext

from backend.bridge.electron_bridge import electron_bridge


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
    """Displays content in the on-screen ScreenPad for the user to copy or review."""
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
    """Draws colored boxes, arrows, and labels on screen for visual guidance."""
    task_id, _ = _tool_ids(tool_context)
    return await electron_bridge.execute_tool(
        "show_annotations",
        {"boxes": boxes, "arrows": arrows or [], "durationSeconds": duration_seconds},
        task_id=task_id,
    )


async def capture_screenshot_tool(tool_context: ToolContext = None) -> dict[str, Any]:
    """Captures the current screen so the agent can SEE the desktop (window,
    game board, page) before analyzing or drawing suggestions.

    Returns a ``google.genai.types.Part`` with inline image bytes, which ADK
    automatically converts into an image the model can see.
    """
    import base64 as _b64

    from google.genai import types as _types

    task_id, _ = _tool_ids(tool_context)
    result = await electron_bridge.execute_tool("take_screenshot", {}, task_id=task_id)
    b64 = result.get("base64") if isinstance(result, dict) else None
    if not b64:
        return {"success": False, "error": result.get("error", "screenshot failed")}
    try:
        image_bytes = _b64.b64decode(b64)
    except Exception as e:
        return {"success": False, "error": f"decode failed: {e}"}
    return {
        "success": True,
        "image": _types.Part.from_bytes(data=image_bytes, mime_type="image/png"),
    }
