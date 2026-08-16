
from __future__ import annotations

from google.adk.agents import LlmAgent
from google.adk.tools.google_search_tool import GoogleSearchTool

from backend.config import config


research_agent = LlmAgent(
    name="research",
    description=(
        "Performs web-grounded research, gathers and compares sources, and "
        "returns a structured, sourced summary."
    ),
    model=config.DEFAULT_MODEL,
    instruction=(
        "You are the Research Agent. Use google_search to find current and "
        "authoritative information. Gather multiple sources when the topic is "
        "complex, compare them, and synthesize a clear answer. Cite the sources "
        "you used. If a claim is uncertain, say so."
    ),
    tools=[GoogleSearchTool()],
)
