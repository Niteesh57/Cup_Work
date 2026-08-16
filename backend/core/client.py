import os
import logging
from pathlib import Path
from typing import Optional, List, Dict, Any
from google import genai
from backend.config import config
from backend.models import get_available_models, get_default_model

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

        # Resolve credentials path to absolute path
        creds_path = config.CREDENTIALS_PATH
        if creds_path:
            p = Path(creds_path)
            if not p.is_absolute():
                p = (config.BACKEND_DIR / creds_path).resolve()
            if p.exists():
                creds_path = str(p)
                os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = creds_path
                logger.info(f"Using Google Application Credentials: {creds_path}")

        # Ensure environment variables are synchronized for Vertex AI
        if config.USE_VERTEXAI:
            os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "true"
            if config.PROJECT_ID:
                os.environ["GOOGLE_CLOUD_PROJECT"] = config.PROJECT_ID
            if config.LOCATION:
                os.environ["GOOGLE_CLOUD_LOCATION"] = config.LOCATION

            logger.info(f"Initializing Google GenAI SDK with Vertex AI (project={config.PROJECT_ID}, loc={config.LOCATION}).")
            # Client automatically detects Vertex AI from environment variables
            client = genai.Client()
        else:
            effective_key = api_key or config.GEMINI_API_KEY or os.getenv("GEMINI_API_KEY", "") or os.getenv("GOOGLE_API_KEY", "")
            if effective_key:
                logger.info("Initializing Google GenAI SDK with API Key.")
                client = genai.Client(api_key=effective_key)
            else:
                logger.info("Initializing Google GenAI SDK with default client settings.")
                client = genai.Client()

        if not api_key:
            cls._instance = client
        return client

    @classmethod
    def list_models(cls, api_key: Optional[str] = None) -> List[Dict[str, Any]]:
        """Returns available models from central backend models definition."""
        return get_available_models()

def get_genai_client(api_key: Optional[str] = None) -> genai.Client:
    return GenAIClientManager.get_client(api_key=api_key)
