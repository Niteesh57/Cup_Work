import os
from pathlib import Path
from dotenv import load_dotenv

# Search and load .env from project root or current working directory
root_dir = Path(__file__).resolve().parent.parent
env_paths = [
    root_dir / ".env",
    Path.cwd() / ".env",
    Path(__file__).resolve().parent / ".env",
]

env_file = next((p for p in env_paths if p.exists()), root_dir / ".env")
load_dotenv(dotenv_path=env_file)

# Configuration class
class Config:
    ROOT_DIR: Path = root_dir
    BACKEND_DIR: Path = Path(__file__).resolve().parent
    ENV_FILE_PATH: Path = env_file
    DATA_DIR: Path = root_dir / ".agent-state"

    # Server settings
    HOST: str = os.getenv("PYTHON_BACKEND_HOST", "127.0.0.1")
    PORT: int = int(os.getenv("PYTHON_BACKEND_PORT", "8765"))

    # Vertex AI / Google Cloud configuration
    # When GOOGLE_GENAI_USE_VERTEXAI is "true", Google GenAI automatically uses Vertex AI
    USE_VERTEXAI: bool = os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "false").lower() in ("true", "1", "yes")
    PROJECT_ID: str = os.getenv("GOOGLE_CLOUD_PROJECT", os.getenv("VERTEX_PROJECT_ID", ""))
    LOCATION: str = os.getenv("GOOGLE_CLOUD_LOCATION", os.getenv("VERTEX_LOCATION", "us-central1"))
    CREDENTIALS_PATH: str = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")

    # Gemini Developer API Key fallback
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
        cls.USE_VERTEXAI = os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "false").lower() in ("true", "1", "yes")
        cls.PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT", os.getenv("VERTEX_PROJECT_ID", ""))
        cls.LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION", os.getenv("VERTEX_LOCATION", "us-central1"))
        cls.CREDENTIALS_PATH = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")
        cls.GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", os.getenv("GOOGLE_API_KEY", ""))
        cls.DEFAULT_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

config = Config()
