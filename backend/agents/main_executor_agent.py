from __future__ import annotations

from typing import AsyncGenerator, Optional

from google.adk.agents import BaseAgent
from google.adk.agents.invocation_context import InvocationContext
from google.adk.events import Event
from google.genai import types

from backend.agent.executor import main_executor_agent


import base64


def _extract_content_parts(content: Optional[types.Content]) -> tuple[str, list[types.Part]]:
    if not content or not content.parts:
        return "", []
    text_parts = []
    other_parts = []
    for p in content.parts:
        if p.text:
            text_parts.append(p.text)
        elif p.inline_data:
            other_parts.append(p)
    return "\n".join(text_parts).strip(), other_parts


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
        text_prompt, inline_parts = _extract_content_parts(ctx.user_content)
        prompt = text_prompt or "Execute the requested desktop action."

        audio_b64 = None
        image_b64 = None
        mime_type = "audio/wav"
        for ip in inline_parts:
            if ip.inline_data:
                m = ip.inline_data.mime_type or ""
                if "audio" in m and ip.inline_data.data:
                    audio_b64 = base64.b64encode(ip.inline_data.data).decode("utf-8")
                    mime_type = ip.inline_data.mime_type or "audio/wav"
                elif "image" in m and ip.inline_data.data:
                    image_b64 = base64.b64encode(ip.inline_data.data).decode("utf-8")

        user_id = ctx.user_id or "default"
        task_id = str(ctx.session.state.get("task_id", "")) or f"adk-{ctx.invocation_id[:8]}"

        result = await main_executor_agent.execute_prompt(
            prompt=prompt,
            audio_base64=audio_b64,
            image_base64=image_b64,
            mime_type=mime_type,
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
