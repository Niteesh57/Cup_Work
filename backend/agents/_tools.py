from __future__ import annotations

import asyncio
import base64
import logging
import os
from typing import Any, List, Optional

from google import genai
from google.adk.tools import ToolContext
from google.genai import types

from backend.bridge.electron_bridge import electron_bridge
from backend.agents.hitl_manager import hitl_manager
from backend.memory.memory_manager import memory_manager
from backend.events.event_bus import EventType, event_bus
from backend.config import config

logger = logging.getLogger("hey_jave.tools")


def _tool_ids(tool_context: Optional[ToolContext]) -> tuple[str, str]:
    """Extracts task/user ids available to a desktop-facing tool."""
    if tool_context is None:
        return "", "default"
    return str(tool_context.state.get("task_id", "")), tool_context.user_id


async def take_screenshot_tool(
    tool_context: ToolContext = None,
) -> dict[str, Any]:
    """Captures a live desktop screenshot. Call this ONLY when the user's query or command explicitly requires seeing or inspecting the current desktop screen, open windows, UI elements, buttons, or on-screen errors."""
    task_id, _ = _tool_ids(tool_context)
    shot = await electron_bridge.execute_tool("take_screenshot", {}, task_id=task_id)
    if isinstance(shot, dict) and shot.get("base64"):
        if tool_context is not None and hasattr(tool_context, "state"):
            tool_context.state["latest_screenshot_base64"] = shot.get("base64")
        return {
            "success": True,
            "message": "Desktop screenshot captured successfully.",
        }
    return {
        "success": False,
        "error": shot.get("error", "Failed to capture screenshot.") if isinstance(shot, dict) else "Failed to capture screenshot.",
    }


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
    """Draws colored highlight boxes, directional pointer arrows, and step badges directly on the Windows screen for visual guidance.

    Args:
        boxes: List of bounding box highlights. Each box can be:
               - {"label": "Compute Engine", "bounds": [ymin, xmin, ymax, xmax], "color": "cyan"|"green"|"yellow"|"purple"|"red"} (where coordinates are 0..1000 normalized to the screen image)
               - OR {"label": "Click Here", "box_2d": [ymin, xmin, ymax, xmax], "color": "cyan"}
               - OR {"label": "Button", "x": 500, "y": 300, "width": 120, "height": 40, "color": "green"} (pixel coordinates)
        arrows: Optional list of directional pointer arrows. Each arrow can be:
               - {"label": "Click Here", "fromX": 600, "fromY": 500, "toX": 640, "toY": 650, "color": "cyan"} (0..1000 normalized or pixel coordinates)
               - OR {"label": "Click Here", "start_x": 600, "start_y": 500, "end_x": 640, "end_y": 650}
        duration_seconds: Auto-dismiss delay in seconds (0 = persist until user dismisses or presses ESC).
    """
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
    """Prompts the user with a question and selectable options via the on-screen app UI."""
    task_id, user_id = _tool_ids(tool_context)
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


async def scroll_tool(
    delta: int,
    x: Optional[int] = None,
    y: Optional[int] = None,
    tool_context: ToolContext = None,
) -> dict[str, Any]:
    """Scrolls the active window, document, table, or web page up or down.

    Args:
        delta: Scroll amount. Negative (-3 to -10) scrolls DOWN through long documents, web feeds, slides, or tables. Positive (3 to 10) scrolls UP.
        x: Optional screen X coordinate over which to scroll.
        y: Optional screen Y coordinate over which to scroll.
    """
    task_id, _ = _tool_ids(tool_context)
    args: dict[str, Any] = {"delta": delta}
    if x is not None:
        args["x"] = x
    if y is not None:
        args["y"] = y
    return await electron_bridge.execute_tool("scroll", args, task_id=task_id)


async def uia_scroll_into_view_tool(
    name: Optional[str] = None,
    control_type: Optional[str] = None,
    window_title: Optional[str] = None,
    tool_context: ToolContext = None,
) -> dict[str, Any]:
    """Scrolls a target UI element or list item into view in Windows applications."""
    task_id, _ = _tool_ids(tool_context)
    return await electron_bridge.execute_tool(
        "uia_scroll_into_view",
        {"name": name, "controlType": control_type, "windowTitle": window_title},
        task_id=task_id,
    )


