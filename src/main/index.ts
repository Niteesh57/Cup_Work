import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { AgentRunner } from './agent/agentRunner';
import { ExecutionRequest, AppConfig } from '../shared/types';

import { showScreenGlow, updateScreenGlow, hideScreenGlow } from './overlayWindow';

// Load initial environment variables
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

let mainWindow: BrowserWindow | null = null;
const agentRunner = new AgentRunner();

function createWindow() {
  const iconCandidates = [
    path.join(__dirname, '../build/icon.png'),
    path.join(__dirname, '../../build/icon.png'),
    path.join(__dirname, '../icon.png'),
    path.join(process.cwd(), 'icon.png')
  ];
  const appIcon = iconCandidates.find(p => fs.existsSync(p));

  mainWindow = new BrowserWindow({
    width: 1050,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    title: 'Hey Jave — Desktop AI Agent',
    icon: appIcon,
    backgroundColor: '#0c0f17',
    frame: true,
    titleBarStyle: 'default',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });

  const distFile = path.join(__dirname, '../dist/index.html');
  console.log('[Main] Loading renderer from:', distFile);

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(distFile);
  }

  // Open DevTools to surface renderer errors
  mainWindow.webContents.openDevTools({ mode: 'detach' });

  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error('[Main] Page failed to load:', code, desc);
  });

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.error('[Main] Renderer process gone:', details);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Electron Application Lifecycle
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handler: Execute Desktop Agent Task Prompt
ipcMain.handle('agent:execute-prompt', async (_event, request: ExecutionRequest) => {
  showScreenGlow(request.prompt);
  try {
    return await agentRunner.runTask(
      request.prompt,
      (stepUpdate) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('agent:step-update', stepUpdate);
        }
        updateScreenGlow(stepUpdate.thought || stepUpdate.actionName);
      },
      request.apiKey,
      request.model
    );
  } finally {
    hideScreenGlow();
  }
});

// IPC Handler: Fetch available Gemini models for a given API key
ipcMain.handle('gemini:list-models', async (_event, apiKey: string): Promise<{ models: { id: string; displayName: string }[]; error?: string }> => {
  try {
    const https = await import('https');
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=100`;

    const data = await new Promise<string>((resolve, reject) => {
      https.get(url, (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => resolve(raw));
        res.on('error', reject);
      }).on('error', reject);
    });

    const parsed = JSON.parse(data);

    if (parsed.error) {
      return { models: [], error: parsed.error.message };
    }

    // Filter to generativeContent-capable gemini models only
    const models = (parsed.models || [])
      .filter((m: { name: string; supportedGenerationMethods?: string[] }) =>
        m.name.includes('gemini') &&
        (m.supportedGenerationMethods || []).includes('generateContent')
      )
      .map((m: { name: string; displayName?: string }) => ({
        id: m.name.replace('models/', ''),
        displayName: m.displayName || m.name.replace('models/', '')
      }));

    return { models };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return { models: [], error: errMsg };
  }
});

// IPC Handler: Get Configuration
ipcMain.handle('config:get', async (): Promise<AppConfig> => {
  return {
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    uiaTimeoutMs: parseInt(process.env.UIA_TIMEOUT_MS || '5000', 10),
    enableVisionFallback: process.env.ENABLE_VISION_FALLBACK !== 'false'
  };
});

// IPC Handler: Save Configuration
ipcMain.handle('config:save', async (_event, newConfig: Partial<AppConfig>): Promise<boolean> => {
  try {
    if (newConfig.geminiApiKey !== undefined) process.env.GEMINI_API_KEY = newConfig.geminiApiKey;
    if (newConfig.geminiModel !== undefined) process.env.GEMINI_MODEL = newConfig.geminiModel;

    const envContent = `GEMINI_API_KEY=${process.env.GEMINI_API_KEY || ''}
GEMINI_MODEL=${process.env.GEMINI_MODEL || 'gemini-2.0-flash'}
UIA_TIMEOUT_MS=${process.env.UIA_TIMEOUT_MS || '5000'}
LOG_LEVEL=${process.env.LOG_LEVEL || 'info'}
ENABLE_VISION_FALLBACK=${process.env.ENABLE_VISION_FALLBACK || 'true'}
`;

    fs.writeFileSync(envPath, envContent, 'utf-8');
    return true;
  } catch {
    return false;
  }
});
