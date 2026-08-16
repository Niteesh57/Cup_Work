from __future__ import annotations

from typing import AsyncGenerator, Optional

from google.adk.agents import BaseAgent
from google.adk.agents.invocation_context import InvocationContext
from google.adk.events import Event
from google.genai import types

from backend.agent.executor import main_executor_agent


def _extract_text(content: Optional[types.Content]) -> str:
    if not content or not content.parts:
        return ""
    return "\n".join(p.text for p in content.parts if p.text).strip()


class MainExecutorAdkAgent(BaseAgent):
    """ADK wrapper around the imperative desktop executor.

    The executor keeps its own observe/act/verify loop, HITL suspension, and
    SQLite persistence. This class only adapts its result into an ADK event so
    the root agent can route to it as a specialist.
    """

    def __init__(self, **kwargs) -> None:
        super().__init__(
            name="main_executor",
            description=(
                "Runs Windows desktop automation tasks end to end using the "
                "observe, plan, act, and verify loop."
            ),
            **kwargs,
        )

    async def _run_async_impl(
        self, ctx: InvocationContext
    ) -> AsyncGenerator[Event, None]:
        prompt = _extract_text(ctx.user_content)
        if not prompt:
            prompt = "Do nothing and report success."

        user_id = ctx.user_id or "default"
        task_id = str(ctx.session.state.get("task_id", "")) or f"adk-{ctx.invocation_id[:8]}"

        result = await main_executor_agent.execute_prompt(
            prompt=prompt,
            task_id=task_id,
            user_id=user_id,
        )

        text = str(result.get("message") or "Task complete.")
        ctx.set_agent_state(self.name, end_of_agent=True)
        yield Event(
            invocation_id=ctx.invocation_id,
            author=self.name,
            branch=ctx.branch,
            content=types.Content(
                role="model",
                parts=[types.Part.from_text(text=text)],
            ),
        )


main_executor_adk_agent = MainExecutorAdkAgent()
