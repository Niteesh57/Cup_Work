import json
import logging
from contextlib import asynccontextmanager
from typing import Any, Dict
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from backend.agents import hitl_manager
from backend.bridge.electron_bridge import electron_bridge
from backend.events.event_bus import EventType, event_bus
from backend.events.commentary import commentary_translator
from backend.api import api_router

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

# ── Include Modular API Routes ────────────────────────────────────────────────
app.include_router(api_router)


# ── Event Bus → Electron WebSocket Forwarder ────────────────────────────────
async def _forward_event_to_electron(event_type: str, payload: Dict[str, Any]) -> None:
    await electron_bridge.broadcast({"type": event_type, **payload})


# Forward only the events the renderer/main process consumes.
for _event_type in (
    EventType.TTS_STREAM_START,
    EventType.TTS_STREAM_CHUNK,
    EventType.TTS_STREAM_END,
    EventType.HITL_QUESTION,
    EventType.COMMENTARY,
    EventType.STATE_CHANGE,
    EventType.AGENT_STEP_UPDATE,
    EventType.TASK_COMPLETED,
    EventType.TASK_FAILED,
    EventType.TODO_UPDATED,
):
    event_bus.subscribe(_event_type, _forward_event_to_electron)


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
