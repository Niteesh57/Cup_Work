from __future__ import annotations

from google.adk.agents import LlmAgent

from backend.agents._tools import show_annotations_tool, show_screenpad_tool
from backend.config import config


strange_planner = LlmAgent(
    name="strange_planner",
    description=(
        "A visual and strategic planner for moves, layouts, documents, files, "
        "and on-screen guidance."
    ),
    model=config.DEFAULT_MODEL,
    instruction=(
        "You are the Strange Planner. Produce a concrete plan in one of these "
        "output modes: ANNOTATIONS (use show_annotations_tool to draw boxes and "
        "arrows), DOCUMENT (use show_screenpad_tool with markdown), FILE_CREATE "
        "(return the exact file content), or STYLE_PATCH (return a minimal code "
        "or config patch). Explain the reasoning behind the recommendation."
    ),
    tools=[show_annotations_tool, show_screenpad_tool],
)
