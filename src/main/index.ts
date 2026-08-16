import { app, BrowserWindow, ipcMain, session } from 'electron';
import path from 'path';
import fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import dotenv from 'dotenv';
import WebSocket from 'ws';
import { showScreenGlow, hideScreenGlow, destroyOverlayWindow } from './overlayWindow';
import { UiaBridge } from './bridge/uiaBridge';

// Load initial environment variables from project root .env
const envPath = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../.env'),
].find((p) => fs.existsSync(p)) || path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

const BACKEND_HTTP = process.env.PYTHON_BACKEND_URL || 'http://127.0.0.1:8765';
const BACKEND_WS = process.env.PYTHON_BACKEND_WS || `${BACKEND_HTTP.replace(/^http/, 'ws')}/ws`;

let mainWindow: BrowserWindow | null = null;
let pythonProcess: ChildProcess | null = null;
let activeTtsProcess: ChildProcess | null = null;
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
  setTimeout(() => connectWebSocket(), 1500);
}

function stopPythonBackend() {
  if (pythonProcess && pythonProcess.pid) {
    console.log(`[Main] Stopping Python backend process (PID=${pythonProcess.pid})...`);
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

// ── TTS Process Manager ───────────────────────────────────────────────────────
function stopAllTts() {
  if (activeTtsProcess && activeTtsProcess.pid) {
    console.log(`[Main] Stopping active TTS speech process (PID=${activeTtsProcess.pid})...`);
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(activeTtsProcess.pid), '/f', '/t']);
      } else {
        activeTtsProcess.kill('SIGKILL');
      }
    } catch (e) {
      console.error('[Main] Error stopping TTS process:', e);
    }
    activeTtsProcess = null;
  }
}

// ── Complete Clean Exit ───────────────────────────────────────────────────────
function cleanExit() {
  console.log('[Main] Cleaning up all resources and child processes...');
  stopAllTts();
  destroyOverlayWindow();
  stopPythonBackend();
  if (wsClient) {
    try { wsClient.close(); } catch {}
    wsClient = null;
  }
}

// ── WebSocket Bridge with Python Brain ────────────────────────────────────────
function connectWebSocket() {
  if (wsClient && (wsClient.readyState === WebSocket.OPEN || wsClient.readyState === WebSocket.CONNECTING)) return;

  try {
    console.log(`[Main] Connecting to Python backend WS: ${BACKEND_WS}`);
    wsClient = new WebSocket(BACKEND_WS);

    wsClient.on('open', () => {
      console.log('[Main] Connected to Python Backend WebSocket successfully!');
      if (wsReconnectTimer) {
        clearTimeout(wsReconnectTimer);
        wsReconnectTimer = null;
      }
      mainWindow?.webContents.send('backend:status', { connected: true });
    });

    wsClient.on('message', async (data) => {
      try {
        const raw = data.toString();
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

        // Forward human-in-the-loop questions to the renderer (ScreenPad + voice)
        if (msg.type === 'HITL_QUESTION') {
          mainWindow?.webContents.send('agent:hitl-question', msg);
        }

        // Forward executor state changes
        if (msg.type === 'STATE_CHANGE') {
          mainWindow?.webContents.send('agent:state-change', msg);
        }

        // Forward commentary text
        if (msg.type === 'COMMENTARY') {
          mainWindow?.webContents.send('agent:commentary', msg);
        }

        // Speak TTS requests from the backend
        if (msg.type === 'TTS_SPEAK') {
          const text = String(msg.text || '');
          if (text) {
            mainWindow?.webContents.send('agent:tts-speak', { text });
          }
        }

        // Screen glow on task start
        if (msg.type === 'TASK_START') {
          showScreenGlow('Thinking…');
        }

        if (msg.type === 'TASK_COMPLETED' || msg.type === 'TASK_FAILED') {
          hideScreenGlow();
        }
      } catch (err) {
        console.error('[Main] Error parsing WebSocket message:', err);
      }
    });

    wsClient.on('close', () => {
      console.log('[Main] WebSocket disconnected from Python backend. Retrying in 3s...');
      wsClient = null;
      mainWindow?.webContents.send('backend:status', { connected: false });
      if (!wsReconnectTimer) {
        wsReconnectTimer = setTimeout(() => connectWebSocket(), 3000);
      }
    });

    wsClient.on('error', (err) => {
      console.warn('[Main] WebSocket error (will retry):', err.message || err);
      mainWindow?.webContents.send('backend:status', { connected: false });
    });
  } catch (err) {
    console.error('[Main] Failed to initialize WebSocket:', err);
    mainWindow?.webContents.send('backend:status', { connected: false });
    if (!wsReconnectTimer) {
      wsReconnectTimer = setTimeout(() => connectWebSocket(), 3000);
    }
  }
}

