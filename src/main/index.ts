import { app, BrowserWindow, ipcMain, session } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { spawn, ChildProcess } from 'child_process';
import dotenv from 'dotenv';
import WebSocket from 'ws';
import {
  showScreenGlow,
  hideScreenGlow,
  destroyOverlayWindow,
  updateScreenGlow,
  closeWhiteboard,
  closeScreenPad,
  closeHighlightBox
} from './overlayWindow';

import { UiaBridge } from './bridge/uiaBridge';
import { executeBrowserTool, closeLaunchedChrome } from './bridge/browserCdp';
import { ElementResolver } from './bridge/elementResolver';

// Stable Device identity for this machine
const localDeviceId = `dev_${Buffer.from(os.hostname() + '-' + (os.userInfo().username || 'user')).toString('hex').slice(0, 12)}`;
const localDeviceName = `${os.hostname()} (${os.userInfo().username || 'desktop'})`;

// Load initial environment variables from project root .env
const envPath = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../.env'),
].find((p) => fs.existsSync(p)) || path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

import { stopAllTts, speakTextNative } from './tts';

const BACKEND_HTTP = process.env.PYTHON_BACKEND_URL || 'http://127.0.0.1:8765';
const BACKEND_WS = process.env.PYTHON_BACKEND_WS || `${BACKEND_HTTP.replace(/^http/, 'ws')}/ws`;

let mainWindow: BrowserWindow | null = null;
let wsClient: WebSocket | null = null;
let wsReconnectTimer: NodeJS.Timeout | null = null;
const uiaBridge = new UiaBridge();
const elementResolver = new ElementResolver(uiaBridge);


// ── Complete Clean Exit ───────────────────────────────────────────────────────
function cleanExit() {
  console.log('[Main] Cleaning up all resources and child processes...');
  stopAllTts();
  destroyOverlayWindow();
  closeLaunchedChrome();
  if (wsClient) {
    try { wsClient.close(); } catch {}
    wsClient = null;
  }
}

// ── WebSocket Bridge with Python Brain ────────────────────────────────────────
function scheduleWebSocketReconnect(delayMs = 2000) {
  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = null;
  }
  if (wsClient) {
    try {
      wsClient.removeAllListeners();
      wsClient.terminate();
    } catch {}
    wsClient = null;
  }
  mainWindow?.webContents.send('backend:status', { connected: false });
  wsReconnectTimer = setTimeout(() => {
    wsReconnectTimer = null;
    connectWebSocket();
  }, delayMs);
}

