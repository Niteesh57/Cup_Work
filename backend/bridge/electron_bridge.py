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
    Bridge connecting the Python Agent Brain to Electron clients
    for multi-device real-time tool execution, live event streaming, and native automation.
    Routes events (TTS audio, tool actions, UI highlights) strictly to the initiating device.
    """

    def __init__(self):
        self._clients: Set[WebSocket] = set()
        self._device_clients: Dict[str, WebSocket] = {}
        self._client_devices: Dict[WebSocket, str] = {}
        self._task_device_map: Dict[str, str] = {}
        self._pending_requests: Dict[str, asyncio.Future] = {}
        self._uia_engine_path = config.ROOT_DIR / "src" / "bridge" / "uia-engine.ps1"

    def register_client(self, websocket: WebSocket, device_id: Optional[str] = None):
        self._clients.add(websocket)
        if device_id:
            self._device_clients[device_id] = websocket
            self._client_devices[websocket] = device_id
        logger.info(f"Electron client connected (device={device_id}). Total clients: {len(self._clients)}")

    def register_device_client(self, device_id: str, websocket: WebSocket):
        if not device_id:
            return
        self._device_clients[device_id] = websocket
        self._client_devices[websocket] = device_id
        self._clients.add(websocket)
        logger.info(f"Registered WebSocket for device '{device_id}'. Total device mappings: {len(self._device_clients)}")

    def associate_task_device(self, task_id: str, device_id: str):
        if task_id and device_id:
            self._task_device_map[task_id] = device_id

    def get_device_for_task(self, task_id: str) -> Optional[str]:
        return self._task_device_map.get(task_id)

    def unregister_client(self, websocket: WebSocket):
        self._clients.discard(websocket)
        dev_id = self._client_devices.pop(websocket, None)
        if dev_id and self._device_clients.get(dev_id) == websocket:
            self._device_clients.pop(dev_id, None)
        logger.info(f"Electron client disconnected (device={dev_id}). Total clients: {len(self._clients)}")

    @property
    def has_active_client(self) -> bool:
        return len(self._clients) > 0

    def has_client_for_device(self, device_id: str) -> bool:
        return device_id in self._device_clients

    async def broadcast(self, message: Dict[str, Any], target_device_id: Optional[str] = None, task_id: Optional[str] = None):
        """
        Sends a JSON message to the targeted device or all frontends.
        If target_device_id or task_id is present, routes EXCLUSIVELY to that device's socket
        so other connected users/devices never experience cross-talk or unwanted TTS speech.
        """
        if not self._clients:
            return

        dev_id = target_device_id or message.get("deviceId")
        if not dev_id:
            t_id = task_id or message.get("taskId")
            if t_id:
                dev_id = self._task_device_map.get(t_id)

        # Targeted dispatch to specific device
        if dev_id and dev_id in self._device_clients:
            target_ws = self._device_clients[dev_id]
            try:
                await target_ws.send_text(json.dumps(message))
                return
            except Exception as e:
                logger.warning(f"Error sending message to targeted device '{dev_id}': {e}")
                self.unregister_client(target_ws)

        # Fallback broadcast to all connected clients if untargeted or target socket disconnected
        payload = json.dumps(message)
        dead_clients = set()
        for client in list(self._clients):
            try:
                await client.send_text(payload)
            except Exception as e:
                logger.warning(f"Error sending message to client: {e}")
                dead_clients.add(client)
        for dead in dead_clients:
            self.unregister_client(dead)

    def handle_client_message(self, data: Dict[str, Any], websocket: Optional[WebSocket] = None):
        """Processes responses received from the Electron frontend."""
        msg_type = data.get("type")
        req_id = data.get("id")

        if msg_type == "REGISTER_DEVICE" and websocket:
            dev_id = str(data.get("deviceId", ""))
            if dev_id:
                self.register_device_client(dev_id, websocket)
            return

        if msg_type in ("TOOL_RESULT", "HUMAN_RESPONSE", "ACTION_RESULT") and req_id:
            future = self._pending_requests.pop(req_id, None)
            if future and not future.done():
                future.set_result(data.get("result", data))
        else:
            logger.debug(f"Received unhandled client message: {data}")

    async def execute_tool(self, tool_name: str, args: Dict[str, Any], task_id: str = "", device_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Executes a desktop tool via the connected Electron frontend for the specific initiating device.
        """
        req_id = str(uuid.uuid4())
        target_device = device_id or self.get_device_for_task(task_id)
        logger.info(f"Executing tool '{tool_name}' (task={task_id}, device={target_device}, req={req_id}) with args: {args}")

        # If no client currently registered, give a short grace window (up to 2.5s)
        if not self.has_active_client:
            for _ in range(12):
                if self.has_active_client:
                    break
                await asyncio.sleep(0.2)

        # If Electron client is connected, dispatch over WebSocket to the specific device
        if self.has_active_client:
            loop = asyncio.get_running_loop()
            future = loop.create_future()
            self._pending_requests[req_id] = future

            msg = {
                "type": "TOOL_EXECUTE",
                "id": req_id,
                "taskId": task_id,
                "deviceId": target_device,
                "tool": tool_name,
                "args": args
            }
            await self.broadcast(msg, target_device_id=target_device, task_id=task_id)

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

        # Fail closed for browser and local resolution tools
        if tool_name in ("smart_ui_action", "resolve_element") or tool_name.startswith("browser_"):
            logger.warning(f"No active WebSocket client connected. Cannot execute local tool '{tool_name}'.")
            return {
                "success": False,
                "error": f"Electron client is offline. Tool '{tool_name}' requires active Electron WebSocket connection."
            }

        # Direct PowerShell fallback execution for standalone OS/UIA tools
        logger.info(f"No active WebSocket client. Falling back to direct PowerShell execution for {tool_name}.")
        return await self._execute_direct_powershell(tool_name, args)

    async def _execute_direct_powershell(self, tool_name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Directly invokes uia-engine.ps1 via PowerShell subprocess."""
        if not self._uia_engine_path.exists():
            return {"success": False, "error": f"UIA engine not found at {self._uia_engine_path}"}

        # speak_sync requires the Electron main-process SAPI bridge. When no
        # WebSocket client is connected, fail fast instead of blocking on a
        # subprocess that has no handler.
        if tool_name == "speak_sync":
            return {"success": False, "error": "No Electron client connected for speak_sync"}

        # Browser DOM tools require the Electron main-process CDP bridge.
        if tool_name.startswith("browser_"):
            return {"success": False, "error": f"No Electron client connected for {tool_name}"}

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
            "uia_get_interactive_elements": "GET_INTERACTIVE_ELEMENTS",
            "uia_search_elements": "SEARCH_ELEMENTS",
            "uia_inspect_element_at": "INSPECT_ELEMENT_AT",
            "uia_get_text": "UIA_GET_TEXT",
            "uia_find": "UIA_FIND",
            "uia_invoke": "UIA_INVOKE",
            "uia_set_value": "UIA_SET_VALUE",
            "uia_select": "UIA_SELECT",
            "uia_toggle": "UIA_TOGGLE",
            "uia_expand": "UIA_EXPAND",
            "uia_scroll_into_view": "UIA_SCROLL_INTO_VIEW",
            "show_screenpad": "SHOW_SCRATCHPAD",
            "ask_human": "ASK_HUMAN",
            "highlight_box": "HIGHLIGHT_BOX",
            "show_annotations": "SHOW_ANNOTATIONS",
            "clear_annotations": "CLEAR_ANNOTATIONS",
            "speak_sync": "SPEAK_SYNC",
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
        elif tool_name in (
            "uia_click", "uia_type", "uia_get_text", "uia_find", "uia_invoke",
            "uia_set_value", "uia_select", "uia_toggle", "uia_expand",
            "uia_scroll_into_view",
        ):
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
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
            if proc.returncode != 0:
                raise RuntimeError(f"PowerShell error: {proc.stderr}")
            raw = proc.stdout.strip()
            if not raw:
                return {"success": True}
            # Clean control characters (0x00-0x1F excluding standard \r,\n,\t) to prevent JSON decode failures
            import re
            clean = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', ' ', raw)
            return json.loads(clean, strict=False)

        try:
            res = await asyncio.to_thread(_run_sub)
            return res
        except Exception as e:
            logger.error(f"Direct PowerShell execution error: {e}")
            return {"success": False, "error": str(e)}

electron_bridge = ElectronBridge()
