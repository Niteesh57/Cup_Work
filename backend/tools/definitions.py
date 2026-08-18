from typing import List, Dict, Any
from google.genai import types

# Tool definitions for Google GenAI SDK
DESKTOP_FUNCTION_DECLARATIONS = [
    types.FunctionDeclaration(
        name="open_url",
        description="Directly opens any web URL or search query in the user's default browser. ALWAYS prefer this for opening websites, playing YouTube videos, searching Google/YouTube, articles, etc. in 1 single step.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "url": types.Schema(
                    type=types.Type.STRING,
                    description="The complete URL or search URL (e.g. 'https://www.youtube.com/results?search_query=best+LLM+tutorial' or 'https://google.com')"
                )
            },
            required=["url"]
        )
    ),
    types.FunctionDeclaration(
        name="minimize_all_windows",
        description="Minimizes all currently active desktop windows, taking the user to the Desktop.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={}
        )
    ),
    types.FunctionDeclaration(
        name="minimize_window",
        description="Minimizes a specific application window by matching its title.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "windowTitle": types.Schema(
                    type=types.Type.STRING,
                    description='Title or partial title of the window to minimize (e.g. "Notepad", "Chrome", "Calculator")'
                )
            },
            required=["windowTitle"]
        )
    ),
    types.FunctionDeclaration(
        name="focus_window",
        description="Brings a specific application window to the foreground.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "windowTitle": types.Schema(
                    type=types.Type.STRING,
                    description="Title or partial title of the window to bring to front"
                )
            },
            required=["windowTitle"]
        )
    ),
    types.FunctionDeclaration(
        name="launch_app",
        description="Launches a Windows application by name or executable path (e.g., 'notepad', 'calc', 'chrome', 'explorer', 'cmd').",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "appName": types.Schema(
                    type=types.Type.STRING,
                    description="Executable name or path to start (e.g. 'notepad', 'calc', 'cmd', 'explorer')"
                )
            },
            required=["appName"]
        )
    ),
    types.FunctionDeclaration(
        name="press_hotkey",
        description="Triggers a keyboard shortcut (e.g. CTRL+l to focus address bar in browser, CTRL+t for new tab, WIN+d for desktop, ALT+tab).",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "modifier": types.Schema(
                    type=types.Type.STRING,
                    description="Modifier key: WIN, ALT, CTRL, or SHIFT"
                ),
                "key": types.Schema(
                    type=types.Type.STRING,
                    description="Key char or name (e.g. 'l', 't', 'd', 'r', 'tab')"
                )
            },
            required=["modifier", "key"]
        )
    ),
    types.FunctionDeclaration(
        name="uia_click",
        description=(
            "Clicks on a UI element (button, checkbox, menu item, tab) by its accessible name "
            "using Windows UI Automation. Use this for native application chrome and stable "
            "named controls. When interacting with web page content or when multiple similar "
            "elements exist (e.g. YouTube search bar vs. browser address bar), use mouse_click "
            "with exact pixel coordinates instead."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "elementName": types.Schema(
                    type=types.Type.STRING,
                    description="Accessible label, title, or button text"
                ),
                "controlType": types.Schema(
                    type=types.Type.STRING,
                    description="Optional UIA control type (e.g. 'Button', 'Edit', 'MenuItem', 'TabItem')"
                )
            },
            required=["elementName"]
        )
    ),
    types.FunctionDeclaration(
        name="uia_type",
        description=(
            "Types text into an active input field by its accessible name. Use for native "
            "application fields. For web page inputs where multiple edit fields may exist, "
            "first click the exact field with mouse_click at pixel coordinates, then use "
            "keyboard_type for the text."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "elementName": types.Schema(
                    type=types.Type.STRING,
                    description="Accessible name or description of the field"
                ),
                "text": types.Schema(
                    type=types.Type.STRING,
                    description="Text string to type into the input field"
                )
            },
            required=["elementName", "text"]
        )
    ),
    types.FunctionDeclaration(
        name="mouse_move",
        description="Directly moves the mouse cursor to absolute screen coordinates (x, y).",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "x": types.Schema(type=types.Type.INTEGER, description="Absolute horizontal pixel coordinate"),
                "y": types.Schema(type=types.Type.INTEGER, description="Absolute vertical pixel coordinate")
            },
            required=["x", "y"]
        )
    ),
    types.FunctionDeclaration(
        name="mouse_click",
        description=(
            "Triggers a native OS mouse click at coordinates (x, y). "
            "NOTE: For desktop buttons and menus, PREFER `uia_invoke`, `uia_click`, or `smart_ui_action`. "
            "For web pages (YouTube, Google, cloud consoles), PREFER `browser_click` or `smart_ui_action`. "
            "Only use `mouse_click` as a fallback when an element has no accessible UIA node or DOM selector."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "x": types.Schema(type=types.Type.INTEGER, description="Absolute horizontal pixel coordinate"),
                "y": types.Schema(type=types.Type.INTEGER, description="Absolute vertical pixel coordinate"),
                "button": types.Schema(type=types.Type.STRING, description="Click type: 'left', 'right', or 'double'")
            },
            required=["x", "y"]
        )
    ),
    types.FunctionDeclaration(
        name="keyboard_type",
        description="Direct low-level keyboard text entry into active focus.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "text": types.Schema(type=types.Type.STRING, description="Text string to type directly")
            },
            required=["text"]
        )
    ),
    types.FunctionDeclaration(
        name="keyboard_key",
        description="Presses a low-level virtual key or special key (e.g. ENTER, ESC, BACKSPACE, TAB).",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "key": types.Schema(type=types.Type.STRING, description="Key name (e.g. ENTER, ESC, TAB, BACKSPACE)")
            },
            required=["key"]
        )
    ),
    types.FunctionDeclaration(
        name="get_open_windows",
        description="Queries the list of currently open top-level desktop windows with titles and coordinates.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={}
        )
    ),
    types.FunctionDeclaration(
        name="take_screenshot",
        description="Captures a fresh screenshot of the primary desktop display.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={}
        )
    ),
    types.FunctionDeclaration(
        name="scroll",
        description="Scrolls the mouse wheel. Negative delta scrolls down, positive scrolls up.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "delta": types.Schema(type=types.Type.INTEGER, description="Scroll amount. Negative = down, positive = up."),
                "x": types.Schema(type=types.Type.INTEGER, description="Optional target X coordinate"),
                "y": types.Schema(type=types.Type.INTEGER, description="Optional target Y coordinate")
            },
            required=["delta"]
        )
    ),
    types.FunctionDeclaration(
        name="highlight_box",
        description="Draw a colored step-guide box on screen to visually guide the user without auto-clicking.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "x": types.Schema(type=types.Type.INTEGER, description="Left position in screen pixels"),
                "y": types.Schema(type=types.Type.INTEGER, description="Top position in screen pixels"),
                "width": types.Schema(type=types.Type.INTEGER, description="Width in pixels"),
                "height": types.Schema(type=types.Type.INTEGER, description="Height in pixels"),
                "color": types.Schema(type=types.Type.STRING, description="Box color: 'cyan' | 'magenta' | 'yellow' | 'green' | 'red'"),
                "label": types.Schema(type=types.Type.STRING, description="Step guide label text"),
                "stepNumber": types.Schema(type=types.Type.INTEGER, description="Step order number")
            },
            required=["x", "y", "width", "height", "color", "label"]
        )
    ),
    types.FunctionDeclaration(
        name="show_screenpad",
        description="Show a command, code snippet, or markdown in the ScreenPad overlay so the user can copy or review it.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "title": types.Schema(type=types.Type.STRING, description="Title in ScreenPad header"),
                "content": types.Schema(type=types.Type.STRING, description="The text, code, or command to display"),
                "type": types.Schema(type=types.Type.STRING, description="Content type: 'command' | 'code' | 'markdown'"),
                "message": types.Schema(type=types.Type.STRING, description="Optional header message")
            },
            required=["title", "content"]
        )
    ),
    types.FunctionDeclaration(
        name="ask_human",
        description="Pause and ask the user a clarifying question before continuing.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "question": types.Schema(type=types.Type.STRING, description="The question to ask the user"),
                "options": types.Schema(
                    type=types.Type.ARRAY,
                    items=types.Schema(type=types.Type.STRING),
                    description="Optional list of choices"
                )
            },
            required=["question"]
        )
    ),
    types.FunctionDeclaration(
        name="wait_seconds",
        description="Wait/sleep for N seconds before continuing (e.g. waiting for an app to load).",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "seconds": types.Schema(type=types.Type.INTEGER, description="Number of seconds to wait")
            },
            required=["seconds"]
        )
    ),
    types.FunctionDeclaration(
        name="get_active_window",
        description="Returns the title and bounds of the current foreground window.",
        parameters=types.Schema(type=types.Type.OBJECT, properties={})
    ),
    types.FunctionDeclaration(
        name="restore_window",
        description="Restores a minimized window by matching its title.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "windowTitle": types.Schema(type=types.Type.STRING, description="Title or partial title of the window to restore")
            },
            required=["windowTitle"]
        )
    ),
    types.FunctionDeclaration(
        name="resize_window",
        description="Sets the position and size of a window by title.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "windowTitle": types.Schema(type=types.Type.STRING, description="Title or partial title of the window"),
                "x": types.Schema(type=types.Type.INTEGER, description="Left position in pixels"),
                "y": types.Schema(type=types.Type.INTEGER, description="Top position in pixels"),
                "width": types.Schema(type=types.Type.INTEGER, description="Width in pixels"),
                "height": types.Schema(type=types.Type.INTEGER, description="Height in pixels")
            },
            required=["windowTitle", "x", "y", "width", "height"]
        )
    ),
    types.FunctionDeclaration(
        name="read_clipboard",
        description="Returns the current clipboard text.",
        parameters=types.Schema(type=types.Type.OBJECT, properties={})
    ),
    types.FunctionDeclaration(
        name="write_clipboard",
        description="Sets the clipboard to the given text.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "text": types.Schema(type=types.Type.STRING, description="Text to copy to the clipboard")
            },
            required=["text"]
        )
    ),
    types.FunctionDeclaration(
        name="execute_command",
        description="Runs a shell command and returns stdout, stderr, and exit code. Non-allowlisted commands require user confirmation.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "command": types.Schema(type=types.Type.STRING, description="Shell command to execute"),
                "timeoutSeconds": types.Schema(type=types.Type.INTEGER, description="Optional timeout in seconds")
            },
            required=["command"]
        )
    ),
    types.FunctionDeclaration(
        name="get_process_list",
        description="Returns running processes with name, PID, CPU, and memory.",
        parameters=types.Schema(type=types.Type.OBJECT, properties={})
    ),
    types.FunctionDeclaration(
        name="kill_process",
        description="Terminates a process by name or PID. Always requires user confirmation.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "name": types.Schema(type=types.Type.STRING, description="Process name"),
                "pid": types.Schema(type=types.Type.INTEGER, description="Process ID")
            }
        )
    ),
    types.FunctionDeclaration(
        name="screenshot_region",
        description="Captures a specific screen region as base64 PNG.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "x": types.Schema(type=types.Type.INTEGER, description="Left position in pixels"),
                "y": types.Schema(type=types.Type.INTEGER, description="Top position in pixels"),
                "width": types.Schema(type=types.Type.INTEGER, description="Width in pixels"),
                "height": types.Schema(type=types.Type.INTEGER, description="Height in pixels")
            },
            required=["x", "y", "width", "height"]
        )
    ),
    types.FunctionDeclaration(
        name="get_screen_resolution",
        description="Returns the width and height of the primary display.",
        parameters=types.Schema(type=types.Type.OBJECT, properties={})
    ),
    types.FunctionDeclaration(
        name="drag_drop",
        description="Drags the mouse from (x1,y1) to (x2,y2) and drops.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "x1": types.Schema(type=types.Type.INTEGER, description="Start X"),
                "y1": types.Schema(type=types.Type.INTEGER, description="Start Y"),
                "x2": types.Schema(type=types.Type.INTEGER, description="End X"),
                "y2": types.Schema(type=types.Type.INTEGER, description="End Y")
            },
            required=["x1", "y1", "x2", "y2"]
        )
    ),
    types.FunctionDeclaration(
        name="uia_get_tree",
        description="Dumps the UIA element tree of the focused window as JSON, including element bounding boxes and center coordinates.",
        parameters=types.Schema(type=types.Type.OBJECT, properties={})
    ),
    types.FunctionDeclaration(
        name="uia_get_interactive_elements",
        description=(
            "Retrieves a structured list of actionable interactive UI elements (buttons, edit fields, "
            "links, tabs, checkboxes, menus) currently visible on screen or in a window, with their exact "
            "bounding boxes [x, y, width, height] and center coordinates (centerX, centerY). "
            "Use this to find where any UI object or button is located before clicking or placing highlight boxes."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "windowTitle": types.Schema(type=types.Type.STRING, description="Optional window title to scope search"),
                "maxElements": types.Schema(type=types.Type.INTEGER, description="Max elements to return (default 60)")
            }
        )
    ),
    types.FunctionDeclaration(
        name="uia_search_elements",
        description=(
            "Searches for UI elements matching a keyword or text across names, AutomationIds, "
            "and control types in the active window or desktop. Returns exact bounding boxes and center coordinates. "
            "You can call this multiple times in parallel to search for multiple UI objects at once."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "query": types.Schema(type=types.Type.STRING, description="Search term, button name, label, or AutomationId (e.g. 'Search', 'Close', 'Submit')"),
                "windowTitle": types.Schema(type=types.Type.STRING, description="Optional window title to scope search"),
                "maxResults": types.Schema(type=types.Type.INTEGER, description="Max results (default 30)")
            },
            required=["query"]
        )
    ),
    types.FunctionDeclaration(
        name="uia_get_text",
        description="Reads text from a named UIA element.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "elementName": types.Schema(type=types.Type.STRING, description="Accessible name of the element")
            },
            required=["elementName"]
        )
    ),
    types.FunctionDeclaration(
        name="uia_find",
        description=(
            "Finds a Windows UI Automation element by AutomationId first, then Name + "
            "ControlType, and returns its bounds, enabled/visible state, and supported "
            "control patterns. Use this to inspect a control before acting on it, and "
            "to get exact bounds for a fallback physical click. Scoped to the focused "
            "window (or windowTitle) before the desktop root."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "elementName": types.Schema(type=types.Type.STRING, description="Accessible name or label (e.g. 'Save', 'Search')"),
                "automationId": types.Schema(type=types.Type.STRING, description="Stable AutomationId if known"),
                "controlType": types.Schema(type=types.Type.STRING, description="UIA control type (e.g. 'Button', 'Edit', 'MenuItem', 'TabItem')"),
                "windowTitle": types.Schema(type=types.Type.STRING, description="Optional window title to scope the search")
            }
        )
    ),
    types.FunctionDeclaration(
        name="uia_invoke",
        description=(
            "Activates a Button/MenuItem/etc. via the Windows UIA Invoke pattern WITHOUT "
            "moving the mouse. PREFER THIS for native app buttons, menus, tabs, and links. "
            "Falls back to SelectionItem, then a center click."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "elementName": types.Schema(type=types.Type.STRING, description="Accessible name of the control to invoke"),
                "automationId": types.Schema(type=types.Type.STRING, description="Stable AutomationId if known"),
                "controlType": types.Schema(type=types.Type.STRING, description="UIA control type hint (e.g. 'Button', 'MenuItem')"),
                "windowTitle": types.Schema(type=types.Type.STRING, description="Optional window title to scope the search")
            }
        )
    ),
    types.FunctionDeclaration(
        name="uia_set_value",
        description=(
            "Sets text directly in a native Edit field via the Windows UIA Value pattern. "
            "PREFER THIS over keyboard_type for native input boxes."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "elementName": types.Schema(type=types.Type.STRING, description="Accessible name of the field"),
                "automationId": types.Schema(type=types.Type.STRING, description="Stable AutomationId if known"),
                "controlType": types.Schema(type=types.Type.STRING, description="UIA control type hint (e.g. 'Edit')"),
                "windowTitle": types.Schema(type=types.Type.STRING, description="Optional window title to scope the search"),
                "text": types.Schema(type=types.Type.STRING, description="Text to set into the field")
            },
            required=["text"]
        )
    ),
    types.FunctionDeclaration(
        name="uia_select",
        description="Selects a native list item, radio button, or tab via the Windows UIA SelectionItem pattern.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "elementName": types.Schema(type=types.Type.STRING, description="Accessible name of the item to select"),
                "automationId": types.Schema(type=types.Type.STRING, description="Stable AutomationId if known"),
                "controlType": types.Schema(type=types.Type.STRING, description="UIA control type hint (e.g. 'ListItem', 'RadioButton', 'TabItem')"),
                "windowTitle": types.Schema(type=types.Type.STRING, description="Optional window title to scope the search")
            }
        )
    ),
    types.FunctionDeclaration(
        name="uia_toggle",
        description="Toggles a native checkbox or switch via the Windows UIA Toggle pattern.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "elementName": types.Schema(type=types.Type.STRING, description="Accessible name of the toggleable control"),
                "automationId": types.Schema(type=types.Type.STRING, description="Stable AutomationId if known"),
                "controlType": types.Schema(type=types.Type.STRING, description="UIA control type hint (e.g. 'CheckBox')"),
                "windowTitle": types.Schema(type=types.Type.STRING, description="Optional window title to scope the search")
            }
        )
    ),
    types.FunctionDeclaration(
        name="uia_expand",
        description="Expands a native menu, tree node, or combo box via the Windows UIA ExpandCollapse pattern.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "elementName": types.Schema(type=types.Type.STRING, description="Accessible name of the expandable control"),
                "automationId": types.Schema(type=types.Type.STRING, description="Stable AutomationId if known"),
                "controlType": types.Schema(type=types.Type.STRING, description="UIA control type hint (e.g. 'MenuItem', 'TreeItem', 'ComboBox')"),
                "windowTitle": types.Schema(type=types.Type.STRING, description="Optional window title to scope the search")
            }
        )
    ),
    types.FunctionDeclaration(
        name="uia_scroll_into_view",
        description="Scrolls a native control into view via the Windows UIA ScrollItem pattern before acting on it.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "elementName": types.Schema(type=types.Type.STRING, description="Accessible name of the target"),
                "automationId": types.Schema(type=types.Type.STRING, description="Stable AutomationId if known"),
                "controlType": types.Schema(type=types.Type.STRING, description="UIA control type hint"),
                "windowTitle": types.Schema(type=types.Type.STRING, description="Optional window title to scope the search")
            }
        )
    ),
    types.FunctionDeclaration(
        name="uia_inspect_element_at",
        description="Inspects the low-level UI component directly under coordinate (x, y), returning exact name, controlType, bounding rectangle, and box_2d.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "x": types.Schema(type=types.Type.NUMBER, description="X coordinate (pixels or 0..1000 normalized)"),
                "y": types.Schema(type=types.Type.NUMBER, description="Y coordinate (pixels or 0..1000 normalized)"),
                "normalized": types.Schema(type=types.Type.BOOLEAN, description="Set true if x,y are in 0..1000 scale")
            },
            required=["x", "y"]
        )
    ),
    # ── Parallel local element resolution ──────────────────────────────────
    types.FunctionDeclaration(
        name="resolve_element",
        description=(
            "Locates a requested screen element without clicking it. The target PC joins "
            "Windows UI Automation, active-window/display metadata, and—when an already "
            "debuggable Chrome/Edge tab is active—DOM evidence in parallel. Returns ranked "
            "candidates, confidence, a screen fingerprint, and whether action is safe. "
            "PREFER this over screenshots and coordinate guessing when the target is unclear."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "description": types.Schema(type=types.Type.STRING, description="Human description, e.g. 'YouTube search field'"),
                "name": types.Schema(type=types.Type.STRING, description="Visible/accessibility label if known"),
                "role": types.Schema(type=types.Type.STRING, description="Expected role: button, input, textbox, link, tab, checkbox, radio, menuitem, listitem"),
                "selector": types.Schema(type=types.Type.STRING, description="Known CSS selector for browser content"),
                "automationId": types.Schema(type=types.Type.STRING, description="Known stable Windows AutomationId"),
                "controlType": types.Schema(type=types.Type.STRING, description="Expected Windows UIA control type"),
                "windowTitle": types.Schema(type=types.Type.STRING, description="Optional title used to scope native UIA search")
            }
        )
    ),
    types.FunctionDeclaration(
        name="smart_ui_action",
        description=(
            "Resolves and performs one low-risk UI action locally in a single guarded operation. "
            "It runs UIA/DOM/screen probes in parallel, blocks ambiguous or low-confidence "
            "targets, confirms the active-window fingerprint has not changed, then uses a "
            "semantic DOM or UIA action—not a raw coordinate click. Use this as the DEFAULT "
            "for clicking, typing, selecting, toggling, expanding, or scrolling to a known target."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "action": types.Schema(type=types.Type.STRING, description="One of: click, type, select, toggle, expand, scroll_into_view"),
                "text": types.Schema(type=types.Type.STRING, description="Required only when action is type"),
                "target": types.Schema(
                    type=types.Type.OBJECT,
                    properties={
                        "description": types.Schema(type=types.Type.STRING),
                        "name": types.Schema(type=types.Type.STRING),
                        "role": types.Schema(type=types.Type.STRING),
                        "selector": types.Schema(type=types.Type.STRING),
                        "automationId": types.Schema(type=types.Type.STRING),
                        "controlType": types.Schema(type=types.Type.STRING),
                        "windowTitle": types.Schema(type=types.Type.STRING)
                    }
                )
            },
            required=["action", "target"]
        )
    ),
    types.FunctionDeclaration(
        name="show_annotations",
        description="Draws multiple colored boxes, arrows, and step labels on screen.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "boxes": types.Schema(
                    type=types.Type.ARRAY,
                    items=types.Schema(type=types.Type.OBJECT),
                    description="Array of boxes with x, y, width, height, color, label, stepNumber"
                ),
                "arrows": types.Schema(
                    type=types.Type.ARRAY,
                    items=types.Schema(type=types.Type.OBJECT),
                    description="Array of arrows with fromX, fromY, toX, toY, color, label"
                ),
                "durationSeconds": types.Schema(type=types.Type.NUMBER, description="Auto-dismiss seconds (0 = wait for click/ESC)")
            },
            required=["boxes"]
        )
    ),
    types.FunctionDeclaration(
        name="clear_annotations",
        description="Programmatically closes all active annotation overlay windows.",
        parameters=types.Schema(type=types.Type.OBJECT, properties={})
    ),
    # ── Browser DOM tools (via Chrome DevTools Protocol) ────────────────────
    # For web pages (Chrome/Edge), drive the DOM directly. These are far more
    # accurate than mouse_click because they target the actual element, not a
    # guessed pixel coordinate.
    types.FunctionDeclaration(
        name="browser_navigate",
        description="Navigates the active Chrome/Edge tab to a URL. PREFER THIS over typing into the address bar.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "url": types.Schema(type=types.Type.STRING, description="Full URL, e.g. https://www.youtube.com")
            },
            required=["url"]
        )
    ),
    types.FunctionDeclaration(
        name="browser_search",
        description=(
            "Performs a web search in the browser and navigates straight to the results "
            "page. Works on Google (default), YouTube (site='youtube'), Bing, DuckDuckGo, "
            "and Wikipedia. PREFER THIS over typing into a search box — it avoids fragile "
            "site-specific selectors and key-press timing."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "query": types.Schema(type=types.Type.STRING, description="The search text, e.g. 'best LLM tutorial'"),
                "site": types.Schema(type=types.Type.STRING, description="Optional target site: 'google', 'youtube', 'bing', 'duckduckgo', 'wikipedia'")
            },
            required=["query"]
        )
    ),
    types.FunctionDeclaration(
        name="browser_get_url",
        description="Returns the current URL of the active browser tab.",
        parameters=types.Schema(type=types.Type.OBJECT, properties={})
    ),
    types.FunctionDeclaration(
        name="browser_find_element",
        description=(
            "Finds a DOM element by CSS selector and returns its text, value, "
            "visibility, and exact bounding box. Use this to locate the search "
            "bar or a video result before acting."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "selector": types.Schema(type=types.Type.STRING, description="CSS selector, e.g. 'input#search', 'input[name=q]', 'a#video-title'")
            },
            required=["selector"]
        )
    ),
    types.FunctionDeclaration(
        name="browser_set_value",
        description=(
            "Sets the value of a DOM input/textarea directly (fires input+change events). "
            "PREFER THIS over keyboard_type for web search boxes."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "selector": types.Schema(type=types.Type.STRING, description="CSS selector of the input"),
                "text": types.Schema(type=types.Type.STRING, description="Text to set")
            },
            required=["selector", "text"]
        )
    ),
    types.FunctionDeclaration(
        name="browser_click",
        description="Clicks a DOM element by CSS selector (scrolls it into view first). PREFER THIS over mouse_click for web page buttons, links, and search icons.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "selector": types.Schema(type=types.Type.STRING, description="CSS selector of the element to click")
            },
            required=["selector"]
        )
    ),
    types.FunctionDeclaration(
        name="browser_press_key",
        description="Dispatches a key press (Enter, Escape, etc.) on a DOM element or the focused element.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "selector": types.Schema(type=types.Type.STRING, description="Optional CSS selector; defaults to focused element"),
                "key": types.Schema(type=types.Type.STRING, description="Key name, e.g. 'Enter', 'Escape', 'Tab'")
            },
            required=["key"]
        )
    ),
    types.FunctionDeclaration(
        name="browser_get_text",
        description="Returns the visible text of a DOM element by CSS selector.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "selector": types.Schema(type=types.Type.STRING, description="CSS selector")
            },
            required=["selector"]
        )
    ),
    types.FunctionDeclaration(
        name="browser_list_elements",
        description="Lists up to 30 DOM elements matching a CSS selector with their text, href, visibility, and center coordinates.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "selector": types.Schema(type=types.Type.STRING, description="CSS selector, e.g. 'ytd-video-renderer', 'a'")
            },
            required=["selector"]
        )
    ),
    types.FunctionDeclaration(
        name="browser_wait_for_selector",
        description="Waits up to timeoutMs for a DOM element matching a CSS selector to appear (e.g. page loaded, search results rendered).",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "selector": types.Schema(type=types.Type.STRING, description="CSS selector to wait for"),
                "timeoutMs": types.Schema(type=types.Type.INTEGER, description="Max wait in milliseconds (default 8000)")
            },
            required=["selector"]
        )
    ),
]

def get_desktop_tools() -> List[types.Tool]:
    """Returns the list of GenAI tools wrapping all desktop automation functions."""
    return [types.Tool(function_declarations=DESKTOP_FUNCTION_DECLARATIONS)]
