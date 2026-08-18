from __future__ import annotations

import asyncio
import base64
import logging
import struct
from typing import AsyncGenerator, Optional

from google.adk.agents import BaseAgent
from google.adk.agents.invocation_context import InvocationContext
from google.adk.events import Event
from google.genai import types

from backend.config import config
from backend.core.client import get_genai_client
from backend.bridge.electron_bridge import electron_bridge
from backend.agent.hitl_manager import hitl_manager

logger = logging.getLogger("hey_jave.strange_planner")


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


PLANNER_SYSTEM_INSTRUCTION = """You are Strange Planner, an expert visual and strategic AI advisor for games (Chess, strategy games, board games), cloud consoles (AWS, GCP, Azure), desktop applications, and on-screen workflows.

CORE CAPABILITIES & DIRECTIVES:
1. LOW-LEVEL DISPLAY COMPONENT GROUNDING (ZERO MANUAL CALCULATION):
   - NEVER guess coordinates or do fragile manual pixel arithmetic.
   - Use low-level Windows & Browser UI inspection tools in parallel:
     * `uia_search_elements_tool`: Fast query by label, name, piece, button, or class (e.g. "Knight", "Play", "Console", "Instance").
     * `uia_get_interactive_elements_tool`: Retrieves all actionable UI controls on screen with pre-computed `box_2d: [ymin, xmin, ymax, xmax]`.
     * `uia_inspect_element_at_tool`: Inspects the exact low-level UI component under any point on screen.
   - Every element returned includes exact screen pixel bounds `{ x, y, width, height, centerX, centerY }` AND pre-calculated `box_2d: [ymin, xmin, ymax, xmax]` normalized 0..1000.
   - Use these exact OS display coordinates directly with `show_annotations_tool` for 100% precision.

2. CHESS & STRATEGY GAME ANALYSIS:
   - YOU ARE A MASTER-LEVEL CHESS STRATEGIST AND ADVISOR.
   - When the user asks for a move suggestion, next move, or tactical advice:
     * ALWAYS analyze the board and recommend the best tactical or positional move.
     * Identify the pieces, assess development, king safety, center control, pins, and tactics.
     * Determine the single best move for the active player.
     * Ground the origin piece and target destination on the board:
       - Column / File: `a=0, b=1, c=2, d=3, e=4, f=5, g=6, h=7`
       - Row / Rank (White at bottom): `row = 8 - rank` (Rank 1 = bottom row 7, Rank 8 = top row 0)
       - If board outer visual edges are `board_xmin, board_xmax, board_ymin, board_ymax`:
         `w = (board_xmax - board_xmin) / 8`, `h = (board_ymax - board_ymin) / 8`
         `square_xmin = board_xmin + col * w`, `square_ymin = board_ymin + row * h`
         `square_xmax = square_xmin + w`, `square_ymax = square_ymin + h`
     * Call `show_annotations_tool` with:
       - Step 1 box (`color: "cyan"`, `label: "1: [Piece] on [Square]"`, e.g. "1: Knight on b1") on the piece.
       - Step 2 box (`color: "green"`, `label: "2: Move to [Square]"`, e.g. "2: Move to c3") on the destination square.
       - Directional arrow pointing from the piece center to the destination square center (`fromX, fromY` -> `toX, toY`).
     * Speak your recommendation clearly (e.g. "I recommend moving your knight to c3 to develop the piece and contest the central squares.").

3. DESKTOP APPS & CLOUD WORKFLOW GUIDANCE:
   - For buttons, menus, cloud portals, and desktop applications:
     * Search and locate target controls using `uia_search_elements_tool` or `uia_get_interactive_elements_tool`.
     * Pass the element's pre-calculated `box_2d` directly to `show_annotations_tool`.
     * Sequence multi-step guidance with sequential numbers (`stepNumber: 1, 2, 3...`) and arrows.

4. CLARIFICATION & HUMAN-IN-THE-LOOP:
   - If player side/color (White vs Black), role, or intent is genuinely ambiguous, use `ask_human_tool` with clear options.
"""

