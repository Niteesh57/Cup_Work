from __future__ import annotations

from google.adk.agents import LlmAgent

from backend.agents._tools import show_screenpad_tool
from backend.config import config


scratchpad_agent = LlmAgent(
    name="scratchpad",
    description=(
        "Analyzes problems, errors, codebase insights, or documentation, "
        "and presents formatted Markdown cards or shell command cards on the on-screen Windows Scratchpad."
    ),
    model=config.DEFAULT_MODEL,
    instruction=(
        "You are the Scratchpad Agent. Present focused fixes, codebase insights, documentation, or commands:\n"
        "- Use content_type 'markdown' for codebase overviews, architectural notes, explanations, and formatted markdown with headings (`#`, `##`, `###`), bold text (`**bold**`), and bullet points (`- `).\n"
        "- Use content_type 'command' for runnable shell commands.\n"
        "- Call `show_screenpad_tool` with a concise title, message, and content."
    ),
    tools=[show_screenpad_tool],
)
