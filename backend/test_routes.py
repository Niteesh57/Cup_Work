import sys
from pathlib import Path

root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from fastapi.testclient import TestClient
from backend.server import app

client = TestClient(app)

def test_routes():
    print("Testing All FastAPI Modular Routes and Security Sanitization...")

    # 1. System & Health
    res = client.get("/health")
    assert res.status_code == 200 and res.json()["status"] == "ok"

    # 2. Config Security (Confidential Key Sanitization)
    res = client.get("/api/config")
    assert res.status_code == 200
    cfg = res.json()
    assert "geminiApiKey" not in cfg, "CRITICAL: geminiApiKey leaked in /api/config!"
    assert "apiKey" not in cfg, "CRITICAL: apiKey leaked in /api/config!"
    assert cfg["geminiModel"] is not None
    assert cfg["geminiVoice"] is not None

    res = client.post("/api/config", json={"geminiVoice": "Fenrir"})
    assert res.status_code == 200 and res.json()["success"] is True

    # 3. Models
    res = client.get("/api/models")
    assert res.status_code == 200 and len(res.json()["models"]) > 0

    # 4. Device & User Identity
    res = client.get("/api/device/status?deviceId=test_dev_001")
    assert res.status_code == 200

    res = client.post("/api/device/register", json={"deviceId": "test_dev_001", "deviceName": "Test Device"})
    assert res.status_code == 200 and res.json()["success"] is True
    user_id = res.json()["userId"]

    res = client.get(f"/api/user/profile?userId={user_id}")
    assert res.status_code == 200 and res.json()["success"] is True

    res = client.patch("/api/user/profile", json={"userId": user_id, "name": "TestUserRenamed"})
    assert res.status_code == 200 and res.json()["success"] is True

    res = client.patch("/api/device/rename", json={"deviceId": "test_dev_001", "deviceName": "Renamed Device"})
    assert res.status_code == 200 and res.json()["success"] is True

    # 5. Voice
    res = client.get("/api/voice/tts-voices")
    assert res.status_code == 200 and len(res.json()["voices"]) > 0

    # 6. Session
    res = client.get(f"/api/session/today?userId={user_id}&deviceId=test_dev_001")
    assert res.status_code == 200 and "messages" in res.json()

    res = client.post("/api/session/save-message", json={
        "userId": user_id,
        "deviceId": "test_dev_001",
        "role": "user",
        "text": "Hello test message",
    })
    assert res.status_code == 200 and res.json()["success"] is True

    # 7. Todos
    res = client.post("/api/todos", json={
        "userId": user_id,
        "deviceId": "test_dev_001",
        "title": "Test modular todo",
        "priority": "high"
    })
    assert res.status_code == 200 and res.json()["success"] is True
    todo_id = res.json()["task"]["id"]

    res = client.get(f"/api/todos/today?userId={user_id}&deviceId=test_dev_001")
    assert res.status_code == 200 and res.json()["counts"]["total"] >= 1

    res = client.post("/api/todos/toggle", json={"taskId": todo_id, "userId": user_id, "deviceId": "test_dev_001"})
    assert res.status_code == 200 and res.json()["success"] is True

    res = client.patch(f"/api/todos/{todo_id}", json={"userId": user_id, "title": "Updated todo title"})
    assert res.status_code == 200 and res.json()["success"] is True

    res = client.delete(f"/api/todos/{todo_id}?userId={user_id}")
    assert res.status_code == 200 and res.json()["success"] is True

    # 8. Memory & Preferences
    res = client.post("/api/preferences", json={
        "userId": user_id,
        "deviceId": "test_dev_001",
        "key": "theme",
        "value": "dark"
    })
    assert res.status_code == 200 and res.json()["success"] is True

    res = client.get(f"/api/preferences?userId={user_id}")
    assert res.status_code == 200 and len(res.json()["preferences"]) >= 1

    res = client.get(f"/api/user/context?userId={user_id}&deviceId=test_dev_001")
    assert res.status_code == 200 and "agentContext" in res.json()

    print("[PASS] All endpoints in backend/api/ verified successfully!")

if __name__ == "__main__":
    test_routes()
