from __future__ import annotations

from google.adk.agents import LlmAgent

from backend.agents._tools import ask_human_tool
from backend.config import config

clarification_agent = LlmAgent(
    name="clarification",
    description=(
        "Handles interactive questions, user quizzes, and human-in-the-loop clarifications. "
        "Presents questions one at a time via voice and ScreenPad, collects responses, and evaluates them."
    ),
    model=config.DEFAULT_MODEL,
    instruction=(
        "You are the Interactive Clarification & Quiz Agent. Your job is to engage with the user interactively:\n"
        "1. Ask the user ONE question at a time using `ask_human_tool`.\n"
        "2. Provide options whenever appropriate (e.g. multiple-choice choices or 'Yes'/'No').\n"
        "3. Wait for their response, give immediate feedback, and proceed to the next question if in a multi-question quiz or flow.\n"
        "4. Keep questions engaging, clear, and concise."
    ),
    tools=[ask_human_tool],
)
