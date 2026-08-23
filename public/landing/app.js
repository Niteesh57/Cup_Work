document.addEventListener('DOMContentLoaded', () => {
  initDownloadInfo();
  initArchitectureVisualizer();
  initCopyButtons();
});

// ── 1. Fetch & Initialize Download Info ──────────────────────────────────────
async function initDownloadInfo() {
  const downloadBtn = document.getElementById('primary-download-btn');
  const heroDownloadBtn = document.getElementById('hero-download-btn');
  const navDownloadBtn = document.getElementById('nav-download-btn');
  const downloadSizeEl = document.getElementById('meta-file-size');
  const downloadVersionEl = document.getElementById('meta-version');
  const downloadStatusBadge = document.getElementById('backend-status-badge');

  try {
    const res = await fetch('/api/download/info');
    if (res.ok) {
      const data = await res.json();
      if (downloadSizeEl && data.size_formatted) {
        downloadSizeEl.textContent = data.size_formatted;
      }
      if (downloadVersionEl && data.version) {
        downloadVersionEl.textContent = 'v' + data.version;
      }
      if (downloadStatusBadge) {
        downloadStatusBadge.innerHTML = `
          <span class="badge-dot"></span>
          <span>FastAPI Brain v2.0 Online</span>
        `;
      }
    }
  } catch (err) {
    if (downloadSizeEl) downloadSizeEl.textContent = '104.4 MB';
    if (downloadVersionEl) downloadVersionEl.textContent = 'v1.0.0';
  }

  const handleDownload = (e) => {
    e.preventDefault();
    const isServer = window.location.protocol.startsWith('http');
    if (isServer) {
      window.location.href = '/api/download/windows';
    } else {
      window.location.href = '../../release/Hey%20Jave%20Setup%201.0.0.exe';
    }
  };

  if (downloadBtn) downloadBtn.addEventListener('click', handleDownload);
  if (heroDownloadBtn) heroDownloadBtn.addEventListener('click', handleDownload);
  if (navDownloadBtn) navDownloadBtn.addEventListener('click', handleDownload);
}

