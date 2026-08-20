import { BrowserWindow, screen } from 'electron';
import path from 'path';
import fs from 'fs';
import { HighlightBox, ScreenPadContent } from '../shared/types';

let overlayWindow: BrowserWindow | null = null;

function sendToOverlay(channel: string, ...args: unknown[]) {
  const win = createOverlayWindow();
  if (!win || win.isDestroyed()) return;

  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', () => {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, ...args);
      }
    });
  } else {
    win.webContents.send(channel, ...args);
  }
}

export function createOverlayWindow(): BrowserWindow {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    return overlayWindow;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { x, y, width, height } = primaryDisplay.bounds;

  overlayWindow = new BrowserWindow({
    x, y, width, height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });

  overlayWindow.setAlwaysOnTop(true, 'screen-saver');

  // Default: pass mouse through to desktop apps.
  // ScreenPad interactions temporarily disable this via IPC.
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  const candidates = [
    path.join(__dirname, '../src/renderer/overlay.html'),
    path.join(__dirname, '../../src/renderer/overlay.html'),
    path.join(process.cwd(), 'src/renderer/overlay.html')
  ];

  const htmlPath = candidates.find(p => fs.existsSync(p)) || candidates[0];
  overlayWindow.loadFile(htmlPath);

  overlayWindow.on('closed', () => { overlayWindow = null; });

  return overlayWindow;
}

// ── Screen Glow Border ────────────────────────────────────────────────────────
export function showScreenGlow(promptText?: string, mode?: 'user-speaking' | 'thinking' | 'executing' | 'speaking') {
  try {
    const win = createOverlayWindow();
    if (win && !win.isDestroyed()) {
      win.showInactive();
      win.webContents.send('overlay:show', { text: promptText, mode: mode || 'thinking' });
    }
  } catch (err) {
    console.error('[ScreenOverlay] Failed to show screen glow:', err);
  }
}

export function updateScreenGlow(stepThought?: string, mode?: 'user-speaking' | 'thinking' | 'executing' | 'speaking') {
  try {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('overlay:update', { text: stepThought, mode });
    }
  } catch (err) {
    console.error('[ScreenOverlay] Failed to update screen glow:', err);
  }
}

export function hideScreenGlow() {
  try {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('overlay:hide');
      setTimeout(() => {
        if (overlayWindow && !overlayWindow.isDestroyed()) {
          overlayWindow.hide();
        }
      }, 450);
    }
  } catch (err) {
    console.error('[ScreenOverlay] Failed to hide screen glow:', err);
  }
}

export function destroyOverlayWindow() {
  try {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.destroy();
      overlayWindow = null;
    }
  } catch (err) {
    console.error('[ScreenOverlay] Failed to destroy overlay window:', err);
  }
}

// ── ScreenPad ─────────────────────────────────────────────────────────────────
export function showScreenPad(content: Partial<ScreenPadContent>) {
  try {
    const win = createOverlayWindow();
    if (win && !win.isDestroyed()) {
      win.showInactive();
      // Enable mouse events so user can interact with ScreenPad
      win.setIgnoreMouseEvents(false);
      win.webContents.send('overlay:screenpad-show', content);
    }
  } catch (err) {
    console.error('[ScreenOverlay] Failed to show ScreenPad:', err);
  }
}

export function closeScreenPad() {
  try {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('overlay:screenpad-close');
      // Restore pass-through mouse events
      overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    }
  } catch (err) {
    console.error('[ScreenOverlay] Failed to close ScreenPad:', err);
  }
}

// ── Highlight Boxes ───────────────────────────────────────────────────────────
export function showHighlightBox(box: Partial<HighlightBox>) {
  try {
    const win = createOverlayWindow();
    if (win && !win.isDestroyed()) {
      win.showInactive();
      win.webContents.send('overlay:box-show', box);
    }
  } catch (err) {
    console.error('[ScreenOverlay] Failed to show highlight box:', err);
  }
}

export function closeHighlightBox(id: string) {
  try {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('overlay:box-close', { id });
    }
  } catch (err) {
    console.error('[ScreenOverlay] Failed to close highlight box:', err);
  }
}

export function clearAllHighlightBoxes() {
  try {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('overlay:boxes-clear');
    }
  } catch (err) {
    console.error('[ScreenOverlay] Failed to clear highlight boxes:', err);
  }
}

// ── Interactive Whiteboard & Explainer Overlay ───────────────────────────────
export function showWhiteboardStep(payload: Record<string, unknown>) {
  try {
    const win = createOverlayWindow();
    if (win && !win.isDestroyed()) {
      win.show();
      win.setIgnoreMouseEvents(false);
      win.focus();
      sendToOverlay('overlay:whiteboard-step', payload);
    }
  } catch (err) {
    console.error('[ScreenOverlay] Failed to show whiteboard step:', err);
  }
}

export function showWhiteboardDiagram(payload: Record<string, unknown>) {
  try {
    const win = createOverlayWindow();
    if (win && !win.isDestroyed()) {
      win.show();
      win.setIgnoreMouseEvents(false);
      win.focus();
      sendToOverlay('overlay:whiteboard-diagram', payload);
    }
  } catch (err) {
    console.error('[ScreenOverlay] Failed to show whiteboard diagram:', err);
  }
}

export function addWhiteboardClarification(payload: Record<string, unknown>) {
  try {
    const win = createOverlayWindow();
    if (win && !win.isDestroyed()) {
      win.show();
      win.setIgnoreMouseEvents(false);
      win.focus();
      sendToOverlay('overlay:whiteboard-clarification', payload);
    }
  } catch (err) {
    console.error('[ScreenOverlay] Failed to add whiteboard clarification:', err);
  }
}

export function clearWhiteboard() {
  try {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      sendToOverlay('overlay:whiteboard-clear');
    }
  } catch (err) {
    console.error('[ScreenOverlay] Failed to clear whiteboard:', err);
  }
}

export function closeWhiteboard() {
  try {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      sendToOverlay('overlay:whiteboard-close');
      overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    }
  } catch (err) {
    console.error('[ScreenOverlay] Failed to close whiteboard:', err);
  }
}


