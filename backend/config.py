import os
from pathlib import Path
from dotenv import load_dotenv

backend_dir = Path(__file__).resolve().parent
root_dir = backend_dir.parent

# Search and load backend/.env first, then root .env as fallback
env_paths = [
    backend_dir / ".env",
    root_dir / ".env",
    Path.cwd() / ".env",
]

env_file = next((p for p in env_paths if p.exists()), backend_dir / ".env")
load_dotenv(dotenv_path=env_file)

# Automatic discovery of service account credentials JSON in backend directory
discovered_creds = [
    p for p in backend_dir.glob("*.json")
    if not p.name.startswith("package") and not p.name.startswith("tsconfig")
]
default_creds_path = str(discovered_creds[0].resolve()) if discovered_creds else ""


def _extract_project_id(creds_path: str) -> str:
    if creds_path and Path(creds_path).exists():
        try:
            import json
            with open(creds_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("project_id", "")
        except Exception:
            pass
    return ""


def _resolve_creds(path_str: str) -> str:
    if not path_str:
        return default_creds_path
    p = Path(path_str)
    if not p.is_absolute():
        p = (backend_dir / path_str).resolve()
    return str(p) if p.exists() else str(p)


class Config:
    ROOT_DIR: Path = root_dir
    BACKEND_DIR: Path = backend_dir
    ENV_FILE_PATH: Path = env_file
    # All database and storage is contained strictly inside backend/data
    DATA_DIR: Path = backend_dir / "data"

    # Server settings
    HOST: str = os.getenv("PYTHON_BACKEND_HOST", "127.0.0.1")
    PORT: int = int(os.getenv("PYTHON_BACKEND_PORT", "8765"))

    # Vertex AI / Google Cloud configuration
    # Auto-enable Vertex AI if service account credentials or PROJECT_ID are found
    USE_VERTEXAI: bool = os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "true" if discovered_creds else "false").lower() in ("true", "1", "yes")
    PROJECT_ID: str = os.getenv("GOOGLE_CLOUD_PROJECT", os.getenv("VERTEX_PROJECT_ID", _extract_project_id(default_creds_path)))
    LOCATION: str = os.getenv("GOOGLE_CLOUD_LOCATION", os.getenv("VERTEX_LOCATION", "us-central1"))
    CREDENTIALS_PATH: str = _resolve_creds(os.getenv("GOOGLE_APPLICATION_CREDENTIALS", default_creds_path))

    # Gemini Developer API Key fallback (if not using Vertex AI)
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", os.getenv("GOOGLE_API_KEY", ""))

    # Model configuration
    DEFAULT_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

    # Execution settings
    UIA_TIMEOUT_MS: int = int(os.getenv("UIA_TIMEOUT_MS", "5000"))
    ENABLE_VISION_FALLBACK: bool = os.getenv("ENABLE_VISION_FALLBACK", "true").lower() in ("true", "1", "yes")
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "info")

    @classmethod
    def reload(cls):
        load_dotenv(dotenv_path=cls.ENV_FILE_PATH, override=True)
        cls.USE_VERTEXAI = os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "true" if discovered_creds else "false").lower() in ("true", "1", "yes")
        cls.PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT", os.getenv("VERTEX_PROJECT_ID", _extract_project_id(default_creds_path)))
        cls.LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION", os.getenv("VERTEX_LOCATION", "us-central1"))
        cls.CREDENTIALS_PATH = _resolve_creds(os.getenv("GOOGLE_APPLICATION_CREDENTIALS", default_creds_path))
        cls.GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", os.getenv("GOOGLE_API_KEY", ""))
        cls.DEFAULT_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

config = Config()
# Ensure data directory exists inside backend
config.DATA_DIR.mkdir(parents=True, exist_ok=True)
