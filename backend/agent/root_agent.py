from __future__ import annotations

from google.adk.agents import LlmAgent

from backend.agents import (
    clarification_agent,
    main_executor_adk_agent,
    research_agent,
    scratchpad_agent,
    strange_planner,
)
from backend.config import config

ROOT_INSTRUCTION = """You are Hey Jave, a Windows desktop AI assistant.

Route each user request to the most appropriate specialist:

- main_executor: any task that must control the Windows desktop, applications,
  files, windows, or the screen.
- research: questions that need current, web-grounded information or
  comparison of sources.
- scratchpad: focused analysis of a specific error or problem and a proposed
  command or fix.
- strange_planner: strategic/visual planning such as moves, layouts, documents,
  or on-screen guidance.
- clarification: ask the user for missing information.

If the request is a simple conversational question, answer it directly without
transferring. For everything else, transfer to exactly one specialist using the
transfer_to_agent tool, and do not add extra commentary before transferring.
"""

root_agent = LlmAgent(
    name="root",
    description="Top-level router for Hey Jave.",
    model=config.DEFAULT_MODEL,
    instruction=ROOT_INSTRUCTION,
    sub_agents=[
        main_executor_adk_agent,
        clarification_agent,
        scratchpad_agent,
        research_agent,
        strange_planner,
    ],
)
