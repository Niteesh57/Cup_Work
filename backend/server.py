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


app = FastAPI(title="Hey Jave Brain Server", version="2.0.0", lifespan=lifespan)

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
    EventType.TASK_COMPLETED,
    EventType.TASK_FAILED,
):
    event_bus.subscribe(_event_type, _forward_event_to_electron)

# ── Pydantic Request Models ───────────────────────────────────────────────────
class ChatRequest(BaseModel):
    prompt: Optional[str] = None
    audioBase64: Optional[str] = None
    mimeType: Optional[str] = "audio/wav"
    taskId: Optional[str] = None
    userId: Optional[str] = "default"
    model: Optional[str] = None
    apiKey: Optional[str] = None

class StopRequest(BaseModel):
    taskId: str

class TranscribeRequest(BaseModel):
    audioBase64: str
    mimeType: Optional[str] = "audio/wav"
    apiKey: Optional[str] = None

class FactRequest(BaseModel):
    userId: Optional[str] = "default"
    key: str
    value: str

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

# ── Chat / Agent Prompt Execution ─────────────────────────────────────────────
@app.post("/api/agent/chat")
async def execute_chat(req: ChatRequest):
    has_audio = bool(req.audioBase64)
    logger.info(f"Received chat request: prompt={req.prompt!r}, has_audio={has_audio}")
    if not req.prompt and not has_audio:
        raise HTTPException(status_code=400, detail="Either prompt or audioBase64 must be provided.")
    # The root agent is the single orchestrator: it routes to sub-agents
    # (research, executor, scratchpad, strange_planner, clarification) and can
    # chain them dynamically. All prompts (text or direct audio) go through it.
    try:
        res = await adk_runner.run(
            prompt=req.prompt,
            audio_base64=req.audioBase64,
            mime_type=req.mimeType,
            user_id=req.userId or "default",
            task_id=req.taskId,
        )
        return res
    except Exception as e:
        logger.exception(f"ADK route failed, falling back to direct executor: {e}")
        res = await main_executor_agent.execute_prompt(
            prompt=req.prompt or "Execute user's spoken voice command.",
            audio_base64=req.audioBase64,
            mime_type=req.mimeType,
            task_id=req.taskId,
            user_id=req.userId or "default",
        )
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


# ── Memory & Fact APIs ────────────────────────────────────────────────────────
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
                if msg_type == "HUMAN_RESPONSE":
                    response_id = str(data.get("id", ""))
                    answer = str(data.get("answer", data.get("result", "")))
                    if response_id:
                        hitl_manager.resolve(response_id, answer)
                    else:
                        hitl_manager.resolve_pending_by_task(str(data.get("taskId", "")), answer)
                electron_bridge.handle_client_message(data)
            except json.JSONDecodeError:
                logger.warning(f"Received invalid JSON on websocket: {raw_text}")
    except WebSocketDisconnect:
        electron_bridge.unregister_client(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        electron_bridge.unregister_client(websocket)
