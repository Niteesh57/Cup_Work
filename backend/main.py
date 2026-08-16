import sys
from pathlib import Path

# Ensure root directory is on Python path
root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

import uvicorn
from backend.config import config

def start():
    print(f"=====================================================")
    print(f"  Hey Jave Python Brain Server v2.0")
    print(f"  Host: {config.HOST}:{config.PORT}")
    print(f"  Vertex AI Mode: {config.USE_VERTEXAI}")
    print(f"  Default Model: {config.DEFAULT_MODEL}")
    print(f"=====================================================")

    uvicorn.run(
        "backend.server:app",
        host=config.HOST,
        port=config.PORT,
        reload=False,
        log_level=config.LOG_LEVEL.lower(),
    )

if __name__ == "__main__":
    start()
