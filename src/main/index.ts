import { app, BrowserWindow, ipcMain, session } from 'electron';
import path from 'path';
import fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import dotenv from 'dotenv';
import { showScreenGlow, hideScreenGlow, destroyOverlayWindow } from './overlayWindow';
import { UiaBridge } from './bridge/uiaBridge';

// Load initial environment variables from project root .env
const envPath = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../.env'),
].find((p) => fs.existsSync(p)) || path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

const BACKEND_PORT = parseInt(process.env.PYTHON_BACKEND_PORT || '8765', 10);
const BACKEND_HOST = process.env.PYTHON_BACKEND_HOST || '127.0.0.1';
const BACKEND_HTTP = `http://${BACKEND_HOST}:${BACKEND_PORT}`;
const BACKEND_WS = `ws://${BACKEND_HOST}:${BACKEND_PORT}/ws`;

let mainWindow: BrowserWindow | null = null;
let pythonProcess: ChildProcess | null = null;
let wsClient: WebSocket | null = null;
let wsReconnectTimer: NodeJS.Timeout | null = null;
const uiaBridge = new UiaBridge();

// ── Python Backend Process Manager ───────────────────────────────────────────
function startPythonBackend() {
  const rootDir = process.cwd();
  const scriptPath = path.resolve(rootDir, 'backend/main.py');

  if (!fs.existsSync(scriptPath)) {
    console.error('[Main] Python backend script not found at:', scriptPath);
    return;
  }

  console.log(`[Main] Spawning Python Backend at ${BACKEND_HTTP}...`);
  const pyCmd = process.platform === 'win32' ? 'python' : 'python3';

  pythonProcess = spawn(pyCmd, [scriptPath], {
    cwd: rootDir,
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  pythonProcess.stdout?.on('data', (data) => {
    console.log(`[Python Backend] ${data.toString().trim()}`);
  });

  pythonProcess.stderr?.on('data', (data) => {
    console.error(`[Python Backend Err] ${data.toString().trim()}`);
  });

  pythonProcess.on('exit', (code, signal) => {
    console.log(`[Main] Python Backend exited (code=${code}, signal=${signal})`);
    pythonProcess = null;
  });

  // Connect WebSocket once backend starts
  setTimeout(() => connectWebSocket(), 2000);
}

function stopPythonBackend() {
  if (pythonProcess) {
    console.log('[Main] Stopping Python backend...');
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(pythonProcess.pid), '/f', '/t']);
      } else {
        pythonProcess.kill('SIGTERM');
      }
    } catch (e) {
      console.error('[Main] Error stopping Python backend:', e);
    }
    pythonProcess = null;
  }
}

// ── WebSocket Bridge with Python Brain ────────────────────────────────────────
function connectWebSocket() {
  if (wsClient && wsClient.readyState === WebSocket.OPEN) return;

  try {
    console.log(`[Main] Connecting to Python backend WS: ${BACKEND_WS}`);
    wsClient = new WebSocket(BACKEND_WS);

    wsClient.onopen = () => {
      console.log('[Main] Connected to Python Backend WebSocket successfully!');
      if (wsReconnectTimer) {
        clearTimeout(wsReconnectTimer);
        wsReconnectTimer = null;
      }
    };

    wsClient.onmessage = async (event) => {
      try {
        const raw = typeof event.data === 'string' ? event.data : event.data.toString();
        const msg = JSON.parse(raw);

        // Tool execution requested by Python brain
        if (msg.type === 'TOOL_EXECUTE') {
          console.log(`[Main] Executing tool '${msg.tool}' for task ${msg.taskId}...`);
          try {
            const result = await uiaBridge.executeTool(msg.tool, msg.args || {});
            const resp = {
              type: 'TOOL_RESULT',
              id: msg.id,
              taskId: msg.taskId,
              success: result.success !== false,
              result: result,
            };
            wsClient?.send(JSON.stringify(resp));
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            console.error(`[Main] Tool '${msg.tool}' failed:`, errMsg);
            wsClient?.send(JSON.stringify({
              type: 'TOOL_RESULT',
              id: msg.id,
              taskId: msg.taskId,
              success: false,
              result: { success: false, error: errMsg },
            }));
          }
        }

        // Forward live step updates to React renderer
        if (msg.type === 'AGENT_STEP_UPDATE') {
          mainWindow?.webContents.send('agent:step-update', msg.step);
        }

        // Screen glow on task start
        if (msg.type === 'TASK_START') {
          showScreenGlow('Thinking…');
        }
      } catch (err) {
        console.error('[Main] Error parsing WebSocket message:', err);
      }
    };

    wsClient.onclose = () => {
      console.log('[Main] WebSocket disconnected from Python backend. Retrying in 3s...');
      wsClient = null;
      if (!wsReconnectTimer) {
        wsReconnectTimer = setTimeout(() => connectWebSocket(), 3000);
      }
    };

    wsClient.onerror = (err) => {
      console.warn('[Main] WebSocket error (will retry):', err);
    };
  } catch (err) {
    console.error('[Main] Failed to initialize WebSocket:', err);
    if (!wsReconnectTimer) {
      wsReconnectTimer = setTimeout(() => connectWebSocket(), 3000);
    }
  }
}

