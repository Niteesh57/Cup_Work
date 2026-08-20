import asyncio
import json
import logging
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.config import config
from backend.agents import main_executor_agent, executor_manager, voice_transcriber, hitl_manager
from backend.bridge.electron_bridge import electron_bridge
from backend.events.event_bus import EventType, event_bus
from backend.events.commentary import commentary_translator
from backend.memory.memory_manager import memory_manager
from backend.adk_runner import adk_runner

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("hey_jave.server")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await commentary_translator.start()
    yield


app = FastAPI(title="Cup Work Brain Server", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Event Bus → Electron WebSocket Forwarder ────────────────────────────────
async def _forward_event_to_electron(event_type: str, payload: Dict[str, Any]) -> None:
    await electron_bridge.broadcast({"type": event_type, **payload})


# Forward only the events the renderer/main process consumes.
for _event_type in (
    EventType.TTS_SPEAK,
    EventType.HITL_QUESTION,
    EventType.COMMENTARY,
    EventType.STATE_CHANGE,
    EventType.AGENT_STEP_UPDATE,
    EventType.TASK_COMPLETED,
    EventType.TASK_FAILED,
):
    event_bus.subscribe(_event_type, _forward_event_to_electron)

from backend.models import (
    ChatRequest,
    StopRequest,
    TranscribeRequest,
    FactRequest,
    PreferenceRequest,
    ExpirePreferenceRequest,
    CreateTodoRequest,
    UpdateTodoRequest,
    LogActivityRequest,
    DeviceRegisterRequest,
    UserUpdateRequest,
    DeviceRenameRequest,
)

# ── Health & Info ─────────────────────────────────────────────────────────────
@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "service": "hey-jave-brain",
        "vertex_ai": config.USE_VERTEXAI,
        "default_model": config.DEFAULT_MODEL,
        "active_clients": len(electron_bridge._clients),
    }

@app.get("/api/models")
async def get_models(apiKey: Optional[str] = None):
    try:
        from backend.core.client import list_models
        models = list_models()
        return {"models": models}
    except Exception as e:
        logger.error(f"Error fetching models: {e}")
        return {"models": [], "error": str(e)}

@app.get("/api/config")
async def get_config():
    return {
        "geminiApiKey": config.GEMINI_API_KEY,
        "geminiModel": config.DEFAULT_MODEL,
        "useVertexAi": config.USE_VERTEXAI,
        "uiaTimeoutMs": config.UIA_TIMEOUT_MS,
        "enableVisionFallback": config.ENABLE_VISION_FALLBACK,
    }

@app.post("/api/config")
async def update_config(data: Dict[str, Any] = Body(...)):
    try:
        if "geminiApiKey" in data and data["geminiApiKey"]:
            config.GEMINI_API_KEY = str(data["geminiApiKey"])
        if "geminiModel" in data and data["geminiModel"]:
            config.DEFAULT_MODEL = str(data["geminiModel"])
        return {"success": True, "message": "Configuration updated"}
    except Exception as e:
        return {"success": False, "error": str(e)}

# ── User & Device Identity Auto-Provisioning & Profiles ───────────────────────
@app.get("/api/device/status")
@app.get("/api/device/check")
async def check_device_status(deviceId: str):
    info = memory_manager.is_device_registered(deviceId)
    if info:
        return {"registered": True, "exists": True, **info}
    from backend.storage.sqlite_store import SqliteStore
    suggested_name = SqliteStore.generate_random_username()
    return {
        "registered": False,
        "exists": False,
        "deviceId": deviceId,
        "suggestedUserName": suggested_name,
    }

@app.post("/api/device/register")
@app.post("/api/user/register")
async def register_device_or_user(req: DeviceRegisterRequest):
    identity = memory_manager.get_or_create_identity(
        device_id=req.deviceId,
        user_id=req.userId,
        device_name=req.deviceName,
        device_type=req.deviceType or "desktop",
        os_info=req.osInfo,
    )
    return {"success": True, **identity}

@app.get("/api/user/profile")
async def get_user_profile(userId: str):
    profile = memory_manager.get_user_profile(userId)
    if not profile:
        raise HTTPException(status_code=404, detail=f"User '{userId}' not found.")
    return {"success": True, "profile": profile}

@app.patch("/api/user/profile")
async def update_user_profile(req: UserUpdateRequest):
    ok = memory_manager.update_user_name(req.userId, req.name) if req.name else True
    profile = memory_manager.get_user_profile(req.userId)
    return {"success": ok, "profile": profile}

