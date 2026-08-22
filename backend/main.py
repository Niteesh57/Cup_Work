import sys
from pathlib import Path

# Ensure root directory is on Python path
root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

import uvicorn
from backend.config import config

def start():
    port = int(os.getenv("PORT", config.PORT))
    host = os.getenv("HOST", config.HOST)
    reload_enabled = os.getenv("RELOAD", "false").lower() in ("true", "1", "yes")

    print(f"=====================================================")
    print(f"  Cup Work Python Brain Server v2.0")
    print(f"  Host: {host}:{port}")
    print(f"  Vertex AI Mode: {config.USE_VERTEXAI}")
    print(f"  Default Model: {config.DEFAULT_MODEL}")
    print(f"=====================================================")

    uvicorn.run(
        "backend.server:app",
        host=host,
        port=port,
        reload=reload_enabled,
        log_level=config.LOG_LEVEL.lower(),
    )

if __name__ == "__main__":
    start()
