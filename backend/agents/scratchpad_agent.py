from __future__ import annotations

from google.adk.agents import LlmAgent

from backend.agents._tools import show_screenpad_tool
from backend.config import config


scratchpad_agent = LlmAgent(
    name="scratchpad",
    description=(
        "Analyzes a specific problem (such as a shell error) and proposes a fix "
        "or command, showing it to the user through the ScreenPad."
    ),
    model=config.DEFAULT_MODEL,
    instruction=(
        "You are the Scratchpad Agent. Analyze the given problem in a focused way, "
        "produce the smallest viable fix or command, and show it with "
        "show_screenpad_tool. Use content_type 'command' for shell commands and "
        "'code' or 'markdown' otherwise. Then briefly explain the solution."
    ),
    tools=[show_screenpad_tool],
)
