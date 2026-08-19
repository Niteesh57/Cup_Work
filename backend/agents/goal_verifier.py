from __future__ import annotations

import asyncio
import base64
import logging
from dataclasses import dataclass
from typing import Optional

from google.genai import types
from backend.config import config
from backend.core.client import get_genai_client

logger = logging.getLogger("hey_jave.goal_verifier")


@dataclass
class VerificationResult:
    achieved: bool
    confidence: float
    missing: str = ""
    reasoning: str = ""

    @property
    def passed(self) -> bool:
        return self.achieved and self.confidence >= 0.65


class GoalVerifier:
    """Multimodal check of whether the screen actually shows the goal is done.

    Uses a Gemini vision call with the goal text and screenshot to verify
    whether the user's desktop task has been achieved.
    """

    def __init__(self, model: Optional[str] = None) -> None:
        self.model = model or config.DEFAULT_MODEL

    async def check(self, goal: str, screenshot_b64: str) -> VerificationResult:
        if not screenshot_b64:
            return VerificationResult(False, 0.0, missing="No screenshot available")

        try:
            image_bytes = base64.b64decode(screenshot_b64)
        except Exception as e:
            logger.warning(f"Could not decode screenshot for verification: {e}")
            return VerificationResult(False, 0.0, missing="Invalid screenshot data")

        client = get_genai_client()

        model_contents = [
            types.Part.from_text(text=(
                "You are verifying whether a desktop automation goal has been "
                "achieved based on a screenshot.\n\n"
                f"Goal: {goal}\n\n"
                "Reply ONLY with a compact JSON object in this shape:\n"
                '{"achieved": true|false, "confidence": 0-100, "missing": "short phrase"}\n'
                'If achieved is false, describe what is still missing in "missing".'
            )),
            types.Part.from_bytes(data=image_bytes, mime_type="image/png"),
        ]

        def _call_model():
            return client.models.generate_content(
                model=self.model,
                contents=model_contents,
                config=types.GenerateContentConfig(temperature=0.0),
            )

        try:
            response = await asyncio.to_thread(_call_model)
            text = (response.text or "").strip()
            result = self._parse_json_verdict(text)
            if result is None:
                return VerificationResult(
                    achieved=False,
                    confidence=0.0,
                    missing="Verification result could not be parsed",
                    reasoning=text,
                )
            return result
        except Exception as e:
            logger.exception(f"Goal verification failed: {e}")
            return VerificationResult(False, 0.0, missing=str(e))

    @staticmethod
    def _parse_json_verdict(text: str) -> Optional[VerificationResult]:
        import json
        import re

        # Strip markdown fences if the model wraps JSON.
        cleaned = re.sub(r"```(?:json)?\s*", "", text).strip()
        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError:
            match = re.search(r"\{.*\}", cleaned, re.DOTALL)
            if not match:
                return None
            try:
                data = json.loads(match.group(0))
            except json.JSONDecodeError:
                return None

        achieved = bool(data.get("achieved", False))
        try:
            confidence = float(data.get("confidence", 0)) / 100.0
        except (TypeError, ValueError):
            confidence = 0.0

        return VerificationResult(
            achieved=achieved,
            confidence=max(0.0, min(1.0, confidence)),
            missing=str(data.get("missing", "")),
            reasoning=text,
        )


goal_verifier = GoalVerifier()
