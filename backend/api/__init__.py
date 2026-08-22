from fastapi import APIRouter

from backend.api.system import router as system_router
from backend.api.device import router as device_router
from backend.api.agent import router as agent_router
from backend.api.voice import router as voice_router
from backend.api.session import router as session_router
from backend.api.todos import router as todos_router
from backend.api.memory import router as memory_router

api_router = APIRouter()

api_router.include_router(system_router)
api_router.include_router(device_router)
api_router.include_router(agent_router)
api_router.include_router(voice_router)
api_router.include_router(session_router)
api_router.include_router(todos_router)
api_router.include_router(memory_router)

__all__ = [
    "api_router",
    "system_router",
    "device_router",
    "agent_router",
    "voice_router",
    "session_router",
    "todos_router",
    "memory_router",
]
