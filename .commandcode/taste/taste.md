# General Coding Preferences

- Prefers simple, minimal code — avoids unnecessary abstraction layers and removes dead/unused files rather than keeping them "just in case". Confidence: 0.8
- Values accuracy and correctness — wants code reviewed and verified for actual bugs after changes, not just compiled/typechecked. Confidence: 0.8
- Highly cost/token-conscious: explicitly rejects approaches that burn tokens and cost money while failing (e.g., raw mouse-click + screenshot loops on the PC, which he reports as inaccurate and failure-prone) and asks for algorithms/tools that do all activities with near-100% accuracy, efficiency, and minimal token/cost overhead. Confidence: 0.85
- Writes Python with `from __future__ import annotations`, full type hints, and docstrings on public classes/functions. Confidence: 0.8
- Prefers SCREAMING_SNAKE_CASE for event/message type names and colon-delimited `domain:event` IPC channel names. Confidence: 0.7
