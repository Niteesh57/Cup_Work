import logging
from typing import Any, Dict, Optional
from fastapi import APIRouter, HTTPException, Body

from backend.events.event_bus import EventType, event_bus
from backend.memory.memory_manager import memory_manager
from backend.models import CreateTodoRequest, UpdateTodoRequest

logger = logging.getLogger("cup_work.api.todos")

router = APIRouter(tags=["Todo Tasks"])


@router.get("/api/todos/today")
async def get_today_todos(userId: str = "default", deviceId: Optional[str] = None):
    """Returns today's active & completed tasks with summary counts."""
    todos = memory_manager.get_all_todos(user_id=userId, device_id=deviceId)
    pending = [t for t in todos if t.get("status") != "completed"]
    done = [t for t in todos if t.get("status") == "completed"]
    return {
        "success": True,
        "userId": userId,
        "counts": {
            "total": len(todos),
            "pending": len(pending),
            "done": len(done),
        },
        "tasks": todos,
    }


@router.post("/api/todos/toggle")
async def toggle_todo_status(data: Dict[str, Any] = Body(...)):
    """Toggles a task between completed and pending status."""
    task_id = str(data.get("taskId") or data.get("id") or "")
    user_id = str(data.get("userId") or "default")
    target_status = data.get("status")
    device_id = data.get("deviceId")

    all_todos = memory_manager.get_all_todos(user_id=user_id, device_id=device_id)
    target_task = next((t for t in all_todos if t.get("id") == task_id), None)
    if not target_task:
        raise HTTPException(status_code=404, detail="Task not found")

    if not target_status:
        target_status = "pending" if target_task.get("status") == "completed" else "completed"

    updated = memory_manager.update_todo(task_id=task_id, user_id=user_id, status=target_status)

    # Broadcast updated counts & tasks
    refreshed = memory_manager.get_all_todos(user_id=user_id, device_id=device_id)
    pending = [t for t in refreshed if t.get("status") != "completed"]
    done = [t for t in refreshed if t.get("status") == "completed"]
    counts = {
        "total": len(refreshed),
        "pending": len(pending),
        "done": len(done),
    }
    await event_bus.publish(
        EventType.TODO_UPDATED,
        {
            "userId": user_id,
            "deviceId": device_id,
            "counts": counts,
            "tasks": refreshed,
        },
    )
    return {"success": True, "task": updated, "counts": counts}


@router.post("/api/todos/clear-today")
async def clear_today_todos_endpoint(data: Dict[str, Any] = Body(default={})):
    """Wipes all todo tasks for the current user."""
    user_id = str(data.get("userId") or "usr_local")
    device_id = data.get("deviceId")
    memory_manager.clear_all_todos(user_id=user_id)
    empty_counts = {"total": 0, "pending": 0, "done": 0}
    await event_bus.publish(
        EventType.TODO_UPDATED,
        {
            "userId": user_id,
            "deviceId": device_id,
            "counts": empty_counts,
            "tasks": [],
        },
    )
    return {"success": True, "message": "All todos cleared.", "counts": empty_counts, "tasks": []}


@router.get("/api/todos")
async def list_todos(
    userId: str = "default",
    status: Optional[str] = None,
    priority: Optional[str] = None,
    deviceId: Optional[str] = None,
):
    todos = memory_manager.get_all_todos(
        user_id=userId, status=status, priority=priority, device_id=deviceId
    )
    return {"userId": userId, "todos": todos, "count": len(todos)}


@router.post("/api/todos")
async def create_todo(req: CreateTodoRequest):
    task = memory_manager.create_todo(
        user_id=req.userId or "default",
        title=req.title,
        description=req.description,
        priority=req.priority or "medium",
        due_date=req.dueDate,
        tags=req.tags,
        device_id=req.deviceId or "desktop-main",
    )
    # Broadcast updated counts & tasks
    refreshed = memory_manager.get_all_todos(
        user_id=req.userId or "default", device_id=req.deviceId or "desktop-main"
    )
    pending = [t for t in refreshed if t.get("status") != "completed"]
    done = [t for t in refreshed if t.get("status") == "completed"]
    await event_bus.publish(
        EventType.TODO_UPDATED,
        {
            "userId": req.userId or "default",
            "deviceId": req.deviceId or "desktop-main",
            "counts": {
                "total": len(refreshed),
                "pending": len(pending),
                "done": len(done),
            },
            "tasks": refreshed,
        },
    )
    return {"success": True, "task": task}


@router.patch("/api/todos/{task_id}")
async def update_todo(task_id: str, req: UpdateTodoRequest):
    user_id = req.userId or "default"
    updated = memory_manager.update_todo(
        task_id=task_id,
        user_id=user_id,
        status=req.status,
        priority=req.priority,
        title=req.title,
        description=req.description,
        due_date=req.dueDate,
        tags=req.tags,
    )
    if not updated:
        raise HTTPException(
            status_code=404, detail=f"Todo task '{task_id}' not found for user '{user_id}'."
        )

    # Broadcast updated counts & tasks
    refreshed = memory_manager.get_all_todos(user_id=user_id)
    pending = [t for t in refreshed if t.get("status") != "completed"]
    done = [t for t in refreshed if t.get("status") == "completed"]
    await event_bus.publish(
        EventType.TODO_UPDATED,
        {
            "userId": user_id,
            "counts": {
                "total": len(refreshed),
                "pending": len(pending),
                "done": len(done),
            },
            "tasks": refreshed,
        },
    )
    return {"success": True, "task": updated}


@router.delete("/api/todos/{task_id}")
async def delete_todo(task_id: str, userId: str = "default"):
    ok = memory_manager.delete_todo(task_id=task_id, user_id=userId)
    if not ok:
        raise HTTPException(
            status_code=404, detail=f"Todo task '{task_id}' not found for user '{userId}'."
        )
    return {"success": True, "taskId": task_id}
