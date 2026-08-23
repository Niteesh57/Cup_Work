import json
import logging
from contextlib import asynccontextmanager
from typing import Any, Dict
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.agents import hitl_manager
from backend.bridge.electron_bridge import electron_bridge
from backend.events.event_bus import EventType, event_bus
from backend.events.commentary import commentary_translator
from backend.api import api_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("cup_work.server")

ROOT_DIR = Path(__file__).resolve().parent.parent
PUBLIC_DIR = ROOT_DIR / "public"
LANDING_DIR = PUBLIC_DIR / "landing"


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

# ── Static Landing Page & Assets ──────────────────────────────────────────────
if PUBLIC_DIR.exists():
    app.mount("/public", StaticFiles(directory=str(PUBLIC_DIR)), name="public")

@app.get("/")
@app.get("/landing")
async def serve_landing_page():
    landing_index = LANDING_DIR / "index.html"
    if landing_index.exists():
        return FileResponse(str(landing_index))
    return {
        "status": "online",
        "service": "Cup Work Brain Server v2.0",
        "endpoints": {
            "api": "/api",
            "download_windows": "/api/download/windows",
            "download_info": "/api/download/info",
            "websocket": "/ws"
        }
    }

@app.get("/style.css")
@app.get("/landing/style.css")
async def serve_style():
    css_file = LANDING_DIR / "style.css"
    if css_file.exists():
        return FileResponse(str(css_file), media_type="text/css")
    return {"error": "style.css not found"}

@app.get("/app.js")
@app.get("/landing/app.js")
async def serve_js():
    js_file = LANDING_DIR / "app.js"
    if js_file.exists():
        return FileResponse(str(js_file), media_type="application/javascript")
    return {"error": "app.js not found"}

@app.get("/icon.png")
@app.get("/landing/icon.png")
async def serve_icon():
    icon_file = PUBLIC_DIR / "icon.png"
    if icon_file.exists():
        return FileResponse(str(icon_file), media_type="image/png")
    return {"error": "icon.png not found"}

@app.get("/Architecture.svg")
@app.get("/landing/Architecture.svg")
async def serve_arch():
    svg_file = PUBLIC_DIR / "Architecture.svg"
    if svg_file.exists():
        return FileResponse(str(svg_file), media_type="image/svg+xml")
    return {"error": "Architecture.svg not found"}

@app.get("/demo-video.mp4")
async def serve_video():
    video_file = PUBLIC_DIR / "demo-video.mp4"
    if video_file.exists():
        return FileResponse(str(video_file), media_type="video/mp4")
    return {"error": "Video not found"}





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
