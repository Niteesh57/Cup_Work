# Agent / System Architecture Preferences

- Prefers least-privilege tool access for AI agents: each agent gets only the tools it needs, since more tools increases hallucination risk. Confidence: 0.95
- Prefers explicit state-machine orchestration (Observe → Analyze → Plan → Safety → Act → Verify) over free-form model loops for complex agents. Confidence: 0.9
- Prefers verifying task completion against real observable state (e.g., screenshot goal-verifier) rather than trusting model output alone. Confidence: 0.9
- Prefers human-in-the-loop confirmation for risky or destructive actions (arbitrary shell commands, killing processes). Confidence: 0.9
- Prefers cross-session user preferences so the agent skips already-answered questions instead of re-asking. Confidence: 0.85
- Prefers persisting task/session state so work survives app restarts and crashes. Confidence: 0.8
- Prefers the agent to feel like a "skilled human assistant operating the computer" (See → Think → Speak → Act → Verify) with live commentary. Confidence: 0.8
- Prefers choosing the least invasive action that achieves the goal. Confidence: 0.75
- Prefers a clear layered separation of concerns: one Orchestrator (Main Agent Executor) deciding, specialist agents (Scratchpad, Clarification, Research, Planner) only advising, plus Infrastructure and Tools as separate layers. Confidence: 0.9
- Prefers specialist agents that only advise and never own the computer-control tools — the orchestrator always decides and acts. Confidence: 0.85
- Prefers semantic UI Automation controls (e.g., Click Button("Save")) over raw screen coordinates (Click(743,512)) whenever possible. Confidence: 0.9
- Prefers combined screen observation (screenshot + UI Automation + browser DOM + app state) rather than relying on screenshots/vision alone. Confidence: 0.85
- Prefers a lightweight always-on wake-word/VAD listener, with heavier AI components kept idle until activation. Confidence: 0.8
- Prefers non-blocking human-in-the-loop: the task suspends/resumes rather than blocking on a synchronous modal, and voice + on-screen options are answered in parallel with first-answer-wins. Confidence: 0.85
- Prefers registering every new tool/capability across all dispatch paths (model declaration, TS dispatcher, and Python direct-fallback map) so no fallback path silently fails. Confidence: 0.7
- Prefers keeping verification screenshots cheap — region-crop or downscale instead of sending full-screen PNG base64 per verification. Confidence: 0.7
- Prefers graceful fallback routing when swapping a subsystem — try the new path, fall back to the proven path on exception — over a hard cutover. Confidence: 0.6
