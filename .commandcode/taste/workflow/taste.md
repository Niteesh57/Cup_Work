# Workflow & Communication Preferences

- Prefers detailed, phased implementation plans with an explicit ordering and clear "do NOT rebuild existing" markers. Confidence: 0.85
- Prefers structured, table-heavy markdown specs (tool-access matrices, decision tables, code blocks) for architecture documents. Confidence: 0.8
- Prefers confirming key decisions up front (e.g., a "Decisions confirmed" section) before detailing implementation. Confidence: 0.75
- Prefers asking clarification questions one at a time rather than batching several questions together (more natural for voice). Confidence: 0.9
- Prefers live commentary that aggregates low-level actions (no per-click/mouse narration) and distinguishes low-level from user-visible events. Confidence: 0.85
- Prefers a "show before execute" command mode (Copy vs Execute choice) so the user keeps a manual control boundary over suggested commands. Confidence: 0.8
- Prefers dropping or demoting unverified claims in plans — e.g., replace an unverified "npm run build fixes X" step with an optional smoke test rather than a mandatory first step. Confidence: 0.7
- Verifies unfamiliar library APIs by inspecting signatures/source (inspect.signature, inspect.getsource, grep) before writing code against them, rather than trusting docs or guessing. Confidence: 0.85
- Runs a layered verification pass after changes: syntax parse (ast.parse) → import check → typecheck (tsc --noEmit) → test suite. Confidence: 0.75
