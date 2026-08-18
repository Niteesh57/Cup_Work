import os
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent
if str(backend_dir.parent) not in sys.path:
    sys.path.insert(0, str(backend_dir.parent))

from backend.config import config
from backend.core.client import get_genai_client

INDIA_LOCATIONS = ["asia-south1", "asia-south2"]

MODELS_TO_CHECK = [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.0-flash",
    "gemini-2.0-flash-001",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-1.5-flash-002",
    "gemini-1.5-pro-002",
    "gemini-3.7-flash",
    "text-embedding-004",
]

def check_access():
    print(f"=== Project Configuration ===")
    print(f"Project ID    : {config.PROJECT_ID}")
    print(f"Credentials   : {config.CREDENTIALS_PATH}")
    print("=" * 35 + "\n")

    for loc in INDIA_LOCATIONS:
        print(f"\n--- Testing Region: {loc} ({'Mumbai' if loc == 'asia-south1' else 'Delhi'}) ---")
        os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "true"
        os.environ["GOOGLE_CLOUD_PROJECT"] = config.PROJECT_ID
        os.environ["GOOGLE_CLOUD_LOCATION"] = loc
        if config.CREDENTIALS_PATH:
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = config.CREDENTIALS_PATH

        from google import genai
        client = genai.Client()

        for model_id in MODELS_TO_CHECK:
            try:
                response = client.models.generate_content(
                    model=model_id,
                    contents="Ping! Reply with 'OK'.",
                )
                reply = response.text.strip() if response.text else "No text returned"
                print(f"  [SUCCESS] {model_id:<22} -> Reply: {reply}")
            except Exception as e:
                err_msg = str(e)
                if "404" in err_msg or "NotFound" in err_msg:
                    print(f"  [NOT FOUND] {model_id:<22} -> Endpoint not available in {loc}")
                elif "403" in err_msg or "PermissionDenied" in err_msg:
                    print(f"  [PERMISSION DENIED] {model_id:<22} -> Missing IAM permission in {loc}")
                elif "429" in err_msg or "RESOURCE_EXHAUSTED" in err_msg:
                    print(f"  [QUOTA LIMIT] {model_id:<22} -> Endpoint active, quota limited")
                else:
                    print(f"  [ERROR] {model_id:<22} -> {err_msg[:60]}")

if __name__ == "__main__":
    check_access()
