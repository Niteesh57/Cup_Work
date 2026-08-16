import os
import logging
from typing import Optional, List, Dict, Any
from google import genai
from google.genai import types
from backend.config import config

logger = logging.getLogger("hey_jave.client")

class GenAIClientManager:
    """
    Manages Google GenAI SDK client lifecycle.
    Automatically detects Vertex AI configuration when environment variables are set:
      - GOOGLE_GENAI_USE_VERTEXAI=true
      - GOOGLE_CLOUD_PROJECT
      - GOOGLE_CLOUD_LOCATION
      - GOOGLE_APPLICATION_CREDENTIALS
    Or falls back to Gemini Developer API Key (GEMINI_API_KEY).
    """

    _instance: Optional[genai.Client] = None

    @classmethod
    def get_client(cls, api_key: Optional[str] = None, force_refresh: bool = False) -> genai.Client:
        if cls._instance is not None and not force_refresh and not api_key:
            return cls._instance

        # Ensure environment variables are synchronized
        if config.USE_VERTEXAI or os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "").lower() == "true":
            os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "true"
            if config.PROJECT_ID:
                os.environ["GOOGLE_CLOUD_PROJECT"] = config.PROJECT_ID
            if config.LOCATION:
                os.environ["GOOGLE_CLOUD_LOCATION"] = config.LOCATION
            if config.CREDENTIALS_PATH:
                os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = config.CREDENTIALS_PATH
            logger.info("Initializing Google GenAI SDK with Vertex AI configuration.")
            client = genai.Client()
        else:
            effective_key = api_key or config.GEMINI_API_KEY or os.getenv("GEMINI_API_KEY", "") or os.getenv("GOOGLE_API_KEY", "")
            if effective_key:
                logger.info("Initializing Google GenAI SDK with API Key.")
                client = genai.Client(api_key=effective_key)
            else:
                logger.info("Initializing Google GenAI SDK without explicit parameters (auto-detecting environment).")
                client = genai.Client()

        if not api_key:
            cls._instance = client
        return client

    @classmethod
    def list_models(cls, api_key: Optional[str] = None) -> List[Dict[str, str]]:
        """Lists models accessible via the client."""
        client = cls.get_client(api_key=api_key)
        models_list: List[Dict[str, str]] = []
        try:
            for m in client.models.list():
                # Filter for Gemini generative models
                m_name = getattr(m, "name", "") or ""
                disp = getattr(m, "display_name", "") or m_name
                if "gemini" in m_name.lower():
                    # Clean up model name prefix if present (e.g. models/gemini-2.5-flash -> gemini-2.5-flash)
                    clean_id = m_name.replace("models/", "") if m_name.startswith("models/") else m_name
                    models_list.append({
                        "id": clean_id,
                        "displayName": disp or clean_id,
                    })
        except Exception as e:
            logger.warning(f"Error listing models from API: {e}. Falling back to default list.")
            models_list = [
                {"id": "gemini-2.5-flash", "displayName": "Gemini 2.5 Flash ⚡ (Recommended)"},
                {"id": "gemini-2.5-pro", "displayName": "Gemini 2.5 Pro 🧠"},
                {"id": "gemini-3.7-flash", "displayName": "Gemini 3.7 Flash 🚀"},
                {"id": "gemini-3.5-flash", "displayName": "Gemini 3.5 Flash ⚡"},
                {"id": "gemini-2.0-flash", "displayName": "Gemini 2.0 Flash"},
            ]
        return models_list

def get_genai_client(api_key: Optional[str] = None) -> genai.Client:
    return GenAIClientManager.get_client(api_key=api_key)
