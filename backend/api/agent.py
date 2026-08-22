import uuid
import logging
from fastapi import APIRouter, HTTPException

from backend.agents import main_executor_agent, executor_manager
from backend.bridge.electron_bridge import electron_bridge
from backend.memory.memory_manager import memory_manager
from backend.adk_runner import adk_runner
from backend.models import ChatRequest, StopRequest

logger = logging.getLogger("cup_work.api.agent")

router = APIRouter(tags=["Agent Execution"])


@router.post("/api/agent/chat")
async def execute_chat(req: ChatRequest):
    has_audio = bool(req.audioBase64)
    # Mandatory identity resolution: auto-creates random friendly user name if new device/user
    identity = memory_manager.get_or_create_identity(
        device_id=req.deviceId,
        user_id=req.userId,
        device_name=req.deviceName,
    )
    user_id = identity["userId"]
    device_id = identity["deviceId"]
    task_id = req.taskId or f"task-{uuid.uuid4().hex[:8]}"
    electron_bridge.associate_task_device(task_id, device_id)

    logger.info(
        f"Received chat request: user={user_id} ({identity['userName']}), "
        f"device={device_id} ({identity['deviceName']}), task={task_id}, "
        f"prompt={req.prompt!r}, has_audio={has_audio}"
    )
    if not req.prompt and not has_audio:
        raise HTTPException(status_code=400, detail="Either prompt or audioBase64 must be provided.")

    try:
        res = await adk_runner.run(
            prompt=req.prompt,
            audio_base64=req.audioBase64,
            mime_type=req.mimeType,
            user_id=user_id,
            device_id=device_id,
            task_id=task_id,
        )
        if isinstance(res, dict):
            res["userId"] = user_id
            res["deviceId"] = device_id
            res["userName"] = identity["userName"]
            res["deviceName"] = identity["deviceName"]
        return res
    except Exception as e:
        logger.exception(f"ADK route failed, falling back to direct executor: {e}")
        res = await main_executor_agent.execute_prompt(
            prompt=req.prompt or "Execute user's spoken voice command.",
            audio_base64=req.audioBase64,
            mime_type=req.mimeType,
            task_id=task_id,
            user_id=user_id,
            device_id=device_id,
        )
        if isinstance(res, dict):
            res["userId"] = user_id
            res["deviceId"] = device_id
            res["userName"] = identity["userName"]
            res["deviceName"] = identity["deviceName"]
        return res


@router.post("/api/agent/stop")
async def stop_chat(req: StopRequest):
    executor_manager.cancel(req.taskId)
    return {"success": True, "taskId": req.taskId}


@router.post("/api/agent/pause/{task_id}")
async def pause_task(task_id: str):
    ok = executor_manager.pause(task_id)
    return {"success": ok, "taskId": task_id, "message": "Paused" if ok else "Task not found"}


@router.post("/api/agent/resume/{task_id}")
async def resume_task(task_id: str):
    ok = executor_manager.resume(task_id)
    return {"success": ok, "taskId": task_id, "message": "Resumed" if ok else "Task not found"}


@router.post("/api/agent/cancel/{task_id}")
async def cancel_task(task_id: str):
    ok = executor_manager.cancel(task_id)
    return {"success": ok, "taskId": task_id, "message": "Cancelled" if ok else "Task not found"}
