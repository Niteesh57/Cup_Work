from __future__ import annotations

import logging
from typing import Optional, List, Dict, Any
from google import genai
from backend.config import config
from backend.models import get_available_models


logger = logging.getLogger("cup_work.client")


def get_genai_client(api_key: Optional[str] = None) -> Optional[genai.Client]:
    """Returns standard Google GenAI SDK Client directly."""
    key = api_key or config.GEMINI_API_KEY
    if key:
        return genai.Client(vertexai=config.USE_VERTEXAI, api_key=key)
    try:
        return genai.Client()
    except Exception as e:
        logger.warning(f"Could not initialize default GenAI client without GEMINI_API_KEY: {e}")
        return None


def list_models() -> List[Dict[str, Any]]:
    """Returns available models."""
    return get_available_models()


class GenAIClientManager:
    """Helper wrapper for backward compatibility."""

    @staticmethod
    def get_client(api_key: Optional[str] = None) -> genai.Client:
        return get_genai_client(api_key=api_key)

    @staticmethod
    def list_models(api_key: Optional[str] = None) -> List[Dict[str, Any]]:
        return list_models()
