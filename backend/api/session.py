import time
import logging
from typing import Any, Dict, Optional
from fastapi import APIRouter, Body

from backend.memory.memory_manager import memory_manager

logger = logging.getLogger("cup_work.api.session")

router = APIRouter(tags=["Daily Session Management"])


@router.get("/api/session/today")
async def get_today_session(
    userId: str = "default",
    deviceId: Optional[str] = "desktop-main",
    dateStr: Optional[str] = None,
):
    """Returns all chat messages and tool executions for today's session in chronological order."""
    messages = memory_manager.get_today_chat_messages(
        user_id=userId,
        device_id=deviceId,
        date_str=dateStr,
    )
    dt = dateStr or time.strftime("%Y-%m-%d")
    return {
        "success": True,
        "date": dt,
        "userId": userId,
        "deviceId": deviceId,
        "count": len(messages),
        "messages": messages,
    }


@router.post("/api/session/save-message")
async def save_session_message(data: Dict[str, Any] = Body(...)):
    """Persists or updates a single chat message in today's daily session store."""
    msg_id = str(data.get("id") or f"msg-{int(time.time() * 1000)}")
    user_id = str(data.get("userId") or "default")
    device_id = str(data.get("deviceId") or "desktop-main")
    role = str(data.get("role") or "agent").lower()
    text = data.get("text")
    is_voice = bool(data.get("isVoice"))
    status = str(data.get("status") or "done")
    steps = data.get("steps")
    duration_ms = int(data.get("durationMs") or 0)
    output_tokens = data.get("outputTokens")
    hitl = data.get("hitl")
    whiteboard_data = data.get("whiteboardData") or data.get("whiteboard_data")
    spoke_voice = bool(data.get("spokeVoice"))
    had_whiteboard = bool(data.get("hadWhiteboard")) or bool(whiteboard_data)
    date_str = data.get("dateStr")
    created_at = data.get("createdAt")

    saved_id = memory_manager.save_chat_message(
        msg_id=msg_id,
        user_id=user_id,
        device_id=device_id,
        role=role,
        text=text,
        is_voice=is_voice,
        status=status,
        steps=steps,
        duration_ms=duration_ms,
        output_tokens=output_tokens,
        hitl=hitl,
        whiteboard_data=whiteboard_data,
        spoke_voice=spoke_voice,
        had_whiteboard=had_whiteboard,
        date_str=date_str,
        created_at=created_at,
    )

    return {"success": True, "id": saved_id}


@router.post("/api/session/clear-today")
async def clear_today_session(data: Dict[str, Any] = Body(...)):
    user_id = str(data.get("userId") or "default")
    device_id = data.get("deviceId")
    date_str = data.get("dateStr")
    memory_manager.clear_today_chat_messages(user_id=user_id, device_id=device_id, date_str=date_str)
    return {"success": True}


@router.post("/api/session/start-new-cup")
async def start_new_cup_endpoint(data: Dict[str, Any] = Body(...)):
    """Wipes today's chat messages, short-term memory, and todos to start a fresh coffee cup session."""
    user_id = str(data.get("userId") or "default")
    device_id = data.get("deviceId")
    date_str = data.get("dateStr")
    res = memory_manager.start_new_coffee_cup(user_id=user_id, device_id=device_id, date_str=date_str)
    return res
