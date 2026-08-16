import asyncio
import base64
import json
import logging
import subprocess
import uuid
from typing import Any, Dict, Optional, Set
from fastapi import WebSocket
from backend.config import config

logger = logging.getLogger("hey_jave.bridge")

class ElectronBridge:
    """
    Bridge connecting the Python Agent Brain to the Electron client
    for real-time tool execution, live event streaming, and native automation.
    """

    def __init__(self):
        self._clients: Set[WebSocket] = set()
        self._pending_requests: Dict[str, asyncio.Future] = {}
        self._uia_engine_path = config.ROOT_DIR / "src" / "bridge" / "uia-engine.ps1"

    def register_client(self, websocket: WebSocket):
        self._clients.add(websocket)
        logger.info(f"Electron client connected. Total clients: {len(self._clients)}")

    def unregister_client(self, websocket: WebSocket):
        self._clients.discard(websocket)
        logger.info(f"Electron client disconnected. Total clients: {len(self._clients)}")

    @property
    def has_active_client(self) -> bool:
        return len(self._clients) > 0

    async def broadcast(self, message: Dict[str, Any]):
        """Broadcasts a JSON message to all connected Electron frontends."""
        if not self._clients:
            return
        payload = json.dumps(message)
        dead_clients = set()
        for client in self._clients:
            try:
                await client.send_text(payload)
            except Exception as e:
                logger.warning(f"Error sending message to client: {e}")
                dead_clients.add(client)
        for dead in dead_clients:
            self._clients.discard(dead)

    def handle_client_message(self, data: Dict[str, Any]):
        """Processes responses received from the Electron frontend."""
        msg_type = data.get("type")
        req_id = data.get("id")

        if msg_type in ("TOOL_RESULT", "HUMAN_RESPONSE", "ACTION_RESULT") and req_id:
            future = self._pending_requests.pop(req_id, None)
            if future and not future.done():
                future.set_result(data.get("result", data))
        else:
            logger.debug(f"Received unhandled client message: {data}")

    async def execute_tool(self, tool_name: str, args: Dict[str, Any], task_id: str = "") -> Dict[str, Any]:
        """
        Executes a desktop tool via the connected Electron frontend.
        If no Electron client is connected via WebSocket, falls back to direct PowerShell execution.
        """
        req_id = str(uuid.uuid4())
        logger.info(f"Executing tool '{tool_name}' (task={task_id}, req={req_id}) with args: {args}")

        # If Electron client is connected, dispatch over WebSocket
        if self.has_active_client:
            loop = asyncio.get_running_loop()
            future = loop.create_future()
            self._pending_requests[req_id] = future

            msg = {
                "type": "TOOL_EXECUTE",
                "id": req_id,
                "taskId": task_id,
                "tool": tool_name,
                "args": args
            }
            await self.broadcast(msg)

            try:
                timeout = (config.UIA_TIMEOUT_MS / 1000.0) + 15.0 # extra buffer for complex UI ops
                result = await asyncio.wait_for(future, timeout=timeout)
                return result if isinstance(result, dict) else {"success": True, "result": result}
            except asyncio.TimeoutError:
                self._pending_requests.pop(req_id, None)
                logger.error(f"Tool execution timed out for {tool_name} (req={req_id})")
                return {"success": False, "error": f"Tool execution timed out after {timeout}s"}
            except Exception as e:
                self._pending_requests.pop(req_id, None)
                logger.error(f"Tool execution error for {tool_name}: {e}")
                return {"success": False, "error": str(e)}

        # Direct PowerShell fallback execution
        logger.info(f"No active WebSocket client. Falling back to direct PowerShell execution for {tool_name}.")
        return await self._execute_direct_powershell(tool_name, args)

    async def _execute_direct_powershell(self, tool_name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Directly invokes uia-engine.ps1 via PowerShell subprocess."""
        if not self._uia_engine_path.exists():
            return {"success": False, "error": f"UIA engine not found at {self._uia_engine_path}"}

        # Map tool name to UIA engine action
        action_map = {
            "minimize_all_windows": "MINIMIZE_ALL",
            "minimize_window": "MINIMIZE_WINDOW",
            "focus_window": "FOCUS_WINDOW",
            "launch_app": "LAUNCH_APP",
            "press_hotkey": "PRESS_HOTKEY",
            "uia_click": "UIA_CLICK",
            "uia_type": "UIA_TYPE",
            "mouse_move": "MOUSE_MOVE",
            "mouse_click": "MOUSE_CLICK",
            "keyboard_type": "KEYBOARD_TYPE",
            "keyboard_key": "KEYBOARD_KEY",
            "get_open_windows": "GET_WINDOWS",
            "get_active_window": "GET_ACTIVE_WINDOW",
            "restore_window": "RESTORE_WINDOW",
            "resize_window": "RESIZE_WINDOW",
            "read_clipboard": "READ_CLIPBOARD",
            "write_clipboard": "WRITE_CLIPBOARD",
            "execute_command": "EXECUTE_COMMAND",
            "get_process_list": "GET_PROCESS_LIST",
            "kill_process": "KILL_PROCESS",
            "take_screenshot": "TAKE_SCREENSHOT",
            "screenshot_region": "SCREENSHOT_REGION",
            "get_screen_resolution": "GET_SCREEN_RESOLUTION",
            "scroll": "SCROLL",
            "drag_drop": "DRAG_DROP",
            "uia_get_tree": "UIA_GET_TREE",
            "uia_get_text": "UIA_GET_TEXT",
            "show_screenpad": "SHOW_SCRATCHPAD",
            "ask_human": "ASK_HUMAN",
            "highlight_box": "HIGHLIGHT_BOX",
            "show_annotations": "SHOW_ANNOTATIONS",
            "clear_annotations": "CLEAR_ANNOTATIONS",
        }

        # Handle wait_seconds natively
        if tool_name == "wait_seconds":
            secs = float(args.get("seconds", 2))
            await asyncio.sleep(secs)
            return {"success": True, "message": f"Waited {secs} seconds"}

        action = action_map.get(tool_name, tool_name.upper())
        params = dict(args)

        # Normalize parameter names if needed
        if tool_name in ("minimize_window", "focus_window", "restore_window", "resize_window"):
            params["title"] = params.pop("windowTitle", "")
        elif tool_name in ("uia_click", "uia_type", "uia_get_text"):
            params["name"] = params.pop("elementName", "")

        payload_json = json.dumps({"action": action, "params": params})
        b64_payload = base64.b64encode(payload_json.encode("utf-8")).decode("utf-8")

        cmd = [
            "powershell.exe",
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy", "Bypass",
            "-File", str(self._uia_engine_path),
            "-Base64", b64_payload
        ]

        def _run_sub():
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
            if proc.returncode != 0:
                raise RuntimeError(f"PowerShell error: {proc.stderr}")
            return json.loads(proc.stdout.strip())

        try:
            res = await asyncio.to_thread(_run_sub)
            return res
        except Exception as e:
            logger.error(f"Direct PowerShell execution error: {e}")
            return {"success": False, "error": str(e)}

electron_bridge = ElectronBridge()
