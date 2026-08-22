import logging
from typing import Any, Dict, Optional
from fastapi import APIRouter, Body

from backend.config import config
from backend.bridge.electron_bridge import electron_bridge

logger = logging.getLogger("hey_jave.api.system")

router = APIRouter(tags=["System & Config"])


@router.get("/health")
async def health_check():
    """Returns server health status and runtime metadata."""
    return {
        "status": "ok",
        "service": "hey-jave-brain",
        "vertex_ai": config.USE_VERTEXAI,
        "default_model": config.DEFAULT_MODEL,
        "active_clients": len(electron_bridge._clients),
    }


@router.get("/api/models")
async def get_models(apiKey: Optional[str] = None):
    """Lists available Gemini models for selection."""
    try:
        from backend.core.client import list_models
        models = list_models()
        return {"models": models}
    except Exception as e:
        logger.error(f"Error fetching models: {e}")
        return {"models": [], "error": str(e)}


@router.get("/api/config")
async def get_config():
    """Returns current runtime model and voice configuration without exposing sensitive API keys."""
    return {
        "geminiModel": getattr(config, "DEFAULT_MODEL", "gemini-3.7-flash"),
        "geminiVoice": getattr(config, "DEFAULT_VOICE", "Kore"),
        "useVertexAi": config.USE_VERTEXAI,
        "uiaTimeoutMs": config.UIA_TIMEOUT_MS,
        "enableVisionFallback": config.ENABLE_VISION_FALLBACK,
    }


@router.post("/api/config")
async def update_config(data: Dict[str, Any] = Body(...)):
    """Updates runtime configuration safely without leaking sensitive keys in response."""
    try:
        if "geminiVoice" in data and data["geminiVoice"]:
            config.DEFAULT_VOICE = str(data["geminiVoice"])
        if "geminiModel" in data and data["geminiModel"]:
            config.DEFAULT_MODEL = str(data["geminiModel"])
        if "geminiApiKey" in data and data["geminiApiKey"]:
            config.GEMINI_API_KEY = str(data["geminiApiKey"])
        if "uiaTimeoutMs" in data and data["uiaTimeoutMs"] is not None:
            config.UIA_TIMEOUT_MS = int(data["uiaTimeoutMs"])
        if "enableVisionFallback" in data and data["enableVisionFallback"] is not None:
            config.ENABLE_VISION_FALLBACK = bool(data["enableVisionFallback"])
        return {"success": True, "message": "Configuration updated"}
    except Exception as e:
        logger.error(f"Error updating config: {e}")
        return {"success": False, "error": str(e)}
