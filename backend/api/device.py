import logging
from typing import Optional
from fastapi import APIRouter, HTTPException

from backend.memory.memory_manager import memory_manager
from backend.models import (
    DeviceRegisterRequest,
    UserUpdateRequest,
    DeviceRenameRequest,
)

logger = logging.getLogger("cup_work.api.device")

router = APIRouter(tags=["User & Device Identity"])


@router.get("/api/device/status")
@router.get("/api/device/check")
async def check_device_status(deviceId: str):
    info = memory_manager.is_device_registered(deviceId)
    if info:
        return {"registered": True, "exists": True, **info}
    from backend.storage.sqlite_store import SqliteStore
    suggested_name = SqliteStore.generate_random_username()
    return {
        "registered": False,
        "exists": False,
        "deviceId": deviceId,
        "suggestedUserName": suggested_name,
    }


@router.post("/api/device/register")
@router.post("/api/user/register")
async def register_device_or_user(req: DeviceRegisterRequest):
    identity = memory_manager.get_or_create_identity(
        device_id=req.deviceId,
        user_id=req.userId,
        device_name=req.deviceName,
        device_type=req.deviceType or "desktop",
        os_info=req.osInfo,
    )
    return {"success": True, **identity}


@router.get("/api/user/profile")
async def get_user_profile(userId: str):
    profile = memory_manager.get_user_profile(userId)
    if not profile:
        raise HTTPException(status_code=404, detail=f"User '{userId}' not found.")
    return {"success": True, "profile": profile}


@router.patch("/api/user/profile")
async def update_user_profile(req: UserUpdateRequest):
    ok = memory_manager.update_user_name(req.userId, req.name) if req.name else True
    profile = memory_manager.get_user_profile(req.userId)
    return {"success": ok, "profile": profile}


@router.patch("/api/device/rename")
async def rename_device(req: DeviceRenameRequest):
    ok = memory_manager.update_device_name(req.deviceId, req.deviceName)
    return {"success": ok, "deviceId": req.deviceId, "deviceName": req.deviceName}
