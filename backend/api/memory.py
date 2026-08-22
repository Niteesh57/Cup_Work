import logging
from typing import Optional
from fastapi import APIRouter

from backend.memory.memory_manager import memory_manager
from backend.models import (
    PreferenceRequest,
    ExpirePreferenceRequest,
    LogActivityRequest,
    FactRequest,
)

logger = logging.getLogger("cup_work.api.memory")

router = APIRouter(tags=["Memory & Preferences"])


# ── Full Context, Memory, Preference & Todo APIs ──────────────────────────────
@router.get("/api/user/context")
async def get_user_context(userId: str = "default", deviceId: str = "desktop-main"):
    """Returns the compiled agent context, active preferences, active todos, and short-term turns."""
    context_str = memory_manager.get_agent_context(user_id=userId, device_id=deviceId)
    preferences = memory_manager.get_active_preferences(user_id=userId, device_id=deviceId)
    todos = memory_manager.get_active_todos(user_id=userId, device_id=deviceId)
    history = memory_manager.get_recent_history(user_id=userId, device_id=deviceId, limit=20)
    return {
        "userId": userId,
        "deviceId": deviceId,
        "agentContext": context_str,
        "preferences": preferences,
        "todos": todos,
        "history": history,
    }


# ── User Preferences APIs (Temporal 'present' vs 'expired') ───────────────────
@router.get("/api/preferences")
async def list_preferences(
    userId: str = "default",
    status: Optional[str] = None,
    category: Optional[str] = None,
    deviceId: Optional[str] = None,
):
    prefs = memory_manager.get_all_preferences(
        user_id=userId, status=status, category=category, device_id=deviceId
    )
    return {"userId": userId, "preferences": prefs, "count": len(prefs)}


@router.post("/api/preferences")
async def create_or_update_preference(req: PreferenceRequest):
    pref = memory_manager.set_user_preference(
        user_id=req.userId or "default",
        key=req.key,
        value=req.value,
        status=req.status or "present",
        category=req.category or "general",
        device_id=req.deviceId or "all",
        confidence=req.confidence if req.confidence is not None else 1.0,
    )
    return {"success": True, "preference": pref}


@router.post("/api/preferences/expire")
async def expire_preference(req: ExpirePreferenceRequest):
    ok = memory_manager.expire_user_preference(
        user_id=req.userId or "default", key=req.key, category=req.category
    )
    return {
        "success": ok,
        "message": f"Preference '{req.key}' expired."
        if ok
        else "Preference not found or already expired.",
    }


# ── Long-Term Memory (Timeline) APIs ──────────────────────────────────────────
@router.get("/api/memory/timeline")
async def get_timeline(
    userId: str = "default",
    deviceId: Optional[str] = None,
    date: Optional[str] = None,
    activityType: Optional[str] = None,
    limit: int = 50,
):
    timeline = memory_manager.get_timeline(
        user_id=userId,
        device_id=deviceId,
        date_str=date,
        activity_type=activityType,
        limit=limit,
    )
    return {"userId": userId, "timeline": timeline, "count": len(timeline)}


@router.post("/api/memory/activity")
async def log_activity(req: LogActivityRequest):
    act_id = memory_manager.log_activity(
        user_id=req.userId or "default",
        activity_type=req.activityType,
        title=req.title,
        content=req.content,
        details=req.details,
        importance=req.importance if req.importance is not None else 1.0,
        device_id=req.deviceId or "desktop-main",
    )
    return {"success": True, "activityId": act_id}


# ── Legacy Memory Compatibility APIs ─────────────────────────────────────────
@router.get("/api/memory")
async def get_memory(userId: str = "default"):
    facts = memory_manager.get_all_facts(userId)
    history = memory_manager.get_recent_history(userId, limit=20)
    return {"facts": facts, "history": history}


@router.post("/api/memory/fact")
async def set_fact(req: FactRequest):
    memory_manager.set_user_fact(req.userId or "default", req.key, req.value)
    return {"success": True}