# ── User Preferences & Memory Tools ──────────────────────────────────────────
async def set_user_preference_tool(
    key: str,
    value: str,
    status: str = "present",
    category: str = "general",
    device_id: str = "all",
    tool_context: ToolContext = None,
) -> dict[str, Any]:
    """Records or updates a user preference/liking with 'present' or 'expired' status."""
    _, user_id = _tool_ids(tool_context)
    pref = memory_manager.set_user_preference(
        user_id=user_id,
        key=key,
        value=value,
        status=status,
        category=category,
        device_id=device_id
    )
    return {
        "success": True,
        "message": f"Preference '{key}' set to '{value}' with status '{pref['status']}'.",
        "preference": pref
    }


async def expire_user_preference_tool(
    key: str,
    category: Optional[str] = None,
    tool_context: ToolContext = None,
) -> dict[str, Any]:
    """Marks an existing user preference as 'expired' when no longer valid or superseded."""
    _, user_id = _tool_ids(tool_context)
    ok = memory_manager.expire_user_preference(user_id=user_id, key=key, category=category)
    return {
        "success": ok,
        "message": f"Preference '{key}' marked as expired." if ok else f"No active preference found for '{key}'."
    }


async def get_user_preferences_tool(
    status: Optional[str] = None,
    category: Optional[str] = None,
    tool_context: ToolContext = None,
) -> dict[str, Any]:
    """Retrieves user preferences and likings filtered by status ('present'/'expired') or category."""
    _, user_id = _tool_ids(tool_context)
    prefs = memory_manager.get_all_preferences(user_id=user_id, status=status, category=category)
    return {
        "success": True,
        "count": len(prefs),
        "preferences": prefs
    }


# ── Todo-Tasks Tools ─────────────────────────────────────────────────────────
async def create_todo_task_tool(
    title: str,
    description: Optional[str] = None,
    priority: str = "medium",
    due_date: Optional[int] = None,
    tags: Optional[List[str]] = None,
    tool_context: ToolContext = None,
) -> dict[str, Any]:
    """Creates a new actionable todo item or task for the user."""
    _, user_id = _tool_ids(tool_context)
    dev_id = getattr(tool_context, "state", {}).get("device_id", "desktop-main") if tool_context else "desktop-main"
    task = memory_manager.create_todo(
        user_id=user_id,
        title=title,
        description=description,
        priority=priority,
        due_date=due_date,
        tags=tags,
        device_id=dev_id
    )

    # Publish real-time TODO_UPDATED event for UI top bar sync
    all_todos = memory_manager.get_all_todos(user_id=user_id)
    pending = [t for t in all_todos if t.get("status") != "completed"]
    done = [t for t in all_todos if t.get("status") == "completed"]
    asyncio.create_task(event_bus.publish(EventType.TODO_UPDATED, {
        "userId": user_id,
        "deviceId": dev_id,
        "counts": {
            "total": len(all_todos),
            "pending": len(pending),
            "done": len(done),
        },
        "tasks": all_todos,
    }))

    return {
        "success": True,
        "message": f"Created todo task '{title}' [Priority: {task['priority']}].",
        "task": task
    }


async def update_todo_task_tool(
    task_id: str,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    title: Optional[str] = None,
    description: Optional[str] = None,
    tool_context: ToolContext = None,
) -> dict[str, Any]:
    """Updates an existing todo task's status, priority, or details."""
    _, user_id = _tool_ids(tool_context)
    dev_id = getattr(tool_context, "state", {}).get("device_id", "desktop-main") if tool_context else "desktop-main"
    updated = memory_manager.update_todo(
        task_id=task_id,
        user_id=user_id,
        status=status,
        priority=priority,
        title=title,
        description=description
    )
    if updated:
        # Publish real-time TODO_UPDATED event for UI top bar sync
        all_todos = memory_manager.get_all_todos(user_id=user_id)
        pending = [t for t in all_todos if t.get("status") != "completed"]
        done = [t for t in all_todos if t.get("status") == "completed"]
        asyncio.create_task(event_bus.publish(EventType.TODO_UPDATED, {
            "userId": user_id,
            "deviceId": dev_id,
            "counts": {
                "total": len(all_todos),
                "pending": len(pending),
                "done": len(done),
            },
            "tasks": all_todos,
        }))

        return {
            "success": True,
            "message": f"Updated task '{task_id}' (Status: {updated['status']}).",
            "task": updated
        }
    return {
        "success": False,
        "error": f"Task '{task_id}' not found for user '{user_id}'."
    }


