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


async def draw_whiteboard_step_tool(
    concept_title: str,
    step_number: int,
    total_steps: int,
    step_label: str,
    elements: Optional[List[dict[str, Any]]] = None,
    connections: Optional[List[dict[str, Any]]] = None,
    notes: Optional[List[str] | str] = None,
    narration: Optional[str] = None,
    append_mode: bool = True,
    tool_context: ToolContext = None,
) -> dict[str, Any]:
    """Draws a progressive step on the on-screen animated sketch whiteboard (Option A).
    
    Args:
        concept_title: Name of the concept being explained (e.g. 'OAuth2 Authorization Code Flow').
        step_number: Current step number (e.g. 1, 2, 3).
        total_steps: Total number of planned steps (e.g. 5).
        step_label: Short title of this specific step.
        elements: List of SVG sketch nodes to draw (boxes, cylinders for databases, clouds, avatars).
                  Each element: {"id": "client", "label": "Client App", "sublabel": "React SPA", "type": "box"|"cylinder"|"cloud", "color": "cyan"|"emerald"|"amber"|"pink"|"purple", "x": 150, "y": 200, "width": 180, "height": 90}
        connections: List of animated curved connecting arrows between nodes.
                     Each connection: {"from": "client", "to": "auth_server", "label": "1. GET /authorize", "color": "cyan", "stepNumber": 1, "curvature": -30, "dashed": False}
        notes: Handwritten bullet points or annotations to render along the side or bottom.
        narration: Spoken explanation text to narrate out loud via TTS during this step.
        append_mode: If True, retains previously drawn steps on canvas and adds this step. If False, clears first.
    """
    task_id, _ = _tool_ids(tool_context)
    return await electron_bridge.execute_tool(
        "draw_whiteboard_step",
        {
            "conceptTitle": concept_title,
            "stepNumber": step_number,
            "totalSteps": total_steps,
            "stepLabel": step_label,
            "elements": elements or [],
            "connections": connections or [],
            "notes": notes,
            "narration": narration,
            "appendMode": append_mode,
        },
        task_id=task_id,
    )


async def draw_mermaid_diagram_tool(
    concept_title: str,
    nodes: List[dict[str, Any]],
    connections: Optional[List[dict[str, Any]]] = None,
    notes: Optional[List[str] | str] = None,
    narration: Optional[str] = None,
    tool_context: ToolContext = None,
) -> dict[str, Any]:
    """Draws a structured graph / flowchart diagram on the on-screen overlay (Option B).
    
    Args:
        concept_title: Name of the system or architecture diagram.
        nodes: List of graph nodes with labels and optional positions.
        connections: List of directed edges connecting nodes.
        notes: Additional explanation notes.
        narration: Spoken explanation text.
    """
    task_id, _ = _tool_ids(tool_context)
    return await electron_bridge.execute_tool(
        "draw_mermaid_diagram",
        {
            "conceptTitle": concept_title,
            "nodes": nodes,
            "connections": connections or [],
            "notes": notes,
            "narration": narration,
        },
        task_id=task_id,
    )


async def add_whiteboard_clarification_tool(
    topic: str,
    text: str,
    target_id: Optional[str] = None,
    narration: Optional[str] = None,
    tool_context: ToolContext = None,
) -> dict[str, Any]:
    """Adds a dynamic clarification callout card / sticky note on the active whiteboard when the user asks a mid-explanation question.
    
    Args:
        topic: Short summary of the question or doubt being clarified.
        text: Clear, concise explanation answering the user's specific doubt.
        target_id: Optional ID of the whiteboard node/component to anchor the note to.
        narration: Spoken explanation answering the doubt via TTS.
    """
    task_id, _ = _tool_ids(tool_context)
    return await electron_bridge.execute_tool(
        "add_whiteboard_clarification",
        {
            "topic": topic,
            "text": text,
            "targetId": target_id,
            "narration": narration,
        },
        task_id=task_id,
    )


async def draw_whiteboard_lecture_tool(
    concept_title: str,
    steps: list[dict[str, Any]],
    step_delay_seconds: float = 1.0,
    tool_context: ToolContext = None,
) -> dict[str, Any]:
    """Precompiles and presents a complete, multi-step interactive whiteboard lecture with progressive camera tracking and synchronized voice narration.
    
    Generates all progressive explanation steps upfront in a single call so they execute smoothly with zero network latency between steps.
    
    Args:
        concept_title: Title of the concept being explained (e.g. 'Apache Kafka Internal Architecture')
        steps: Full array of progressive whiteboard steps. Each step contains:
            - 'step_number': integer (1, 2, 3, ... N)
            - 'total_steps': total count (e.g. 4)
            - 'step_label': concise stage title (e.g. 'Topics & Partition Commit Logs')
            - 'elements': list of SVG nodes for this step [{'id': 'producer', 'type': 'box', 'label': 'Kafka Producer', 'sublabel': 'Publishes Events', 'color': 'blue', 'x': 0, 'y': 0, 'width': 200, 'height': 90}]
            - 'connections': list of connecting arrows [{'from': 'producer', 'to': 'broker', 'label': '1. Append Records', 'stepNumber': 1, 'color': 'blue', 'curvature': 0}]
            - 'notes': list of 2-3 concise bullet points for this step
            - 'narration': 1-2 sentence spoken narration text for this step
        step_delay_seconds: Pacing delay in seconds between steps after speech narration finishes (default 1.0).
    """
    task_id, _ = _tool_ids(tool_context)
    return await electron_bridge.execute_tool(
        "draw_whiteboard_lecture",
        {
            "conceptTitle": concept_title,
            "steps": steps,
            "stepDelaySeconds": step_delay_seconds,
        },
        task_id=task_id,
    )


async def clear_whiteboard_tool(
    tool_context: ToolContext = None,
) -> dict[str, Any]:
    """Clears all elements and annotations from the active whiteboard canvas."""
    task_id, _ = _tool_ids(tool_context)
    return await electron_bridge.execute_tool(
        "clear_whiteboard",
        {},
        task_id=task_id,
    )


async def close_whiteboard_tool(
    tool_context: ToolContext = None,
) -> dict[str, Any]:
    """Closes the on-screen whiteboard overlay and restores desktop mouse click-through."""
    task_id, _ = _tool_ids(tool_context)
    return await electron_bridge.execute_tool(
        "close_whiteboard",
        {},
        task_id=task_id,
    )


