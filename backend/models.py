from typing import List, Dict, Any, Optional
import logging
from pydantic import BaseModel

logger = logging.getLogger("hey_jave.models")

class ModelInfo(BaseModel):
    id: str
    displayName: str
    description: Optional[str] = None
    isDefault: bool = False
    badge: Optional[str] = None

# Curated Vertex AI & Gemini model definitions
AVAILABLE_MODELS: List[ModelInfo] = [
    ModelInfo(
        id="gemini-2.5-flash",
        displayName="Gemini 2.5 Flash ⚡",
        description="Fast, multimodal, low latency, ideal for desktop agents",
        isDefault=True,
        badge="⚡ Fast"
    ),
    ModelInfo(
        id="gemini-2.5-pro",
        displayName="Gemini 2.5 Pro 🧠",
        description="High-reasoning model for complex multi-step reasoning",
        isDefault=False,
        badge="🧠 Pro"
    ),
    ModelInfo(
        id="gemini-3.7-flash",
        displayName="Gemini 3.7 Flash 🚀",
        description="Next-generation high efficiency flash model",
        isDefault=False,
        badge="🚀 New"
    ),
    ModelInfo(
        id="gemini-2.0-flash",
        displayName="Gemini 2.0 Flash",
        description="Reliable multimodal model",
        isDefault=False,
        badge="⚡ Fast"
    ),
    ModelInfo(
        id="gemini-1.5-pro",
        displayName="Gemini 1.5 Pro",
        description="Long-context high capability model",
        isDefault=False,
        badge="🧠 Pro"
    ),
]

DEFAULT_MODEL_ID = "gemini-2.5-flash"

def get_available_models() -> List[Dict[str, Any]]:
    """Returns the list of all available models for frontend selection."""
    return [m.model_dump() for m in AVAILABLE_MODELS]

def get_default_model() -> str:
    return DEFAULT_MODEL_ID
