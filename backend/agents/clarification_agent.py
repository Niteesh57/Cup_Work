from __future__ import annotations

from typing import Optional

from google.adk.agents import LlmAgent
from google.adk.tools import ToolContext

from backend.agent.hitl_manager import hitl_manager
from backend.config import config


async def ask_user_question(
    question: str,
    options: Optional[list[str]] = None,
    tool_context: ToolContext = None,
) -> dict[str, str]:
    """Asks the user a single question and waits for their answer."""
    user_id = tool_context.user_id if tool_context else "default"
    task_id = str(tool_context.state.get("task_id", "")) if tool_context else ""
    answer = await hitl_manager.ask(
        question=question,
        options=options or [],
        task_id=task_id,
        user_id=user_id,
    )
    return {"answer": answer or ""}


clarification_agent = LlmAgent(
    name="clarification",
    description=(
        "Asks the user one clarifying question at a time when the main executor "
        "cannot proceed safely without more information."
    ),
    model=config.DEFAULT_MODEL,
    instruction=(
        "You are the Clarification Agent. Ask the user exactly ONE question at a "
        "time using the ask_user_question tool, then wait for the answer before "
        "asking the next one. Prefer multiple-choice options when the possible "
        "answers are finite. Once you have enough information, return a concise "
        "summary of the collected answers so the executor can continue."
    ),
    tools=[ask_user_question],
)
