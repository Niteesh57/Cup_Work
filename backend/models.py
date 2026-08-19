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