// ── 2. Interactive Multi-Agent Architecture Visualizer ───────────────────────
function initArchitectureVisualizer() {
  const nodes = document.querySelectorAll('.arch-node');
  const inspectName = document.getElementById('arch-inspect-name');
  const inspectBadge = document.getElementById('arch-inspect-badge');
  const inspectDesc = document.getElementById('arch-inspect-desc');
  const inspectModel = document.getElementById('arch-inspect-model');
  const inspectTools = document.getElementById('arch-inspect-tools');
  const inspectIn = document.getElementById('arch-inspect-in');
  const inspectOut = document.getElementById('arch-inspect-out');
  const runSimBtn = document.getElementById('arch-run-sim-btn');
  const scenarioBtns = document.querySelectorAll('.arch-scenario-btn');

  const nodeSpecs = {
    user_input: {
      name: "Cup Work Desktop User",
      badge: "Voice & Text Input",
      desc: "Captures natural human voice and text commands through the Electron transparent client with push-to-talk.",
      model: "Electron 34 WebAudio PCM",
      tools: "Microphone Stream, Global Hotkeys",
      in: "Audio Stream (16kHz PCM)",
      out: "WebSocket Event: USER_PROMPT"
    },
    memory: {
      name: "Temporal Memory Manager",
      badge: "SQLite Local DB",
      desc: "Maintains cross-session user preferences, previous project milestones, device state, and temporal memory logs with zero cloud leakage.",
      model: "Embedded SQLite Engine",
      tools: "set_preference, get_preferences, log_activity",
      in: "User & Task IDs",
      out: "Contextual Long-Term Memory Records"
    },
    adk_runner: {
      name: "AdkRunner & Session Service",
      badge: "FastAPI Python Runtime",
      desc: "Orchestrates Google Agent Development Kit (ADK) session state, handles context injection, and supervises sub-agent invocation lifecycles.",
      model: "Python 3.12 + Google ADK",
      tools: "Session Orchestration, Tool Bus",
      in: "User Command + Memory Context",
      out: "Agent Context & Execution Graph"
    },
    root_agent: {
      name: "Root Agent (Dynamic Router)",
      badge: "Gemini 3.7 Flash",
      desc: "Primary coordinator that classifies user intent, queries temporal memory, and dynamically delegates workflows across specialized sub-agents.",
      model: "gemini-3.7-flash (Vertex AI)",
      tools: "Sub-Agent Delegation, Multi-Turn Chat",
      in: "Full Prompt & Screen State",
      out: "Sub-Agent Call / Streaming Response"
    },
    chrome_agent: {
      name: "Chrome Browser Agent",
      badge: "Web Automation",
      desc: "Automates browser navigation, deep web research, form submissions, and data extraction from active web pages.",
      model: "gemini-3.7-flash",
      tools: "execute_command, read_url, search_web",
      in: "Search Query / URL Target",
      out: "Extracted HTML / Web Content"
    },
    win_executor: {
      name: "WinExecutor (Desktop Action Engine)",
      badge: "Win32 UIA + Mouse/Keyboard",
      desc: "Controls native Windows apps like Microsoft Word and Excel. Clicks ribbon buttons, types text, and navigates accessibility trees.",
      model: "Win32 Automation Driver",
      tools: "uia_click, uia_set_text, mouse_click, type_text",
      in: "Target UI Elements / Coordinates",
      out: "OS Keystrokes & Clicks Executed"
    },
    screen_annotator: {
      name: "Screen Annotator (Vision HUD)",
      badge: "Real-Time Bounding Boxes",
      desc: "Calculates sub-pixel coordinate bounding boxes and projects glowing target boxes and directional pointer arrows over desktop UI controls.",
      model: "Gemini 3.7 Vision API",
      tools: "show_annotations, uia_get_interactive_elements",
      in: "Screen Frame (1920x1080 PNG)",
      out: "Normalized [ymin, xmin, ymax, xmax] HUD"
    },
    whiteboard_agent: {
      name: "On-Screen Whiteboard Agent",
      badge: "Transparent SVG Canvas",
      desc: "Renders progressive animated architectural sketches, mind maps, and algorithmic lectures on a floating glass canvas with camera auto-tracking.",
      model: "gemini-3.7-flash",
      tools: "draw_whiteboard_step, draw_mermaid_diagram",
      in: "Concept Title & Step Graph",
      out: "Animated SVG Paths & Node Positions"
    },
    clarification_agent: {
      name: "Clarification Agent",
      badge: "Dynamic Notes",
      desc: "Instantly generates sticky notes and callout cards on the active whiteboard when users ask mid-explanation questions.",
      model: "gemini-3.7-flash",
      tools: "add_whiteboard_clarification",
      in: "User Doubt / Follow-up Question",
      out: "Anchored Clarification Note Card"
    },
    research_agent: {
      name: "Research Agent (News Reader)",
      badge: "Google Search Grounded",
      desc: "Retrieves live breaking news headlines, financial market summaries, and academic sources using Google Search grounding.",
      model: "gemini-3.7-flash + GoogleSearch",
      tools: "read_grounded_news_tool, search_and_explore",
      in: "Research Topic Query",
      out: "Grounded Summary & Verified Sources"
    },
    scratchpad_agent: {
      name: "Scratchpad Agent",
      badge: "Floating Card Deck",
      desc: "Presents formatted Markdown summaries, system architecture cards, and 1-click runnable shell commands on the floating Windows Scratchpad.",
      model: "gemini-3.7-flash",
      tools: "show_screenpad_tool",
      in: "Code Analysis / CLI Instructions",
      out: "Floating Markdown Deck with Copy Action"
    },
    verification: {
      name: "Verification & HITL Safety Loop",
      badge: "Safety Guardrails",
      desc: "GoalVerifier inspects screen state to confirm task success. Human-in-the-Loop prompts for user confirmation before sensitive actions.",
      model: "GoalVerifier + HITL Manager",
      tools: "ask_human_tool, verify_goal",
      in: "Pending Sensitive Action",
      out: "User Approval / Mid-Flight Retry"
    },
    tts_streamer: {
      name: "Gemini TTS Streamer",
      badge: "Gemini 3.1 Flash TTS",
      desc: "Synthesizes streaming PCM audio chunks with emotional voice inflection based on tags like [excitedly] and [thoughtful].",
      model: "gemini-3.1-flash-tts-preview",
      tools: "PCM Audio Streamer, Voice Coalescer",
      in: "Text Tokens with Mood Tags",
      out: "Low-Latency 24kHz Audio Chunks"
    },
    eventbus: {
      name: "EventBus (Commentary & Events)",
      badge: "Async Publish-Subscribe",
      desc: "Internal asynchronous pub/sub event broker that dispatches agent step updates, commentary banners, and todo updates to connected clients.",
      model: "AsyncIO Event Dispatcher",
      tools: "publish, subscribe",
      in: "Internal Runtime Events",
      out: "Filtered WebSocket Payload"
    },
    electron_bridge: {
      name: "Electron WebSocket Bridge",
      badge: "Real-Time IPC Hub",
      desc: "Bi-directional WebSocket server running on port 8765 connecting the Python brain to the Electron UI renderer process with sub-millisecond latency.",
      model: "FastAPI WebSocket Server",
      tools: "broadcast, register_device, handle_message",
      in: "Serialized JSON Messages",
      out: "Native Desktop Screen Rendering"
    }
  };

  const selectNode = (key) => {
    nodes.forEach(n => n.classList.remove('active'));
    const targetNode = document.querySelector(`.arch-node[data-node="${key}"]`);
    if (targetNode) targetNode.classList.add('active');

    const spec = nodeSpecs[key] || nodeSpecs.root_agent;
    if (inspectName) {
      inspectName.innerHTML = `
        <span>${spec.name}</span>
        <span class="badge badge-glow" style="font-size:0.7rem;">${spec.badge}</span>
      `;
    }
    if (inspectDesc) inspectDesc.textContent = spec.desc;
    if (inspectModel) inspectModel.textContent = spec.model;
    if (inspectTools) inspectTools.textContent = spec.tools;
    if (inspectIn) inspectIn.textContent = spec.in;
    if (inspectOut) inspectOut.textContent = spec.out;
  };

  nodes.forEach(node => {
    node.addEventListener('click', () => {
      const key = node.getAttribute('data-node');
      selectNode(key);
    });
  });

  // Scenario Routes for Pulse Animation
  const scenarioPaths = {
    full: ['user_input', 'adk_runner', 'memory', 'root_agent', 'win_executor', 'scratchpad_agent', 'verification', 'tts_streamer', 'eventbus', 'electron_bridge'],
    office: ['user_input', 'adk_runner', 'root_agent', 'win_executor', 'verification', 'tts_streamer', 'electron_bridge'],
    whiteboard: ['user_input', 'adk_runner', 'root_agent', 'whiteboard_agent', 'clarification_agent', 'tts_streamer', 'electron_bridge'],
    news: ['user_input', 'adk_runner', 'root_agent', 'research_agent', 'scratchpad_agent', 'tts_streamer', 'electron_bridge']
  };

  let activeScenario = 'full';

  scenarioBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      scenarioBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeScenario = btn.getAttribute('data-scenario') || 'full';
    });
  });

  const runSimulation = () => {
    const route = scenarioPaths[activeScenario] || scenarioPaths.full;
    let step = 0;

    if (runSimBtn) {
      runSimBtn.disabled = true;
      runSimBtn.innerHTML = `<span>Simulating...</span>`;
    }

    const interval = setInterval(() => {
      if (step < route.length) {
        selectNode(route[step]);
        step++;
      } else {
        clearInterval(interval);
        if (runSimBtn) {
          runSimBtn.disabled = false;
          runSimBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            <span>Simulate Pipeline Flow</span>
          `;
        }
      }
    }, 700);
  };

  if (runSimBtn) {
    runSimBtn.addEventListener('click', runSimulation);
  }
}

// ── 3. Copy to Clipboard Code Blocks ─────────────────────────────────────────
function initCopyButtons() {
  const copyButtons = document.querySelectorAll('.copy-btn[data-clipboard-target]');

  copyButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const targetId = btn.getAttribute('data-clipboard-target');
      const targetEl = document.getElementById(targetId);
      if (!targetEl) return;

      const text = targetEl.innerText || targetEl.textContent;
      try {
        await navigator.clipboard.writeText(text.trim());
        const originalText = btn.innerHTML;
        btn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10a37f" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
          <span style="color:#10a37f;">Copied</span>
        `;
        setTimeout(() => {
          btn.innerHTML = originalText;
        }, 2000);
      } catch (err) {
        console.error('Failed to copy', err);
      }
    });
  });
}
