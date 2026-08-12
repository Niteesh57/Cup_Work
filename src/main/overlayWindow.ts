import { BrowserWindow, screen } from 'electron';
import path from 'path';
import fs from 'fs';

let overlayWindow: BrowserWindow | null = null;

export function createOverlayWindow(): BrowserWindow {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    return overlayWindow;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { x, y, width, height } = primaryDisplay.bounds;

  overlayWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });

  // Screen-saver / Pop-up level keeps the border overlay above Windows taskbar and apps
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');

  // Completely forward all mouse & click events to underlying Windows desktop applications
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  // Locate overlay.html in source or dist output
  const candidates = [
    path.join(__dirname, '../src/renderer/overlay.html'),
    path.join(__dirname, '../../src/renderer/overlay.html'),
    path.join(process.cwd(), 'src/renderer/overlay.html')
  ];

  const htmlPath = candidates.find(p => fs.existsSync(p)) || candidates[0];
  overlayWindow.loadFile(htmlPath);

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });

  return overlayWindow;
}

export function showScreenGlow(promptText?: string) {
  try {
    const win = createOverlayWindow();
    if (win && !win.isDestroyed()) {
      win.showInactive();
      win.webContents.send('overlay:show', promptText);
    }
  } catch (err) {
    console.error('[ScreenOverlay] Failed to show screen glow:', err);
  }
}

export function updateScreenGlow(stepThought?: string) {
  try {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('overlay:update', stepThought);
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