async def list_todo_tasks_tool(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    tool_context: ToolContext = None,
) -> dict[str, Any]:
    """Lists the user's todo tasks."""
    _, user_id = _tool_ids(tool_context)
    if status is None:
        tasks = memory_manager.get_active_todos(user_id=user_id)
    else:
        tasks = memory_manager.get_all_todos(user_id=user_id, status=status, priority=priority)
    return {
        "success": True,
        "count": len(tasks),
        "tasks": tasks
    }


async def log_activity_event_tool(
    activity_type: str,
    title: str,
    content: str,
    importance: float = 1.0,
    tool_context: ToolContext = None,
) -> dict[str, Any]:
    """Logs an important activity or milestone to the user's permanent Long-Term Memory timeline."""
    _, user_id = _tool_ids(tool_context)
    dev_id = getattr(tool_context, "state", {}).get("device_id", "desktop-main") if tool_context else "desktop-main"
    act_id = memory_manager.log_activity(
        user_id=user_id,
        activity_type=activity_type,
        title=title,
        content=content,
        importance=importance,
        device_id=dev_id
    )
    return {
        "success": True,
        "message": f"Logged activity '{title}' to Long-Term Memory timeline.",
        "activityId": act_id
    }


async def search_and_explore_places_tool(
    query: str,
    location_hint: Optional[str] = None,
    tool_context: ToolContext = None,
) -> dict[str, Any]:
    """Finds top-rated local places, coffee shops, restaurants, attractions, directions, or travel stays and vacation plans using Google Search and Google Maps grounding."""
    try:
        use_vertex = config.USE_VERTEXAI
        project = os.getenv("GOOGLE_CLOUD_PROJECT") or os.getenv("GCP_PROJECT") or "jave-505605"
        location = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")
        if use_vertex:
            client = genai.Client(vertexai=True, project=project, location=location)
        else:
            client = genai.Client(api_key=config.GEMINI_API_KEY)

        full_query = query
        if location_hint:
            full_query = f"{query} in or near {location_hint}"

        tools = [types.Tool(google_search=types.GoogleSearch())]
        try:
            if hasattr(types, "GoogleMaps"):
                tools.append(types.Tool(google_maps=types.GoogleMaps()))
        except Exception:
            pass

        resp = await asyncio.to_thread(
            client.models.generate_content,
            model="gemini-2.5-flash",
            contents=f"Provide a comprehensive, structured recommendation with names, exact addresses, ratings, key highlights, and helpful advice for: {full_query}",
            config=types.GenerateContentConfig(
                tools=tools
            )
        )
        return {
            "success": True,
            "query": full_query,
            "result": resp.text,
        }
    except Exception as e:
        logger.warning(f"Error in search_and_explore_places_tool: {e}")
        return {
            "success": False,
            "error": str(e),
        }


async def read_grounded_news_tool(
    topic: str = "top world and technology headlines today",
    tool_context: ToolContext = None,
) -> dict[str, Any]:
    """Searches live news headlines, articles, and current affairs using Google Search grounding for reading aloud or summarizing."""
    try:
        use_vertex = config.USE_VERTEXAI
        project = os.getenv("GOOGLE_CLOUD_PROJECT") or os.getenv("GCP_PROJECT") or "jave-505605"
        location = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")
        if use_vertex:
            client = genai.Client(vertexai=True, project=project, location=location)
        else:
            client = genai.Client(api_key=config.GEMINI_API_KEY)

        tools = [types.Tool(google_search=types.GoogleSearch())]
        resp = await asyncio.to_thread(
            client.models.generate_content,
            model="gemini-2.5-flash",
            contents=f"Find the most recent, breaking news headlines and key bullet point summaries for: {topic}. Include reputable sources.",
            config=types.GenerateContentConfig(
                tools=tools
            )
        )
        return {
            "success": True,
            "topic": topic,
            "news": resp.text,
        }
    except Exception as e:
        logger.warning(f"Error in read_grounded_news_tool: {e}")
        return {
            "success": False,
            "error": str(e),
        }





