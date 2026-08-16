from typing import List, Dict, Any
from google.genai import types

# Tool definitions for Google GenAI SDK
DESKTOP_FUNCTION_DECLARATIONS = [
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
        description="Clicks on a UI element (button, checkbox, menu item, tab) using Windows UI Automation.",
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
        description="Types text into an active input field or targeted window.",
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
        description="Triggers a native mouse click at coordinates (x, y). Supports 'left', 'right', or 'double'.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "x": types.Schema(type=types.Type.INTEGER, description="Absolute horizontal coordinate"),
                "y": types.Schema(type=types.Type.INTEGER, description="Absolute vertical coordinate"),
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
    )
]

def get_desktop_tools() -> List[types.Tool]:
    """Returns the list of GenAI tools wrapping all desktop automation functions."""
    return [types.Tool(function_declarations=DESKTOP_FUNCTION_DECLARATIONS)]