// ── Main Electron App Window ──────────────────────────────────────────────────
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 820,
    height: 700,
    minWidth: 620,
    minHeight: 520,
    frame: true,
    title: 'Hey Jave — Desktop AI Agent',
    icon: path.join(__dirname, '../../build/icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
    },
    backgroundColor: '#111318',
    show: false,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    console.log('[Main] Loading dev server:', devServerUrl);
    mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const indexPath = path.join(__dirname, '../dist/index.html');
    console.log('[Main] Loading renderer from:', indexPath);
    mainWindow.loadFile(indexPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── App Lifecycle & Clean Exit Handlers ───────────────────────────────────────
app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true);
      return;
    }
    callback(false);
  });

  startPythonBackend();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  cleanExit();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  cleanExit();
});

app.on('will-quit', () => {
  cleanExit();
});

process.on('SIGINT', () => {
  cleanExit();
  process.exit(0);
});

process.on('SIGTERM', () => {
  cleanExit();
  process.exit(0);
});

// ── IPC: Execute Prompt (Routed to Python Agent Brain) ────────────────────────
ipcMain.handle('agent:execute-prompt', async (_event, request: { prompt: string; apiKey?: string; model?: string; taskId?: string }) => {
  console.log('[agent:execute-prompt] Sending to Python Brain:', request.prompt, 'taskId:', request.taskId);
  showScreenGlow('Thinking…');

  try {
    const res = await fetch(`${BACKEND_HTTP}/api/agent/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: request.prompt,
        taskId: request.taskId,
        model: request.model,
        apiKey: request.apiKey,
      }),
    });

    if (!res.ok) {
      throw new Error(`Python backend returned HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json() as { success: boolean; message: string; steps?: unknown[]; error?: string };
    console.log('[agent:execute-prompt] Python Brain answered:', JSON.stringify(data.message));
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
  
  stopAllTts();

  try {
    showScreenGlow('Speaking…');
    const { execFile } = await import('child_process');
    await new Promise<void>((resolve) => {
      activeTtsProcess = execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', `Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak(${JSON.stringify(text)})`],
        { maxBuffer: 1024 * 1024 },
        () => {
          activeTtsProcess = null;
          hideScreenGlow();
          resolve();
        },
      );
    });
    return { success: true };
  } catch (err: unknown) {
    hideScreenGlow();
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle('voice:stop-speaking', () => {
  stopAllTts();
  hideScreenGlow();
  return { success: true };
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
    console.warn('[config:get] Backend not reachable yet, returning backend defaults');
  }

  return {
    geminiModel: 'gemini-2.5-flash',
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

// ── Task Controls (pause / resume / cancel) ────────────────────────────────
async function postTaskAction(action: string, taskId: string): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await fetch(`${BACKEND_HTTP}/api/agent/${action}/${encodeURIComponent(taskId)}`, {
      method: 'POST',
    });
    if (!res.ok) {
      return { success: false, message: `Backend returned HTTP ${res.status}` };
    }
    return (await res.json()) as { success: boolean; message?: string };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : String(err) };
  }
}

ipcMain.handle('task:pause', async (_event, taskId: string) => postTaskAction('pause', taskId));
ipcMain.handle('task:resume', async (_event, taskId: string) => postTaskAction('resume', taskId));
ipcMain.handle('task:cancel', async (_event, taskId: string) => postTaskAction('cancel', taskId));

// ── Human-in-the-loop response (ScreenPad button or voice answer) ──────────
ipcMain.handle('agent:human-response', async (_event, payload: { id?: string; taskId?: string; answer: string }) => {
  const msg = {
    type: 'HUMAN_RESPONSE',
    id: payload.id || '',
    taskId: payload.taskId || '',
    answer: payload.answer,
  };

  if (wsClient && wsClient.readyState === WebSocket.OPEN) {
    wsClient.send(JSON.stringify(msg));
    return { success: true };
  }
  return { success: false, message: 'Backend WebSocket is not connected' };
});
