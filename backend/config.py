from __future__ import annotations

import os
from pathlib import Path
from dotenv import load_dotenv

backend_dir = Path(__file__).resolve().parent
root_dir = backend_dir.parent

# Load environment variables (.env)
env_paths = [
    backend_dir / ".env",
    root_dir / ".env",
    Path.cwd() / ".env",
]
env_file = next((p for p in env_paths if p.exists()), backend_dir / ".env")
load_dotenv(dotenv_path=env_file)


class Config:
    ROOT_DIR: Path = root_dir
    BACKEND_DIR: Path = backend_dir
    ENV_FILE_PATH: Path = env_file
    DATA_DIR: Path = backend_dir / "data"

    # Server settings
    HOST: str = os.getenv("HOST", os.getenv("PYTHON_BACKEND_HOST", "0.0.0.0" if os.getenv("PORT") else "127.0.0.1"))
    PORT: int = int(os.getenv("PORT", os.getenv("PYTHON_BACKEND_PORT", "8765")))
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "info")

    # GenAI / Vertex AI configuration
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", os.getenv("GOOGLE_API_KEY", ""))
    DEFAULT_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-3.7-flash")
    USE_VERTEXAI: bool = os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "true").lower() in ("true", "1", "yes")

    # Execution settings
    UIA_TIMEOUT_MS: int = int(os.getenv("UIA_TIMEOUT_MS", "5000"))
    ENABLE_VISION_FALLBACK: bool = os.getenv("ENABLE_VISION_FALLBACK", "true").lower() in ("true", "1", "yes")

    @classmethod
    def reload(cls) -> None:
        load_dotenv(dotenv_path=cls.ENV_FILE_PATH, override=True)
        cls.GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", os.getenv("GOOGLE_API_KEY", ""))
        cls.DEFAULT_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.7-flash")
        cls.USE_VERTEXAI = os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "true").lower() in ("true", "1", "yes")


config = Config()
config.DATA_DIR.mkdir(parents=True, exist_ok=True)