// ── Window ─────────────────────────────────────────────────────────────────────
function createWindow() {
  const iconCandidates = [
    path.join(__dirname, '../build/icon.png'),
    path.join(__dirname, '../../build/icon.png'),
    path.join(__dirname, '../icon.png'),
    path.join(process.cwd(), 'icon.png'),
  ];
  const appIcon = iconCandidates.find((p) => fs.existsSync(p));

  mainWindow = new BrowserWindow({
    width: 1050,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    title: 'Hey Jave',
    icon: appIcon,
    backgroundColor: '#0c0f17',
    frame: true,
    titleBarStyle: 'default',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  const distFile = path.join(__dirname, '../dist/index.html');
  console.log('[Main] Loading renderer from:', distFile);

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(distFile);
  }

  mainWindow.webContents.openDevTools({ mode: 'detach' });

  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error('[Main] Page failed to load:', code, desc);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    destroyOverlayWindow();
    stopPythonBackend();
    app.quit();
  });
}

// ── App Lifecycle ──────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media');
  });

  startPythonBackend();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  destroyOverlayWindow();
  stopPythonBackend();
  app.quit();
});

app.on('before-quit', () => {
  destroyOverlayWindow();
  stopPythonBackend();
});

// ── IPC: Execute Chat Prompt (Routed to Python Brain) ─────────────────────────
ipcMain.handle('agent:execute-prompt', async (_event, request: { prompt: string }) => {
  console.log('[agent:execute-prompt] Sending to Python Brain:', JSON.stringify(request.prompt));
  try {
    showScreenGlow('Thinking…');
    const res = await fetch(`${BACKEND_HTTP}/api/agent/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: request.prompt }),
    });

    if (!res.ok) {
      throw new Error(`Python backend returned HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json() as { success: boolean; message: string; steps?: unknown[]; error?: string };
    console.log('[agent:execute-prompt] Python Brain answered:', JSON.stringify(data.message));
    hideScreenGlow();
    return {
      success: data.success,
      message: data.message,
      steps: data.steps || [],
      error: data.error,
    };
  } catch (err: unknown) {
    hideScreenGlow();
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[agent:execute-prompt] Error calling Python Brain:', msg);
    return { success: false, message: msg, error: msg };
  }
});

// ── IPC: Multimodal Audio Transcription (Routed to Python Gemini SDK) ─────────
ipcMain.handle('voice:transcribe', async (_event, { audioBase64, mimeType }: { audioBase64: string; mimeType: string }) => {
  if (!audioBase64 || audioBase64.length < 100) {
    return { success: false, error: 'Audio data is missing or too small.' };
  }

  try {
    const res = await fetch(`${BACKEND_HTTP}/api/voice/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioBase64, mimeType }),
    });

    if (!res.ok) {
      throw new Error(`Python backend transcribe error (HTTP ${res.status}): ${res.statusText}`);
    }

    const data = await res.json() as { success: boolean; text?: string; error?: string };
    return data;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[voice:transcribe] Error:', msg);
    return { success: false, error: msg };
  }
});

// ── IPC: List Models ──────────────────────────────────────────────────────────
ipcMain.handle('gemini:list-models', async (_event, apiKey?: string) => {
  try {
    const url = apiKey ? `${BACKEND_HTTP}/api/models?apiKey=${encodeURIComponent(apiKey)}` : `${BACKEND_HTTP}/api/models`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { models: Array<{ id: string; displayName: string }>; error?: string };
    return data;
  } catch (err) {
    return { models: [], error: err instanceof Error ? err.message : String(err) };
  }
});

// ── IPC: Native Windows SAPI TTS ─────────────────────────────────────────────
ipcMain.handle('voice:speak', async (_event, { text }: { text: string }) => {
  if (!text) return { success: false, error: 'No text to speak' };
  try {
    const { execFile } = await import('child_process');
    await new Promise<void>((resolve, reject) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', `Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak(${JSON.stringify(text)})`],
        { maxBuffer: 1024 * 1024 },
        (error) => (error ? reject(error) : resolve()),
      );
    });
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});

// ── IPC: Edge glow ───────────────────────────────────────────────────────────
ipcMain.handle('agent:listen-start', () => {
  showScreenGlow('Listening…');
});
ipcMain.handle('agent:listen-stop', () => {
  hideScreenGlow();
});

// ── IPC: Configuration Management (Routed to Python Backend & .env) ───────────
ipcMain.handle('config:get', async () => {
  try {
    const res = await fetch(`${BACKEND_HTTP}/api/config`);
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn('[config:get] Backend not reachable yet, reading from process.env');
  }

  return {
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    uiaTimeoutMs: parseInt(process.env.UIA_TIMEOUT_MS || '5000', 10),
    enableVisionFallback: process.env.ENABLE_VISION_FALLBACK !== 'false',
  };
});

ipcMain.handle('config:save', async (_event, newConfig: Record<string, unknown>) => {
  try {
    const res = await fetch(`${BACKEND_HTTP}/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newConfig),
    });
    return res.ok;
  } catch (err) {
    console.error('[config:save] Error:', err);
    return false;
  }
});
