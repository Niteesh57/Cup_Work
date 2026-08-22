<div align="center">

# ☕ Cup Work (Hey Jave)

### *Your Autonomous Multimodal Desktop Companion & On-Screen AI Agent*

[![Gemini 3.7 Flash](https://img.shields.io/badge/Gemini-3.7%20Flash%20%26%20Vision-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev/)
[![Google ADK](https://img.shields.io/badge/Google%20ADK-Agent%20Development%20Kit-34A853?style=for-the-badge&logo=googlecloud&logoColor=white)](https://github.com/google/adk-python)
[![Electron](https://img.shields.io/badge/Electron-34-47848F?style=for-the-badge&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![FastAPI](https://img.shields.io/badge/FastAPI-Python%203.12-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

<p align="center">
  <strong>Cup Work</strong> transforms your desktop into an interactive, collaborative workspace. Powered by <strong>Google Gemini 3.7</strong> and the <strong>Google Agent Development Kit (ADK)</strong>, Cup Work acts as a talkative companion, an on-screen animated whiteboard tutor, an intuitive UI guide, and an autonomous visual Windows automation executor.
</p>

---

</div>

## 🌟 Table of Contents

- [⚡ Quick Start (2-Minute Spin-Up)](#quick-start)
- [📖 Overview](#overview)
- [🚀 Key Pillars & Capabilities](#key-pillars)
- [🏗️ Full System Architecture & Agentic Execution Loop](#architecture)
- [🤖 Agent Tool Capabilities & Model Execution Matrix](#agent-tools)
- [🔬 How Gemini Models Execute Desktop Workflows (Deep-Dive)](#model-execution)
- [📁 Project Structure](#project-structure)
- [🛠️ Detailed Step-by-Step Spin-Up Guide](#spin-up-guide)
  - [Prerequisites](#prerequisites)
  - [Step 1: Get a Gemini API Key](#step-1)
  - [Step 2: Clone the Repository & Configure Environment](#step-2)
  - [Step 3: Start the Backend Server (Terminal 1)](#step-3)
  - [Step 4: Launch the Desktop Client (Terminal 2)](#step-4)
- [🧪 60-Second "Test Drive" / Verification Guide](#test-drive)
- [⚙️ Environment Configuration Reference](#env-config)
- [📡 API & WebSocket Protocol](#api-protocol)
- [🩺 Troubleshooting & Common Gotchas](#troubleshooting)
- [🧪 Running Automated Tests](#running-tests)
- [📄 License](#license)

---

## <a id="quick-start"></a>⚡ Quick Start (2-Minute Spin-Up)

For evaluators and judges who want to spin up Cup Work in under 2 minutes:

```bash
# 1. Clone the repository
git clone https://github.com/Niteesh57/Jave.git
cd Jave

# 2. Configure API Key (paste your Gemini API key in backend/.env)
cp backend/.env.example backend/.env
# Edit backend/.env and set: GEMINI_API_KEY=your_gemini_api_key_here
```

### In Terminal 1 (Python Backend Server)

```bash
cd backend
python -m venv .venv

# Activate Virtual Environment:
# Windows PowerShell:  .\.venv\Scripts\Activate.ps1
# Windows CMD:         .\.venv\Scripts\activate.bat
# macOS / Linux:       source .venv/bin/activate

pip install -r requirements.txt
python main.py
```

> Server will start at `http://127.0.0.1:8765` with `[OK] Cup Work Python Brain Server`.

### In Terminal 2 (Electron Desktop Client)

```bash
# From the project root:
npm install
npm run build:electron
npm start
```

🎉 **That's it!** The Cup Work desktop companion and transparent screen overlay will launch.

---

## <a id="overview"></a>📖 Overview

Most desktop AI assistants are confined to a static sidebar chat box. **Cup Work** breaks free from the chat window:

- It **draws animated architectural diagrams** directly over your desktop screen with an auto-gliding camera.
- It **sees your screen** and highlights UI buttons, menus, and chessboard squares with real-time bounding boxes and pointer arrows.
- It **autonomously automates Windows apps** (MS Word, Excel, Chrome, File Explorer) through an `OBSERVE → ACT → MID-FLIGHT VERIFY → REDO` loop.
- It **speaks with human emotional inflection** using Gemini's streaming voice synthesis and emotional audio tags (`[excitedly]`, `[curious]`, `[whispers]`, `[thoughtful]`).
- It **remembers your habits and preferences** across sessions and devices using a temporal SQLite memory manager.

---

## <a id="key-pillars"></a>🚀 Key Pillars & Capabilities

### 1. On-Screen Infinite Whiteboard Agent (`on_screen_agent`)

When you ask conceptual or architectural questions (*"How does OAuth2 work?"*, *"Explain Kafka internal architecture"*, *"Teach me Kubernetes"*):

- **Precompiled Progressive Lectures**: Precompiles multi-step SVG sketch nodes (boxes, database cylinders, cloud services, and curved animated arrows).
- **Auto-Gliding Infinite Canvas**: Automatically pans and centers the virtual camera onto active nodes as each step unfolds.
- **Synchronized Voice Narration**: Speaks detailed explanations for every step using expressive Gemini TTS.
- **Mid-Flight Doubts & In-Flight Clarifications**: Ask a question mid-lecture (*"Wait, what if the consumer fails?"*) and the agent anchors a dynamic callout card to the active node without wiping the canvas.

### 2. Hierarchical ADK Multi-Agent Mesh

Built natively on the **Google Agent Development Kit (ADK)**:

- **`root_agent`**: Evaluates intent and dynamically transfers control to specialized agents.
- **Context Injection**: Every agent invocation receives aggregated prompt context containing active user preferences, active todo tasks, and short-term dialogue history.

### 3. Closed-Loop Desktop UI Automation (`main_executor`)

For end-to-end desktop task execution:

- **Windows UI Automation (UIA) Tree**: Inspects controls, ribbon tabs, buttons, and text fields via native Windows accessibility APIs.
- **Direct Mouse & Keyboard**: High-precision mouse clicks, smooth drags, scroll deltas, and hotkey combinations (`Ctrl+N`, `Ctrl+A`, `Ctrl+Alt+1`).
- **Mid-Flight Goal Verification (`goal_verifier`)**: Uses Gemini 3.7 Vision to capture a post-action screenshot and verify whether the sub-goal was visually achieved before proceeding or self-correcting.

### 4. Expressive Gemini TTS with Inline Emotion Tags

- Over 30 voice personalities (e.g., *Kore*, *Puck*, *Fenrir*, *Aoede*, *Sulafat*).
- Directly embeds natural emotion tags: `[excitedly]`, `[cheerfully]`, `[curious]`, `[thoughtful]`, `[serious]`, `[whispers]`, `[laughs]`.
- Low-latency real-time PCM/WAV audio streaming over WebSockets.

### 5. Visual Guidance & Strange Planner (`strange_planner`)

- Pinpoints options and buttons across web consoles and desktop software with normalized `[ymin, xmin, ymax, xmax]` bounding boxes and arrows.
- Analyzes strategy games (e.g. Chess) with precise 8x8 square grid calculations, drawing move arrows from origin to target square.

### 6. Long-Term Temporal Preference Memory

- **Temporal States**: Tracks preferences with `present` vs. `expired` states (e.g. *"user switched from React to Vue"*).
- **Multi-Device Sync**: Auto-provisions hardware IDs (`desktop-main`, `laptop-work`) and links them to user identities.
- **Integrated Todo Task Management**: Creates, updates, and tracks actionable tasks directly through voice or chat.

---

## <a id="architecture"></a>🏗️ Full System Architecture & Agentic Execution Loop

Cup Work follows a closed-loop **Taskmaster workflow**:

**Goal → Plan → Delegate → Safety Check → Act → Observe → Verify → Adapt / Done**

```mermaid
flowchart TB

    subgraph Desktop["Desktop Client - Electron + React"]

        User["User<br/>Voice or Typed Goal"]

        Voice["Voice Engine<br/>VAD + Streaming Audio"]

        Overlay["Transparent Overlay<br/>Highlights - Pointers - SVG Whiteboard"]

        UIA["Windows UI Automation<br/>Accessibility Tree + UI Controls"]

        Bridge["Desktop Control Bridge<br/>Keyboard - Mouse - Windows"]
    end


    subgraph Cloud["Google Cloud - Cup Work Backend"]

        API["FastAPI + WebSocket<br/>Session and Event Relay"]

        Memory["SQLite<br/>Preferences + Active Task State"]

        subgraph ADK["Google ADK Multi-Agent System"]

            Root["Root Agent<br/>Goal - Plan - Delegate"]

            Planner["Planner Agent<br/>Breaks Goal Into Steps"]

            Vision["Vision Agent<br/>Understands Desktop State"]

            Executor["Executor Agent<br/>Performs Desktop Actions"]

            HITL["HITL Safety Gate<br/>Approval for Risky Actions"]

            Verifier["Goal Verifier<br/>Checks Whether Goal Was Reached"]

            Specialists["Specialist Agents<br/>Research - Whiteboard - Clarification - Conversation"]
        end
    end


    subgraph Gemini["Gemini"]

        Reasoning["Gemini Flash<br/>Reasoning - Planning - Tool Calls"]

        VisionModel["Gemini Vision<br/>Screen Understanding"]

        TTS["Gemini TTS<br/>Voice Response"]
    end


    User --> Voice
    User --> API

    Voice <--> API

    API --> Root
    Root <--> Memory

    Root --> Planner
    Root --> Specialists

    Planner --> Reasoning
    Specialists --> Reasoning

    Vision --> UIA
    UIA --> Vision

    Vision <--> VisionModel

    Planner --> Executor
    Executor --> HITL

    HITL -->|Safe Action| Bridge
    HITL -->|Risky Action| Approval["User Approval<br/>Approve or Reject"]

    Approval -->|Approved| Bridge
    Approval -->|Rejected| Root

    Bridge --> UIA
    Bridge --> Overlay

    Bridge -->|New Desktop State| Verifier

    Verifier <--> VisionModel

    Verifier -->|Goal Achieved| Done["TASK COMPLETE"]

    Verifier -->|Goal Not Achieved| Planner

    Root --> TTS
    TTS --> Voice
    Specialists --> Overlay
```

---

## <a id="agent-tools"></a>🤖 Agent Tool Capabilities & Model Execution Matrix

Every agent in Cup Work is strictly domain-isolated to eliminate tool-call hallucination and ensure predictable, verified desktop actions.

| Agent Name | Assigned Gemini Model | Available Tools & Signatures | Domain & Execution Capability |
| :--- | :--- | :--- | :--- |
| **`root_agent`** | **Gemini 3.7 Flash** | • `take_screenshot_tool()`<br>• `set_user_preference_tool(key, value, status, category, device_id)`<br>• `expire_user_preference_tool(key, category)`<br>• `get_user_preferences_tool(status, category)`<br>• `create_todo_task_tool(title, description, priority, due_date, tags)`<br>• `update_todo_task_tool(task_id, status, priority, title, description)`<br>• `list_todo_tasks_tool(status, priority)`<br>• `log_activity_event_tool(activity_type, title, content, importance)` | **Top-Level Orchestrator & Memory Core**<br>Decomposes user goals into actionable sub-tasks, manages temporal preference graph in SQLite, maintains live todo list, and transfers control dynamically via ADK `transfer_to_agent`. |
| **`main_executor`** | **Gemini 3.7 Flash** | • `focus_window(windowTitle, maximize)`<br>• `maximize_window(windowTitle)`<br>• `mouse_click(x, y, button, clickCount)`<br>• `mouse_move(x, y)`<br>• `drag_drop(startX, startY, endX, endY)`<br>• `keyboard_type(text, cpm)`<br>• `press_hotkey(hotkey)`<br>• `keyboard_key(key)`<br>• `scroll_tool(delta, x, y)`<br>• `uia_click(name, controlType, automationId)`<br>• `uia_set_value(name, value, controlType)`<br>• `uia_scroll_into_view(name, controlType, windowTitle)`<br>• `run_command(command, cwd)` | **Autonomous Windows Automation Engine**<br>Executes native desktop automation using keyboard-first shortcuts and mouse control. Supports multi-action chaining in a single turn to complete complex workflows rapidly without single-keypress latency. |
| **`goal_verifier`** | **Gemini 3.7 Flash Vision** | • `verify_subgoal(expected_state, post_screenshot_b64, active_window_meta)`<br>• `inspect_differential_screen(pre_b64, post_b64)` | **Closed-Loop Visual Inspector**<br>Compares before-and-after screenshots and inspects the active OS accessibility tree to visually verify whether a sub-goal was achieved. Triggers replanning if state didn't change. |
| **`hitl_manager`** | **Gemini 3.7 Flash** | • `ask_human_tool(question, options)`<br>• `request_execution_approval(action_type, command, target_resource)` | **Zero-Trust Safety & Approval Gate**<br>Evaluates command risk level. Intercepts destructive actions (file deletion, process termination, shell scripts, config changes) and presents interactive on-screen approval cards. |
| **`on_screen_agent`** | **Gemini 3.7 Flash** | • `draw_whiteboard_lecture_tool(concept_title, steps, step_delay_seconds)`<br>• `draw_whiteboard_step_tool(concept_title, step_number, total_steps, step_label, elements, connections, notes, narration, append_mode)`<br>• `draw_mermaid_diagram_tool(concept_title, nodes, connections, notes, narration)`<br>• `add_whiteboard_clarification_tool(topic, text, target_id, narration)`<br>• `clear_whiteboard_tool()`<br>• `close_whiteboard_tool()` | **On-Screen Whiteboard Tutor**<br>Precompiles multi-step SVG sketch lectures with database cylinders, server boxes, cloud nodes, and curved animated arrows. Controls auto-gliding virtual camera and anchors in-flight doubt cards. |
| **`strange_planner`** | **Gemini 3.7 Flash Vision** | • `show_annotations_tool(boxes, arrows, duration_seconds)`<br>• `show_screenpad_tool(title, content, content_type, message)`<br>• `uia_get_interactive_elements_tool(window_title, max_elements)`<br>• `uia_search_elements_tool(query, window_title)` | **Visual Screen Guidance & Chess Planner**<br>Pins highlight bounding boxes `[ymin, xmin, ymax, xmax]` and directional pointer arrows over desktop UI controls. Calculates chess board grid coordinates (A1–H8) for visual move guidance. |
| **`research_agent`** | **Gemini 3.7 Flash** | • Google Search Grounding Tools<br>• `fetch_web_documentation(url, query)` | **Technical Research Specialist**<br>Synthesizes documentation, API specs, and error solutions from live web searches and returns structured summaries without polluting desktop tools. |
| **`clarification_agent`** | **Gemini 3.7 Flash** | • `ask_human_tool(question, options)`<br>• `render_quiz_card(question_id, prompt, choices)` | **Interactive Q&A & Quiz Master**<br>Conducts turn-by-turn interactive trivia, multi-step user disambiguation, and parameter gathering one question at a time. |
| **`scratchpad_agent`** | **Gemini 3.7 Flash** | • `show_screenpad_tool(title, content, content_type, message)` | **Code Proposal & Command Card Engine**<br>Displays formatted terminal commands, diff blocks, and code snippets in a persistent on-screen card for quick copy-paste and review. |
| **`general_agent`** | **Gemini 3.7 Flash + TTS** | • `search_and_explore_places_tool(query, location_hint)`<br>• `read_grounded_news_tool(topic, count)`<br>• `create_todo_task_tool(title, description, priority, due_date, tags)`<br>• `list_todo_tasks_tool(status, priority)` | **Companion & Places Explorer**<br>Handles natural conversation, weather/news broadcasts, Google Maps place exploration, and daily productivity management with expressive emotion audio tags. |

---

## <a id="model-execution"></a>🔬 How Gemini Models Execute Desktop Workflows (Deep-Dive)

Cup Work bridges high-level AI reasoning with low-level Windows OS control through a 6-phase execution pipeline:

```
[ Phase 1: User Goal & Context Injection ]
                      │
[ Phase 2: Dual-Tier Perception (UIA + Gemini Vision) ]
                      │
[ Phase 3: Zero-Trust Safety Gate (HITL) ]
                      │
[ Phase 4: WebSocket JSON-RPC Multi-Action Execution ]
                      │
[ Phase 5: Closed-Loop Visual Verification (Goal Verifier) ]
                      │
[ Phase 6: Real-Time Multimodal Voice & Overlay Streaming ]
```

### Phase 1: Dynamic Intent Routing & Context Injection

1. User provides a goal via voice (Web Speech API / Gemini Live) or text.
2. The `root_agent` receives the prompt along with an **injected context block** containing:
   - **Active Preferences:** Filtered from SQLite (e.g., `package_manager: pnpm`, `editor: VS Code`).
   - **Active Todos:** Unfinished tasks for the day.
   - **Hardware ID:** Device context (`desktop-main`).
3. `root_agent` calls Google ADK's `transfer_to_agent("main_executor")` or the relevant specialist.

### Phase 2: Dual-Tier Perception Engine (Speed + Robustness)

When an agent needs to locate an on-screen button or inspect terminal text:
- **Tier 1 (Sub-15ms UIA Query):** The agent calls `uia_get_interactive_elements_tool()` or `uia_search_elements_tool()`. The Python backend sends a WebSocket request to Electron's native Windows UI Automation bridge, returning bounding rectangles, control types (`Button`, `Edit`, `MenuItem`), and accessibility IDs.
- **Tier 2 (Gemini Vision Grounding Fallback):** If an application is rendered on a custom HTML5 canvas, OpenGL viewport, or game engine, UIA returns empty nodes. The system automatically captures a PNG screenshot, encodes it to base64, and prompts **Gemini 3.7 Flash Vision** with a normalized coordinate system ($0\text{--}1000$). Gemini returns exact spatial bounding boxes mapped back to physical display pixels.

### Phase 3: Zero-Trust Human-In-The-Loop (HITL) Safety Gate

Before any command reaches the operating system:

1. `main_executor` passes the proposed action through `hitl_manager`.
2. Actions categorized as **read-only / safe** (e.g., `focus_window`, `take_screenshot`, `scroll`, `uia_get_text`) execute immediately without user interruption.
3. Actions categorized as **high-risk or mutating** (e.g., running shell commands, terminating processes, modifying system files, clicking checkout buttons) trigger `ask_human_tool`.
4. An interactive glassmorphism card appears on screen with options. The agent halts execution until the user gives explicit voice or click approval.

### Phase 4: Multi-Action Chained Execution over WebSocket JSON-RPC

To eliminate sluggish single-keypress turn delays:
- The model can chain complementary tool invocations in a single response turn:

  ```json
  [
    {"name": "focus_window", "args": {"windowTitle": "PowerShell", "maximize": true}},
    {"name": "keyboard_type", "args": {"text": "npm run test:unit"}},
    {"name": "press_hotkey", "args": {"hotkey": "Return"}}
  ]
  ```

* The Python backend dispatches these tools over WebSocket (`ws://127.0.0.1:8765/ws`) to Electron, which executes them sequentially via native Windows `SendInput` APIs and Win32 window handles.

### Phase 5: Mid-Flight Goal Verification & Self-Correction

After executing the action chain:

1. Electron captures an instant post-action screenshot.
2. `goal_verifier` calls **Gemini 3.7 Flash Vision** to compare the screen state against the expected sub-goal.
3. **If Verified:** The executor marks the step complete and proceeds to the next planned phase.
4. **If Not Verified (State unchanged or error dialog detected):** The agent does NOT enter a blind loop. It diagnoses why the action failed (e.g., window lost focus, button disabled), updates its plan, and tries an alternative path (e.g., keyboard hotkey instead of mouse click).

### Phase 6: Real-Time Multimodal Voice & Overlay Streaming

Throughout execution:
- **Audio Synthesis:** Spoken responses are generated via **Gemini Flash TTS** using inline emotion tags (`[excitedly]`, `[thoughtful]`, `[serious]`) and streamed as raw 24kHz PCM chunks directly to the Web Audio buffer.
- **On-Screen Canvas:** Whiteboard diagrams and highlight boxes render live on the transparent click-through Electron overlay without taking focus away from the user's active work.

---

## <a id="project-structure"></a>📁 Project Structure

```text
cup_work/
├── backend/                        # Python FastAPI & Google ADK backend
│   ├── adk_runner.py               # Google ADK Runner wrapper & execution lifecycle
│   ├── config.py                   # Environment & server settings
│   ├── main.py                     # Uvicorn entrypoint (Port 8765)
│   ├── models.py                   # Pydantic request/response schemas
│   ├── server.py                   # FastAPI routing, WebSockets & Event Bus bridge
│   ├── agents/                     # ADK Specialist Agents
│   │   ├── root_agent.py           # Root dynamic router
│   │   ├── general_agent.py        # Companion & places/news agent
│   │   ├── on_screen_agent.py      # Whiteboard sketch & lecture agent
│   │   ├── strange_planner.py      # Visual UI annotation & chess planner
│   │   ├── main_executor.py        # Desktop automation engine
│   │   ├── goal_verifier.py        # Gemini Vision sub-goal verifier
│   │   ├── hitl_manager.py         # Human-in-the-Loop decision manager
│   │   ├── research_agent.py       # Web research specialist
│   │   ├── clarification_agent.py  # Interactive Q&A and quiz agent
│   │   └── _tools.py               # Shared ADK tool bindings
│   ├── api/                        # REST API endpoint routers
│   ├── bridge/                     # WebSocket bridge to Electron
│   ├── core/                       # GenAI client initialization
│   ├── events/                     # Event bus & commentary translator
│   ├── memory/                     # Temporal memory & multi-device manager
│   ├── storage/                    # SQLite persistent store
│   ├── tools/                      # Native desktop tool definitions
│   └── voice/                      # Gemini streaming TTS engine
│
├── src/                            # Electron & React Frontend
│   ├── main/                       # Electron Main Process
│   │   ├── index.ts                # App lifecycle, IPC & WebSocket forwarder
│   │   ├── overlayWindow.ts        # Transparent click-through overlay window
│   │   ├── tts.ts                  # Audio streaming & speaker playback
│   │   └── bridge/                 # Windows UI Automation (UIA) bridge
│   ├── renderer/                   # React 18 Renderer Process
│   │   ├── App.tsx                 # Main UI, chat view, timeline & controls
│   │   ├── overlay.html            # Overlay view (Whiteboard, Glow, Badges)
│   │   ├── voiceEngine.ts          # Web Speech API & microphone capture
│   │   ├── audio/                  # Gemini PCM audio player
│   │   └── components/             # Reusable React components
│   │       ├── AgentFlowGraph.tsx  # Dynamic multi-agent state visualization
│   │       ├── CoffeeCup.tsx       # Mascot animation
│   │       ├── MovingColorsAvatar.tsx # Gemini live audio aura
│   │       ├── SettingsModal.tsx   # Model selection & server configuration
│   │       ├── TodoListModal.tsx   # Task management interface
│   │       └── ToolCallTimeline.tsx# Agent reasoning & tool execution log
│   └── shared/                     # Shared TypeScript interfaces & types
│
├── package.json                    # Node dependencies & scripts
├── vite.config.ts                  # Vite + Electron build configuration
└── tailwind.config.js              # Tailwind CSS styling configuration
```

---

## <a id="spin-up-guide"></a>🛠️ Detailed Step-by-Step Spin-Up Guide

### <a id="prerequisites"></a>Prerequisites

Before running Cup Work, make sure your machine has:

1. **Node.js**: `v20.0.0` or newer ([Download Node.js](https://nodejs.org/))
2. **Python**: `3.11` or `3.12` ([Download Python](https://www.python.org/downloads/))
3. **Git**: Installed and configured on your system.
4. **Supported Operating Systems**:
   - **Windows 10 / 11** *(Recommended)*: Full native desktop UI Automation, transparent click-through screen overlay, OCR vision, and streaming audio.
   - **macOS / Linux**: Full companion chat, animated on-screen whiteboard lectures, Google Maps / Search grounding, news broadcasts, todo tasks, and mock desktop tool execution.

---

### <a id="step-1"></a>Step 1: Get a Gemini API Key

1. Visit **[Google AI Studio](https://aistudio.google.com/apikey)**.
2. Sign in with your Google account and click **"Create API Key"**.
3. Copy your key (starts with `AIzaSy...`).

*(Alternatively, if you prefer Google Cloud Vertex AI, ensure your `gcloud` CLI is logged in or you have a service account JSON file ready).*

---

### <a id="step-2"></a>Step 2: Clone the Repository & Configure Environment

```bash
# Clone the repository
git clone https://github.com/Niteesh57/Jave.git
cd Jave

# Copy backend environment template
cp backend/.env.example backend/.env
```

Open `backend/.env` in any text editor and configure your credentials:

```ini
# Option A: Standard Google AI Studio (Recommended & Simplest)
GEMINI_API_KEY=AIzaSyYourActualKeyHere
GOOGLE_GENAI_USE_VERTEXAI=false
GEMINI_MODEL=gemini-3.7-flash

# Server settings (defaults are pre-configured)
PYTHON_BACKEND_HOST=127.0.0.1
PYTHON_BACKEND_PORT=8765
UIA_TIMEOUT_MS=5000
ENABLE_VISION_FALLBACK=true
LOG_LEVEL=info
```

*(If using Vertex AI, set `GOOGLE_GENAI_USE_VERTEXAI=true`, `GOOGLE_CLOUD_PROJECT=your-project-id`, and `GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json`).*

---

### <a id="step-3"></a>Step 3: Start the Backend Server (Terminal 1)

Open **Terminal 1** and run:

#### On Windows (PowerShell)

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python main.py
```

#### On Windows (CMD)

```cmd
cd backend
python -m venv .venv
.\.venv\Scripts\activate.bat
pip install -r requirements.txt
python main.py
```

#### On macOS / Linux (Bash / Zsh)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

#### ✅ Verify Backend Health

You should see:

```text
=====================================================
  Cup Work Python Brain Server v2.0
  Host: 127.0.0.1:8765
  Vertex AI Mode: False
  Default Model: gemini-3.7-flash
=====================================================
INFO:     Started server process
INFO:     Uvicorn running on http://127.0.0.1:8765 (Press CTRL+C to quit)
```

In your browser or terminal, verify health check:

```powershell
# PowerShell
Invoke-RestMethod http://127.0.0.1:8765/health

# Or cURL
curl http://127.0.0.1:8765/health
```

Expected output: `{"status":"ok","service":"hey-jave-brain","default_model":"gemini-3.7-flash", ...}`

---

### <a id="step-4"></a>Step 4: Launch the Desktop Client (Terminal 2)

Open **Terminal 2** from the root `Jave/` folder:

```bash
# 1. Install Node dependencies
npm install

# 2. Build the Electron main process scripts
npm run build:electron

# 3. Start Cup Work
npm start
```

*(For developers wanting live hot-reloading on renderer UI, run `npm run dev`)*.

---

## <a id="test-drive"></a>🧪 60-Second "Test Drive" / Verification Guide

Once the Cup Work window opens, test these core capabilities to verify complete end-to-end functionality:

### 1. Test the On-Screen Animated Whiteboard (`on_screen_agent`)

Type or speak:
> *"Explain how Kafka internal partition architecture works with a diagram"*

- **What to expect**: The transparent whiteboard overlay activates on your screen. You will see animated SVG nodes (Producers, Broker Cylinders, Consumer Groups) drawn with curved arrows, an auto-gliding camera that centers on each step, and synchronized voice narration.
- *Press `ESC` to close the whiteboard at any time.*

### 2. Test In-Flight Doubt Clarification

While the whiteboard is active, ask:
> *"Wait, what happens if the broker node crashes?"*

- **What to expect**: Cup Work retains the active diagram and anchors a live clarification note directly next to the broker component with voice narration.

### 3. Test Places Grounding & Temporal Todo Memory (`general_agent`)

Type or speak:
> *"Find the top 3 coffee shops in Seattle and add visiting them to my todo list for today."*

- **What to expect**: The agent uses Google Search grounding to return real ratings, addresses, and recommendations, auto-creates todo items in the SQLite task database, and remembers your coffee interest. Click the **ListTodo** icon in the header to view your persistent task list.

### 4. Test Desktop Screen Perception & Guidance (`strange_planner`)

With any application or website open, ask:
> *"Where is the option to search on this screen?"*

- **What to expect**: Cup Work captures a screenshot and renders a high-contrast glowing highlight box and pointer arrow directly over the target element on your screen.

### 5. Test Closed-Loop Windows Desktop Automation (`main_executor`) *(Windows)*

Type or speak:
> *"Open Notepad, write a grocery list with apples, milk, and coffee, and make the window full screen."*

- **What to expect**: The agent focuses/launches Notepad, maximizes it, enters the text, captures a post-action screenshot, and calls `goal_verifier` to confirm completion visually.

---

## <a id="env-config"></a>⚙️ Environment Configuration Reference

| Variable | Default | Required? | Description |
| :--- | :--- | :---: | :--- |
| `GEMINI_API_KEY` | *(empty)* | **Yes** (if not Vertex) | API key from [Google AI Studio](https://aistudio.google.com/apikey). |
| `GOOGLE_GENAI_USE_VERTEXAI` | `false` | No | Set to `true` to authenticate via GCP Vertex AI. |
| `GOOGLE_CLOUD_PROJECT` | *(empty)* | If Vertex | Google Cloud Project ID. |
| `GOOGLE_APPLICATION_CREDENTIALS` | *(empty)* | If Vertex | Path to service account JSON credentials. |
| `GEMINI_MODEL` | `gemini-3.7-flash` | No | Gemini model for reasoning (`gemini-3.7-flash`, `gemini-2.5-flash`). |
| `PYTHON_BACKEND_HOST` | `127.0.0.1` | No | Host address for FastAPI backend server. |
| `PYTHON_BACKEND_PORT` | `8765` | No | Port for FastAPI backend & WebSocket forwarder. |
| `UIA_TIMEOUT_MS` | `5000` | No | Timeout for native Windows Accessibility UI queries. |
| `ENABLE_VISION_FALLBACK` | `true` | No | Falls back to vision OCR when UI elements lack accessibility labels. |
| `LOG_LEVEL` | `info` | No | Logging verbosity (`debug`, `info`, `warning`, `error`). |

---

## <a id="api-protocol"></a>📡 API & WebSocket Protocol

### REST Endpoints

- `GET  /health`: Health status, active clients, and default model.
- `POST /api/agent/chat`: Send text or base64 audio prompt to ADK multi-agent mesh.
- `POST /api/agent/stop`: Cancel the currently executing task.
- `POST /api/agent/pause/{task_id}`: Pause an in-flight automation task.
- `POST /api/agent/resume/{task_id}`: Resume a paused automation task.
- `GET  /api/todos`: Retrieve list of active and completed todos.
- `POST /api/todos`: Create a new todo task item.
- `GET  /api/preferences`: Retrieve temporal user preferences with status (`present`/`expired`).

### WebSocket Messages (`ws://127.0.0.1:8765/ws`)

- `REGISTER_DEVICE`: Electron client registers hardware ID (`dev_xxxx`) and links identity.
- `HUMAN_RESPONSE`: User answers a Human-in-the-Loop (HITL) multiple-choice prompt.
- `AGENT_STEP_UPDATE`: Broadcasts intermediate agent reasoning, tool execution, and state changes.
- `TTS_STREAM_CHUNK`: Streams raw audio chunks directly to frontend audio player.

---

## <a id="troubleshooting"></a>🩺 Troubleshooting & Common Gotchas

### 1. PowerShell Script Execution Policy Error

If you see `File .venv\Scripts\Activate.ps1 cannot be loaded because running scripts is disabled`:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

### 2. Backend Port 8765 Already in Use

If port `8765` is occupied by another process:

1. Change `PYTHON_BACKEND_PORT=8766` in `backend/.env`.
2. Start the backend: `python main.py`.
3. In the Electron app, open **Settings** (gear icon) and set the Backend URL to `http://127.0.0.1:8766`.

### 3. Audio / Microphone Access in Electron

If speech recognition does not capture your voice:

- Make sure your microphone is enabled in Windows Settings -> *Privacy & Security* -> *Microphone*.
- You can always use text input in the chat box if microphone access is unavailable.

### 4. Windows Overlay Display

The screen overlay runs as a transparent, frameless window spanning your primary display. If multi-monitor setups shift the overlay, use `ESC` to dismiss or toggle the **Whiteboard** button in the header.

---

## <a id="running-tests"></a>🧪 Running Automated Tests

Run backend tests to verify agent routing, memory management, and API endpoints:

```bash
cd backend
python -m pytest test_backend.py test_routes.py -v
```

---

## <a id="license"></a>📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

<div align="center">
  <sub>Built with ❤️ for the Google Gemini Developer Competition.</sub>
</div>