function connectWebSocket() {
  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = null;
  }
  if (wsClient) {
    try {
      wsClient.removeAllListeners();
      wsClient.terminate();
    } catch {}
    wsClient = null;
  }

  try {
    console.log(`[Main] Connecting to Python backend WS: ${BACKEND_WS}`);
    const client = new WebSocket(BACKEND_WS);
    wsClient = client;

    client.on('open', () => {
      console.log('[Main] Connected to Python Backend WebSocket successfully!');
      try {
        client.send(JSON.stringify({
          type: 'REGISTER_DEVICE',
          deviceId: localDeviceId,
          deviceName: localDeviceName,
        }));
      } catch (err) {
        console.error('[Main] Failed to send REGISTER_DEVICE:', err);
      }
      if (wsReconnectTimer) {
        clearTimeout(wsReconnectTimer);
        wsReconnectTimer = null;
      }
      mainWindow?.webContents.send('backend:status', { connected: true });
    });

    client.on('message', async (data) => {
      try {
        const raw = data.toString();
        const msg = JSON.parse(raw);

        // Tool execution requested by Python brain
        if (msg.type === 'TOOL_EXECUTE') {
          const tool = String(msg.tool || '');
          const args = (msg.args || {}) as Record<string, unknown>;
          console.log(`[Main] Executing tool '${tool}' for task ${msg.taskId}...`);

          // Update Screen Glow dynamically with live user-friendly feedback
          let actionLabel = `Running tool: ${tool}`;
          if (tool === 'smart_ui_action' || tool === 'uia_invoke') {
            const targetName = String(args.name || args.elementName || (args.target as Record<string, unknown>)?.name || '');
            actionLabel = targetName ? `Interacting with "${targetName}"` : 'Interacting with UI component';
          } else if (tool === 'show_annotations') {
            actionLabel = 'Highlighting actionable items on screen';
          } else if (tool === 'uia_search_elements') {
            actionLabel = `Searching for "${args.query || 'element'}" in Windows`;
          } else if (tool === 'uia_get_interactive_elements') {
            actionLabel = 'Scanning desktop interactive controls';
          } else if (tool === 'draw_whiteboard_step') {
            actionLabel = `Whiteboard: ${args.conceptTitle || 'Drawing concept'} (Step ${args.stepNumber || 1})`;
          } else if (tool === 'draw_mermaid_diagram') {
            actionLabel = `Whiteboard: Diagramming ${args.conceptTitle || 'concept'}`;
          } else if (tool === 'add_whiteboard_clarification') {
            actionLabel = `Whiteboard: Clarifying ${args.topic || 'doubt'}...`;
          } else if (tool === 'clear_whiteboard') {
            actionLabel = 'Whiteboard: Cleared canvas';
          } else if (tool === 'take_screenshot' || tool === 'screenshot_region') {

            actionLabel = 'Inspecting screen view';
          } else if (tool.startsWith('browser_')) {
            actionLabel = `Browser action: ${tool.replace('browser_', '')}`;
          }
          showScreenGlow(`🛠️ ${actionLabel}`, 'executing');
          mainWindow?.webContents.send('agent:live-action', { tool, label: actionLabel, args });

          try {
            // Resolve-and-act joins local UIA, CDP, and screen-state evidence
            // before allowing input. Browser DOM tools otherwise route through
            // CDP; all remaining desktop tools route through UIA.
            const result = msg.tool === 'resolve_element'
              ? await elementResolver.resolve(msg.args || {})
              : msg.tool === 'smart_ui_action'
                ? await elementResolver.resolveAndAct(msg.args || {})
                : msg.tool.startsWith('browser_')
                  ? await executeBrowserTool(msg.tool, msg.args || {})
                  : await uiaBridge.executeTool(msg.tool, msg.args || {});
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
          const st = String(msg.state || '');
          const stateLabel = st === 'planning' ? 'Planning next steps…'
            : st === 'acting' ? 'Executing automation steps…'
            : st === 'verifying' ? 'Verifying result on screen…'
            : st === 'waiting_hitl' ? 'Waiting for your confirmation…'
            : st === 'paused' ? 'Paused'
            : undefined;
          if (stateLabel) {
            updateScreenGlow(stateLabel, st === 'acting' ? 'executing' : 'thinking');
          }
          mainWindow?.webContents.send('agent:state-change', msg);
        }

        // Forward commentary text
        if (msg.type === 'COMMENTARY') {
          const text = String(msg.text || '');
          if (text) updateScreenGlow(text, 'speaking');
          mainWindow?.webContents.send('agent:commentary', msg);
        }

        // Speak TTS requests from the backend
        if (msg.type === 'TTS_SPEAK') {
          const text = String(msg.text || '');
          if (text) {
            mainWindow?.webContents.send('agent:tts-speak', { text });
          }
        }

        // Screen glow on task start / steps / completion
        if (msg.type === 'TASK_START') {
          showScreenGlow('Thinking & Planning…', 'thinking');
        }

        if (msg.type === 'OBSERVING_SCREEN') {
          updateScreenGlow('Observing screen…', 'executing');
        }

        if (msg.type === 'TASK_COMPLETED' || msg.type === 'TASK_FAILED') {
          setTimeout(() => hideScreenGlow(), 1200);
        }
      } catch (err) {
        console.error('[Main] Error parsing WebSocket message:', err);
      }
    });

    client.on('close', () => {
      console.log('[Main] WebSocket disconnected from Python backend. Retrying in 2s...');
      scheduleWebSocketReconnect(2000);
    });

    client.on('error', (err: unknown) => {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn('[Main] WebSocket error (will retry):', errMsg);
      scheduleWebSocketReconnect(2000);
    });
  } catch (err) {
    console.error('[Main] Failed to initialize WebSocket:', err);
    scheduleWebSocketReconnect(2000);
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

  connectWebSocket();
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
ipcMain.handle('agent:execute-prompt', async (_event, request: { prompt?: string; audioBase64?: string; mimeType?: string; apiKey?: string; model?: string; taskId?: string; userId?: string; deviceId?: string; deviceName?: string }) => {
  console.log('[agent:execute-prompt] Sending to Python Brain:', request.prompt || '[Direct Audio]', 'hasAudio:', !!request.audioBase64, 'taskId:', request.taskId);
  showScreenGlow('Thinking…');

  try {
    const res = await fetch(`${BACKEND_HTTP}/api/agent/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: request.prompt,
        audioBase64: request.audioBase64,
        mimeType: request.mimeType,
        taskId: request.taskId,
        userId: request.userId,
        deviceId: request.deviceId || localDeviceId,
        deviceName: request.deviceName || localDeviceName,
        model: request.model,
        apiKey: request.apiKey,
      }),
    });

    if (!res.ok) {
      throw new Error(`Python backend returned HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json() as { success: boolean; message: string; steps?: unknown[]; error?: string; userId?: string; deviceId?: string; userName?: string; deviceName?: string };
    console.log('[agent:execute-prompt] Python Brain answered:', JSON.stringify(data.message), 'user:', data.userName, 'device:', data.deviceName);
    return {
      success: data.success,
      message: data.message,
      steps: data.steps || [],
      error: data.error,
      userId: data.userId,
      deviceId: data.deviceId,
      userName: data.userName,
      deviceName: data.deviceName,
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
    showScreenGlow('🔊 Hey Jave is speaking…', 'speaking');
    await speakTextNative(text);
    hideScreenGlow();
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
ipcMain.handle('agent:glow-show', (_event, { text, mode }: { text?: string; mode?: 'user-speaking' | 'thinking' | 'executing' | 'speaking' }) => {
  showScreenGlow(text, mode);
  return { success: true };
});
ipcMain.handle('agent:glow-hide', () => {
  hideScreenGlow();
  return { success: true };
});

// ── IPC: Configuration Management (Routed to Python Backend & .env) ───────────
ipcMain.handle('config:get', async () => {
  try {
    const res = await fetch(`${BACKEND_HTTP}/api/config`);
    if (res.ok) {
      const data = await res.json() as Record<string, unknown>;
      return { ...data, backendConnected: true };
    }
  } catch (e) {
    console.warn('[config:get] Backend not reachable yet');
  }

  return {
    backendConnected: false,
    geminiModel: '',
  };
});

ipcMain.handle('backend:is-connected', () => {
  return wsClient !== null && wsClient.readyState === WebSocket.OPEN;
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

// ── IPC: User Identity & Profile (Supports modifying ONLY name) ───────────────
ipcMain.handle('user:get-profile', async (_event, userId?: string) => {
  try {
    const regRes = await fetch(`${BACKEND_HTTP}/api/device/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: localDeviceId,
        deviceName: localDeviceName,
        userId: userId || undefined,
      }),
    });
    if (!regRes.ok) return { success: false, error: 'Failed to resolve device identity' };
    const identity = (await regRes.json()) as {
      userId: string;
      userName: string;
      deviceId: string;
      deviceName: string;
      isNewUser?: boolean;
    };

    const profRes = await fetch(`${BACKEND_HTTP}/api/user/profile?userId=${encodeURIComponent(identity.userId)}`);
    const profData = profRes.ok
      ? ((await profRes.json()) as { success: boolean; profile: Record<string, unknown> })
      : { success: true, profile: {} };

    return {
      success: true,
      userId: identity.userId,
      userName: identity.userName,
      deviceId: identity.deviceId,
      deviceName: identity.deviceName,
      profile: profData.profile || {},
    };
  } catch (err: unknown) {
    console.error('[user:get-profile] Error:', err);
    return {
      success: false,
      userId: userId || 'usr_local',
      userName: 'Local User',
      deviceId: localDeviceId,
      deviceName: localDeviceName,
      error: err instanceof Error ? err.message : String(err),
    };
  }
});

ipcMain.handle('user:update-name', async (_event, { userId, name }: { userId: string; name: string }) => {
  try {
    const res = await fetch(`${BACKEND_HTTP}/api/user/profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, name }),
    });
    if (!res.ok) return { success: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    return data;
  } catch (err: unknown) {
    console.error('[user:update-name] Error:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});

async function postTaskAction(action: string, taskId?: string): Promise<{ success: boolean; message?: string }> {
  if (!taskId || !taskId.trim()) {
    return { success: false, message: 'No active task ID provided.' };
  }
  try {
    const res = await fetch(`${BACKEND_HTTP}/api/agent/${action}/${encodeURIComponent(taskId.trim())}`, {
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

ipcMain.handle('agent:hitl-respond', async (_event, payload: { id?: string; taskId?: string; answer: string }) => {
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


// ── Overlay Component Dismissal IPC Handlers ──────────────────────────────
ipcMain.handle('agent:close-whiteboard', () => {
  closeWhiteboard();
  return { success: true };
});

ipcMain.handle('agent:close-screenpad', () => {
  closeScreenPad();
  return { success: true };
});

ipcMain.handle('agent:close-box', (_event, { id }: { id: string }) => {
  closeHighlightBox(id);
  return { success: true };
});

