# Workflow & Communication Preferences

- Prefers detailed, phased implementation plans with an explicit ordering and clear "do NOT rebuild existing" markers. Confidence: 0.85
- Prefers structured, table-heavy markdown specs (tool-access matrices, decision tables, code blocks) for architecture documents. Confidence: 0.8
- Prefers confirming key decisions up front (e.g., a "Decisions confirmed" section) before detailing implementation. Confidence: 0.75
- Prefers asking clarification questions one at a time rather than batching several questions together (more natural for voice). Confidence: 0.9
- Prefers live commentary that aggregates low-level actions (no per-click/mouse narration) and distinguishes low-level from user-visible events. Confidence: 0.85
- Prefers the agent to verbally announce its plan and next step via TTS before acting, and to narrate observations in a natural, conversational voice ("human nature") rather than silently executing. Confidence: 0.85
- Prefers voice sequencing where speech finishes completely (blocking/synchronous TTS) before the agent executes the next action or captures the post-action screenshot, so the user isn't cut off mid-sentence. Confidence: 0.85
- Prefers a "show before execute" command mode (Copy vs Execute choice) so the user keeps a manual control boundary over suggested commands. Confidence: 0.8
- Prefers dropping or demoting unverified claims in plans — e.g., replace an unverified "npm run build fixes X" step with an optional smoke test rather than a mandatory first step. Confidence: 0.7
- Verifies unfamiliar library APIs by inspecting signatures/source (inspect.signature, inspect.getsource, grep) before writing code against them, rather than trusting docs or guessing. Confidence: 0.85
- Runs a layered verification pass after changes: syntax parse (ast.parse) → import check → typecheck (tsc --noEmit) → test suite. Confidence: 0.75
- When a new tool doesn't work against a live target, digs into the actual runtime state (e.g., dumping the page's real DOM/attributes) to find the true selector mismatch rather than guessing — YouTube's search input is `name="search_query"`, not `id="search"`. Confidence: 0.7
- Prefers concise, action-focused TTS announcements ("I'll now type…", "I'll press Enter") and dislikes repetitive observation filler like "let me see the screen" — announce the action, then do it, rather than narrating observations repeatedly. Confidence: 0.75
- Prefers the agent to analyze information already visible on screen itself (e.g., read a chessboard from a screenshot and annotate the recommended move) rather than offloading the analysis back to the user by asking for FEN, coordinates, or a description. Confidence: 0.8
- For architecture/design requests ("prepare an architecture first"), switches into plan mode and writes the architecture/plan to a file before touching code. Confidence: 0.8
- When asked to strip/simplify UI features, deletes the dead component files and their CSS entirely rather than leaving them orphaned, then greps to confirm no remaining references. Confidence: 0.8
- After a UI rewrite, proactively hunts for leftover stale state flows (e.g., recording state stuck after a HITL voice answer auto-resolves) and fixes them, beyond just getting the build green. Confidence: 0.7
- When asked to "check code" (review uncommitted work), reports findings as "found and fixed" vs. "flagged — needs your call": fixes clearly-safe issues (e.g., unused props causing TS6133) directly, but asks the user before wiring up or altering feature behavior that wasn't explicitly requested (e.g., making a cosmetic backend-URL setting actually reroute traffic). Confidence: 0.7
