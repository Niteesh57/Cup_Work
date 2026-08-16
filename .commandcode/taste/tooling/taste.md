# Tooling Preferences

- Uses Google ADK (`google.adk`) for all agent activities/orchestration rather than calling `google.genai` directly. Confidence: 0.95
- Uses Gemini's built-in Google Search Tool (`Tool(google_search=GoogleSearch())`) for web-research grounding. Confidence: 0.85
- Prefers a custom ADK `BaseAgent` for the imperative executor state machine, reserving `LlmAgent` for sub-agents, since `LlmAgent` owns its own generate→tool→respond loop. Confidence: 0.8
