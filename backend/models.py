from typing import List, Dict, Any, Optional
from pydantic import BaseModel


class ModelInfo(BaseModel):
    id: str
    displayName: str
    description: Optional[str] = None
    isDefault: bool = False
    badge: Optional[str] = None


AVAILABLE_MODELS: List[ModelInfo] = [
    ModelInfo(
        id="gemini-3.7-flash",
        displayName="Gemini 3.7 Flash 🚀",
        description="Next-generation high efficiency & reasoning flash model",
        isDefault=True,
        badge="🚀 Default",
    ),
    ModelInfo(
        id="gemini-2.5-flash",
        displayName="Gemini 2.5 Flash ⚡",
        description="Fast, multimodal, low latency desktop agent model",
        isDefault=False,
        badge="⚡ Stable",
    ),
]

DEFAULT_MODEL_ID = "gemini-3.7-flash"


def get_available_models() -> List[Dict[str, Any]]:
    """Returns the list of available models for frontend selection."""
    return [m.model_dump() for m in AVAILABLE_MODELS]


def get_default_model() -> str:
    return DEFAULT_MODEL_ID


# ── Pydantic Request Models ───────────────────────────────────────────────────
class DeviceRegisterRequest(BaseModel):
    deviceId: Optional[str] = None
    userId: Optional[str] = None
    deviceName: Optional[str] = None
    deviceType: Optional[str] = "desktop"
    osInfo: Optional[str] = None


class UserUpdateRequest(BaseModel):
    userId: str
    name: Optional[str] = None
    email: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class DeviceRenameRequest(BaseModel):
    deviceId: str
    deviceName: str


class ChatRequest(BaseModel):
    prompt: Optional[str] = None
    audioBase64: Optional[str] = None
    mimeType: Optional[str] = "audio/wav"
    taskId: Optional[str] = None
    userId: Optional[str] = None
    deviceId: Optional[str] = None
    deviceName: Optional[str] = None
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


class PreferenceRequest(BaseModel):
    userId: Optional[str] = "default"
    deviceId: Optional[str] = "all"
    key: str
    value: str
    status: Optional[str] = "present"
    category: Optional[str] = "general"
    confidence: Optional[float] = 1.0


class ExpirePreferenceRequest(BaseModel):
    userId: Optional[str] = "default"
    key: str
    category: Optional[str] = None


class CreateTodoRequest(BaseModel):
    userId: Optional[str] = "default"
    deviceId: Optional[str] = "desktop-main"
    title: str
    description: Optional[str] = None
    priority: Optional[str] = "medium"
    dueDate: Optional[int] = None
    tags: Optional[List[str]] = None


class UpdateTodoRequest(BaseModel):
    userId: Optional[str] = "default"
    status: Optional[str] = None
    priority: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    dueDate: Optional[int] = None
    tags: Optional[List[str]] = None


class LogActivityRequest(BaseModel):
    userId: Optional[str] = "default"
    deviceId: Optional[str] = "desktop-main"
    activityType: str
    title: str
    content: str
    details: Optional[Dict[str, Any]] = None
    importance: Optional[float] = 1.0