ANNOTATION_DECLARATIONS = [
    types.FunctionDeclaration(
        name="ask_human_tool",
        description=(
            "Prompts the user with a clarifying question and selectable options via voice/ScreenPad. "
            "Call this whenever the game, application, side/role, persona, or user intent is ambiguous."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "question": types.Schema(type=types.Type.STRING, description="The clarifying question to ask the user"),
                "options": types.Schema(
                    type=types.Type.ARRAY,
                    items=types.Schema(type=types.Type.STRING),
                    description="Optional list of choices (e.g. ['White', 'Black'], ['Aggressive', 'Defensive'])",
                ),
            },
            required=["question"],
        ),
    ),
    types.FunctionDeclaration(
        name="uia_get_interactive_elements_tool",
        description="Retrieves actionable interactive UI elements (buttons, inputs, tabs, menus, controls) on screen with exact bounding boxes and pre-calculated box_2d.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "windowTitle": types.Schema(type=types.Type.STRING, description="Optional window title"),
                "maxElements": types.Schema(type=types.Type.INTEGER, description="Max elements (default 60)")
            }
        )
    ),
    types.FunctionDeclaration(
        name="uia_search_elements_tool",
        description="Searches UI elements by text, name, class, or AutomationId in parallel. Returns exact screen bounds and pre-calculated box_2d.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "query": types.Schema(type=types.Type.STRING, description="Search term, button label, or control text"),
                "windowTitle": types.Schema(type=types.Type.STRING, description="Optional window title")
            },
            required=["query"]
        )
    ),
    types.FunctionDeclaration(
        name="uia_inspect_element_at_tool",
        description="Inspects the low-level UI element directly under screen coordinates (x, y), returning exact name, controlType, bounding rectangle, and box_2d.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "x": types.Schema(type=types.Type.NUMBER, description="X coordinate"),
                "y": types.Schema(type=types.Type.NUMBER, description="Y coordinate"),
                "normalized": types.Schema(type=types.Type.BOOLEAN, description="Set true if x,y are in 0..1000 scale")
            },
            required=["x", "y"]
        )
    ),
    types.FunctionDeclaration(
        name="show_annotations_tool",
        description=(
            "Draws colored highlight boxes, directional arrows, and labels directly on screen. "
            "Use pre-calculated box_2d: [ymin, xmin, ymax, xmax] or bounds from UI tools for 100% precision."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "boxes": types.Schema(
                    type=types.Type.ARRAY,
                    items=types.Schema(
                        type=types.Type.OBJECT,
                        properties={
                            "box_2d": types.Schema(
                                type=types.Type.ARRAY,
                                items=types.Schema(type=types.Type.INTEGER),
                                description="[ymin, xmin, ymax, xmax] integers in normalized 0..1000 coordinates (ymin=top, xmin=left, ymax=bottom, xmax=right)",
                            ),
                            "color": types.Schema(type=types.Type.STRING, description="green, yellow, red, cyan, magenta"),
                            "label": types.Schema(type=types.Type.STRING, description="Badge text or move name (e.g. '1: Knight from b1')"),
                            "stepNumber": types.Schema(type=types.Type.INTEGER, description="Step order 1, 2, 3..."),
                        },
                        required=["box_2d", "color"],
                    ),
                    description="Array of highlight boxes to draw",
                ),
                "arrows": types.Schema(
                    type=types.Type.ARRAY,
                    items=types.Schema(
                        type=types.Type.OBJECT,
                        properties={
                            "fromX": types.Schema(type=types.Type.INTEGER, description="Origin X 0..1000"),
                            "fromY": types.Schema(type=types.Type.INTEGER, description="Origin Y 0..1000"),
                            "toX": types.Schema(type=types.Type.INTEGER, description="Destination X 0..1000"),
                            "toY": types.Schema(type=types.Type.INTEGER, description="Destination Y 0..1000"),
                            "color": types.Schema(type=types.Type.STRING, description="green, yellow, red, cyan"),
                            "label": types.Schema(type=types.Type.STRING, description="Optional arrow label"),
                        },
                        required=["fromX", "fromY", "toX", "toY"],
                    ),
                    description="Array of directional arrows from origin to destination (0..1000)",
                ),
                "duration_seconds": types.Schema(type=types.Type.NUMBER, description="Seconds before auto-dismissing (0.0 = unlimited until closed)"),
            },
            required=["boxes"],
        ),
    ),
    types.FunctionDeclaration(
        name="show_screenpad_tool",
        description="Shows content, strategy analysis, code, or markdown in the on-screen ScreenPad overlay.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "title": types.Schema(type=types.Type.STRING, description="Header title"),
                "content": types.Schema(type=types.Type.STRING, description="Markdown or text content"),
                "content_type": types.Schema(type=types.Type.STRING, description="markdown, code, or command"),
                "message": types.Schema(type=types.Type.STRING, description="Optional subtitle message"),
            },
            required=["title", "content"],
        ),
    ),
]