@app.patch("/api/device/rename")
async def rename_device(req: DeviceRenameRequest):
    ok = memory_manager.update_device_name(req.deviceId, req.deviceName)
    return {"success": ok, "deviceId": req.deviceId, "deviceName": req.deviceName}

# ── Chat / Agent Prompt Execution ─────────────────────────────────────────────
@app.post("/api/agent/chat")
async def execute_chat(req: ChatRequest):
    has_audio = bool(req.audioBase64)
    # Mandatory identity resolution: auto-creates random friendly user name if new device/user
    identity = memory_manager.get_or_create_identity(
        device_id=req.deviceId,
        user_id=req.userId,
        device_name=req.deviceName,
    )
    user_id = identity["userId"]
    device_id = identity["deviceId"]
    task_id = req.taskId or f"task-{uuid.uuid4().hex[:8]}"
    electron_bridge.associate_task_device(task_id, device_id)

    logger.info(f"Received chat request: user={user_id} ({identity['userName']}), device={device_id} ({identity['deviceName']}), task={task_id}, prompt={req.prompt!r}, has_audio={has_audio}")
    if not req.prompt and not has_audio:
        raise HTTPException(status_code=400, detail="Either prompt or audioBase64 must be provided.")

    try:
        res = await adk_runner.run(
            prompt=req.prompt,
            audio_base64=req.audioBase64,
            mime_type=req.mimeType,
            user_id=user_id,
            device_id=device_id,
            task_id=task_id,
        )
        if isinstance(res, dict):
            res["userId"] = user_id
            res["deviceId"] = device_id
            res["userName"] = identity["userName"]
            res["deviceName"] = identity["deviceName"]
        return res
    except Exception as e:
        logger.exception(f"ADK route failed, falling back to direct executor: {e}")
        res = await main_executor_agent.execute_prompt(
            prompt=req.prompt or "Execute user's spoken voice command.",
            audio_base64=req.audioBase64,
            mime_type=req.mimeType,
            task_id=task_id,
            user_id=user_id,
            device_id=device_id,
        )
        if isinstance(res, dict):
            res["userId"] = user_id
            res["deviceId"] = device_id
            res["userName"] = identity["userName"]
            res["deviceName"] = identity["deviceName"]
        return res

@app.post("/api/agent/stop")
async def stop_chat(req: StopRequest):
    executor_manager.cancel(req.taskId)
    return {"success": True, "taskId": req.taskId}

@app.post("/api/agent/pause/{task_id}")
async def pause_task(task_id: str):
    ok = executor_manager.pause(task_id)
    return {"success": ok, "taskId": task_id, "message": "Paused" if ok else "Task not found"}

@app.post("/api/agent/resume/{task_id}")
async def resume_task(task_id: str):
    ok = executor_manager.resume(task_id)
    return {"success": ok, "taskId": task_id, "message": "Resumed" if ok else "Task not found"}

@app.post("/api/agent/cancel/{task_id}")
async def cancel_task(task_id: str):
    ok = executor_manager.cancel(task_id)
    return {"success": ok, "taskId": task_id, "message": "Cancelled" if ok else "Task not found"}

# ── Multimodal Voice Transcription ────────────────────────────────────────────
@app.post("/api/voice/transcribe")
async def transcribe_voice(req: TranscribeRequest):
    try:
        text = await voice_transcriber.transcribe_audio_base64(
            audio_base64=req.audioBase64,
            mime_type=req.mimeType or "audio/wav",
            api_key=req.apiKey
        )
        return {"success": True, "text": text}
    except Exception as e:
        logger.error(f"Transcription error: {e}")
        return {"success": False, "error": str(e)}


# ── Full Context, Memory, Preference & Todo APIs ──────────────────────────────
@app.get("/api/user/context")
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
        "history": history
    }

# ── User Preferences APIs (Temporal 'present' vs 'expired') ───────────────────
@app.get("/api/preferences")
async def list_preferences(userId: str = "default", status: Optional[str] = None, category: Optional[str] = None, deviceId: Optional[str] = None):
    prefs = memory_manager.get_all_preferences(user_id=userId, status=status, category=category, device_id=deviceId)
    return {"userId": userId, "preferences": prefs, "count": len(prefs)}

@app.post("/api/preferences")
async def create_or_update_preference(req: PreferenceRequest):
    pref = memory_manager.set_user_preference(
        user_id=req.userId or "default",
        key=req.key,
        value=req.value,
        status=req.status or "present",
        category=req.category or "general",
        device_id=req.deviceId or "all",
        confidence=req.confidence if req.confidence is not None else 1.0
    )
    return {"success": True, "preference": pref}