class StrangePlannerAgent(BaseAgent):
    """Visual and strategic advisor across games, applications, and workflows.

    Captures the screen, clarifies ambiguity with HITL (e.g. side/role/intent),
    and draws precision visual guides and arrows directly on screen.
    """

    def __init__(self, **kwargs) -> None:
        super().__init__(
            name="strange_planner",
            description=(
                "A visual and strategic planner for games, moves, layouts, applications, "
                "and on-screen guidance. Captures the screen, clarifies ambiguity, analyzes "
                "visual state, and draws precision arrow/box suggestions directly on screen."
            ),
            **kwargs,
        )

    async def _run_async_impl(
        self, ctx: InvocationContext
    ) -> AsyncGenerator[Event, None]:
        text_prompt, inline_parts = _extract_content_parts(ctx.user_content)
        prompt = text_prompt or "Analyze the screen and provide strategic visual advice or moves."
        task_id = str(ctx.session.state.get("task_id", "")) or f"adk-{ctx.invocation_id[:8]}"
        user_id = ctx.user_id or "default"
        model = config.DEFAULT_MODEL

        # 1. Retrieve the screen image and user audio directly from user_content context
        raw_image_bytes: Optional[bytes] = None
        audio_parts: list[types.Part] = []

        for ip in inline_parts:
            if ip.inline_data:
                m = ip.inline_data.mime_type or ""
                if "image" in m and ip.inline_data.data:
                    raw_image_bytes = ip.inline_data.data
                elif "audio" in m and ip.inline_data.data:
                    audio_parts.append(ip)

        # Concurrently fetch fresh capture and interactive UI elements from Windows UI tree
        uia_elements_text = ""
        fetch_tasks = []
        if not raw_image_bytes:
            fetch_tasks.append(electron_bridge.execute_tool("take_screenshot", {}, task_id=task_id))
        else:
            fetch_tasks.append(asyncio.sleep(0))
        fetch_tasks.append(electron_bridge.execute_tool("uia_get_interactive_elements", {"maxElements": 40}, task_id=task_id))

        fetch_results = await asyncio.gather(*fetch_tasks, return_exceptions=True)

        if not raw_image_bytes:
            shot_res = fetch_results[0]
            if isinstance(shot_res, dict) and shot_res.get("base64"):
                try:
                    raw_image_bytes = base64.b64decode(shot_res["base64"])
                except Exception as e:
                    logger.warning(f"Could not decode screenshot for planner: {e}")

        uia_res = fetch_results[1]
        if isinstance(uia_res, dict) and uia_res.get("elements"):
            elems = uia_res.get("elements", [])
            lines = ["Visible UI objects & interactive controls (with exact bounding boxes):"]
            for el in elems[:35]:
                name = str(el.get("name", "")).strip()
                ctype = str(el.get("controlType", "")).strip()
                auto_id = str(el.get("automationId", "")).strip()
                b = el.get("bounds", {})
                box_2d = el.get("box_2d")
                cx, cy = b.get("centerX", 0), b.get("centerY", 0)
                x, y, w, h = b.get("x", 0), b.get("y", 0), b.get("width", 0), b.get("height", 0)
                id_str = f" | ID='{auto_id}'" if auto_id else ""
                name_str = f" '{name}'" if name else ""
                box_str = f" | box_2d={box_2d}" if box_2d else ""
                lines.append(f"- [{ctype}]{name_str}{id_str}{box_str} -> Bounds: [x={x}, y={y}, w={w}, h={h}] | Center: ({cx}, {cy})")
            if len(lines) > 1:
                uia_elements_text = "\n".join(lines)

        screen_width = 1920
        screen_height = 1080

        contents: list[types.Content] = []
        parts: list[types.Part] = []
        if raw_image_bytes:
            if len(raw_image_bytes) > 24 and raw_image_bytes[:8] == b"\x89PNG\r\n\x1a\n":
                try:
                    screen_width, screen_height = struct.unpack(">II", raw_image_bytes[16:24])
                except Exception:
                    pass
            parts.append(types.Part.from_bytes(
                data=raw_image_bytes,
                mime_type="image/png",
            ))

        for ap in audio_parts:
            parts.append(ap)

        if uia_elements_text:
            parts.append(types.Part.from_text(text=uia_elements_text))

        parts.append(types.Part.from_text(text=(
            f"Screen Resolution: {screen_width}x{screen_height} pixels.\n"
            f"User Goal: {prompt}\n\n"
            "Instructions:\n"
            "1. Inspect the screenshot, UI elements list above, and any attached user audio.\n"
            "2. Note: The visible interactive UI controls and their precalculated `box_2d` are already provided above in this message. Use these bounds directly in `show_annotations_tool` immediately in a single turn.\n"
            "3. Only use `uia_search_elements_tool` if the target is completely missing from the provided elements list.\n"
            "4. If side/role or player intent is ambiguous, use `ask_human_tool` to ask the user.\n"
            "5. Provide visual guidance with `show_annotations_tool` (green/cyan boxes and directional arrows) and explain your strategic recommendation in a short spoken sentence."
        )))
        contents.append(types.Content(role="user", parts=parts))

        client = get_genai_client()
        final_text = "Check your screen for my suggestion."
        max_turns = 4

        for _ in range(max_turns):
            def _call_model():
                return client.models.generate_content(
                    model=model,
                    contents=contents,
                    config=types.GenerateContentConfig(
                        system_instruction=PLANNER_SYSTEM_INSTRUCTION,
                        tools=[types.Tool(function_declarations=ANNOTATION_DECLARATIONS)],
                        temperature=0.2,
                    ),
                )

            response = await asyncio.to_thread(_call_model)
            candidate = response.candidates[0] if response.candidates else None
            if not candidate or not candidate.content:
                text_parts = [p.text for p in (candidate.content.parts if candidate and candidate.content else []) if p.text]
                if text_parts:
                    final_text = " ".join(text_parts).strip()
                break

            contents.append(candidate.content)
            text_parts = [p.text for p in candidate.content.parts if p.text]
            if text_parts:
                final_text = " ".join(text_parts).strip()

            function_calls = [
                p.function_call for p in candidate.content.parts if p.function_call is not None
            ]

            if not function_calls:
                break

            tool_response_parts: list[types.Part] = []
            hitl_asked = False

            for fc in function_calls:
                args = dict(fc.args) if fc.args else {}
                func_name = fc.name

                if func_name == "ask_human_tool":
                    question = str(args.get("question", "Could you clarify?"))
                    options = list(args.get("options") or [])
                    answer = await hitl_manager.ask(
                        question=question,
                        options=options,
                        task_id=task_id,
                        user_id=user_id,
                    )
                    tool_response_parts.append(
                        types.Part.from_function_response(
                            name=func_name,
                            response={"result": {"success": True, "answer": answer, "question": question}},
                        )
                    )
                    hitl_asked = True

                elif func_name == "uia_get_interactive_elements_tool":
                    res = await electron_bridge.execute_tool(
                        "uia_get_interactive_elements",
                        {"windowTitle": str(args.get("windowTitle", "")), "maxElements": int(args.get("maxElements", 40))},
                        task_id=task_id,
                    )
                    tool_response_parts.append(
                        types.Part.from_function_response(
                            name=func_name,
                            response={"result": res},
                        )
                    )

                elif func_name == "uia_search_elements_tool":
                    res = await electron_bridge.execute_tool(
                        "uia_search_elements",
                        {"query": str(args.get("query", "")), "windowTitle": str(args.get("windowTitle", ""))},
                        task_id=task_id,
                    )
                    tool_response_parts.append(
                        types.Part.from_function_response(
                            name=func_name,
                            response={"result": res},
                        )
                    )

                elif func_name == "show_annotations_tool":
                    boxes = args.get("boxes", [])
                    arrows = args.get("arrows", [])
                    dur = float(args.get("duration_seconds") or 0.0)
                    logger.info(f"show_annotations_tool dispatch: boxes={boxes} arrows={arrows} duration={dur}")
                    await electron_bridge.execute_tool(
                        "show_annotations",
                        {
                            "boxes": boxes,
                            "arrows": arrows,
                            "durationSeconds": dur,
                            "imageWidth": screen_width,
                            "imageHeight": screen_height,
                        },
                        task_id=task_id,
                    )
                    tool_response_parts.append(
                        types.Part.from_function_response(
                            name=func_name,
                            response={"result": {"success": True, "message": "Annotations displayed on screen"}},
                        )
                    )

                elif func_name == "show_screenpad_tool":
                    await electron_bridge.execute_tool(
                        "show_screenpad",
                        {
                            "title": str(args.get("title", "Plan & Suggestion")),
                            "content": str(args.get("content", "")),
                            "type": str(args.get("content_type", "markdown")),
                            "message": str(args.get("message", "")),
                        },
                        task_id=task_id,
                    )
                    tool_response_parts.append(
                        types.Part.from_function_response(
                            name=func_name,
                            response={"result": {"success": True, "message": "ScreenPad displayed"}},
                        )
                    )

            if tool_response_parts:
                contents.append(types.Content(role="tool", parts=tool_response_parts))

            if hitl_asked:
                continue

            has_visual_output = any(fc.name in ("show_annotations_tool", "show_screenpad_tool") for fc in function_calls)
            candidate_text = "\n".join(p.text for p in candidate.content.parts if p.text).strip() if (candidate and candidate.content) else ""
            if has_visual_output and candidate_text:
                final_text = candidate_text
                break

        ctx.set_agent_state(self.name, end_of_agent=True)
        yield Event(
            invocation_id=ctx.invocation_id,
            author=self.name,
            branch=ctx.branch,
            content=types.Content(
                role="model",
                parts=[types.Part.from_text(text=final_text)],
            ),
        )


strange_planner = StrangePlannerAgent()