@app.post("/api/preferences/expire")
async def expire_preference(req: ExpirePreferenceRequest):
    ok = memory_manager.expire_user_preference(
        user_id=req.userId or "default",
        key=req.key,
        category=req.category
    )
    return {"success": ok, "message": f"Preference '{req.key}' expired." if ok else "Preference not found or already expired."}

# ── Todo-Tasks APIs ───────────────────────────────────────────────────────────
@app.get("/api/todos")
async def list_todos(userId: str = "default", status: Optional[str] = None, priority: Optional[str] = None, deviceId: Optional[str] = None):
    todos = memory_manager.get_all_todos(user_id=userId, status=status, priority=priority, device_id=deviceId)
    return {"userId": userId, "todos": todos, "count": len(todos)}

@app.post("/api/todos")
async def create_todo(req: CreateTodoRequest):
    task = memory_manager.create_todo(
        user_id=req.userId or "default",
        title=req.title,
        description=req.description,
        priority=req.priority or "medium",
        due_date=req.dueDate,
        tags=req.tags,
        device_id=req.deviceId or "desktop-main"
    )
    return {"success": True, "task": task}

@app.patch("/api/todos/{task_id}")
async def update_todo(task_id: str, req: UpdateTodoRequest):
    user_id = req.userId or "default"
    updated = memory_manager.update_todo(
        task_id=task_id,
        user_id=user_id,
        status=req.status,
        priority=req.priority,
        title=req.title,
        description=req.description,
        due_date=req.dueDate,
        tags=req.tags
    )
    if not updated:
        raise HTTPException(status_code=404, detail=f"Todo task '{task_id}' not found for user '{user_id}'.")
    return {"success": True, "task": updated}

@app.delete("/api/todos/{task_id}")
async def delete_todo(task_id: str, userId: str = "default"):
    ok = memory_manager.delete_todo(task_id=task_id, user_id=userId)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Todo task '{task_id}' not found for user '{userId}'.")
    return {"success": True, "taskId": task_id}

# ── Long-Term Memory (Timeline) APIs ──────────────────────────────────────────
@app.get("/api/memory/timeline")
async def get_timeline(userId: str = "default", deviceId: Optional[str] = None, date: Optional[str] = None, activityType: Optional[str] = None, limit: int = 50):
    timeline = memory_manager.get_timeline(user_id=userId, device_id=deviceId, date_str=date, activity_type=activityType, limit=limit)
    return {"userId": userId, "timeline": timeline, "count": len(timeline)}

@app.post("/api/memory/activity")
async def log_activity(req: LogActivityRequest):
    act_id = memory_manager.log_activity(
        user_id=req.userId or "default",
        activity_type=req.activityType,
        title=req.title,
        content=req.content,
        details=req.details,
        importance=req.importance if req.importance is not None else 1.0,
        device_id=req.deviceId or "desktop-main"
    )
    return {"success": True, "activityId": act_id}

# ── Legacy Memory Compatibility APIs ─────────────────────────────────────────
@app.get("/api/memory")
async def get_memory(userId: str = "default"):
    facts = memory_manager.get_all_facts(userId)
    history = memory_manager.get_recent_history(userId, limit=20)
    return {"facts": facts, "history": history}

@app.post("/api/memory/fact")
async def set_fact(req: FactRequest):
    memory_manager.set_user_fact(req.userId or "default", req.key, req.value)
    return {"success": True}

# ── Real-Time WebSocket Endpoint ──────────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    electron_bridge.register_client(websocket)
    try:
        while True:
            raw_text = await websocket.receive_text()
            try:
                data = json.loads(raw_text)
                msg_type = data.get("type")
                if msg_type == "REGISTER_DEVICE":
                    dev_id = str(data.get("deviceId", ""))
                    if dev_id:
                        electron_bridge.register_device_client(dev_id, websocket)
                elif msg_type == "HUMAN_RESPONSE":
                    response_id = str(data.get("id", ""))
                    answer = str(data.get("answer", data.get("result", "")))
                    if response_id:
                        hitl_manager.resolve(response_id, answer)
                    else:
                        hitl_manager.resolve_pending_by_task(str(data.get("taskId", "")), answer)
                electron_bridge.handle_client_message(data, websocket=websocket)
            except json.JSONDecodeError:
                logger.warning(f"Received invalid JSON on websocket: {raw_text}")
    except WebSocketDisconnect:
        electron_bridge.unregister_client(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        electron_bridge.unregister_client(websocket)
