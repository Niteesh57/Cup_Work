import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { UiaActionResult, WindowInfo } from '../../shared/types';

export class UiaBridge {
  private scriptPath: string;

  constructor() {
    // Robust multi-path resolution for uia-engine.ps1
    const candidatePaths = [
      path.resolve(process.cwd(), 'src/bridge/uia-engine.ps1'),
      path.resolve(__dirname, '../src/bridge/uia-engine.ps1'),
      path.resolve(__dirname, '../../src/bridge/uia-engine.ps1'),
      path.resolve(__dirname, './uia-engine.ps1'),
      path.resolve(process.cwd(), 'uia-engine.ps1')
    ];

    const foundPath = candidatePaths.find((p) => fs.existsSync(p));
    if (foundPath) {
      this.scriptPath = foundPath;
    } else {
      // Fallback to primary project path
      this.scriptPath = candidatePaths[0];
    }
  }

  /**
   * Executes a command on the PowerShell UIA Native Engine
   */
  private async executeCommand<T = unknown>(action: string, params: Record<string, unknown> = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(this.scriptPath)) {
        return reject(new Error(`UIA Engine script not found at path: ${this.scriptPath}`));
      }

      const jsonStr = JSON.stringify({ action, params });
      const base64Payload = Buffer.from(jsonStr, 'utf-8').toString('base64');

      const args = [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-File', this.scriptPath,
        '-Base64', base64Payload
      ];

      execFile('powershell.exe', args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          return reject(new Error(`UIA Bridge Execution Error: ${error.message}. Stderr: ${stderr}`));
        }

        try {
          const parsed = JSON.parse(stdout.trim());
          resolve(parsed as T);
        } catch (parseError) {
          reject(new Error(`Failed to parse JSON response from UIA engine: ${stdout}. Error: ${parseError}`));
        }
      });
    });
  }

  /**
   * Minimizes all windows on the desktop
   */
  public async minimizeAll(): Promise<UiaActionResult> {
    return this.executeCommand<UiaActionResult>('MINIMIZE_ALL');
  }

  /**
   * Minimizes a window matching the title substring
   */
  public async minimizeWindow(title: string): Promise<UiaActionResult> {
    return this.executeCommand<UiaActionResult>('MINIMIZE_WINDOW', { title });
  }

  /**
   * Brings a window matching the title substring to the foreground
   */
  public async focusWindow(title: string): Promise<UiaActionResult> {
    return this.executeCommand<UiaActionResult>('FOCUS_WINDOW', { title });
  }

  /**
   * Launches a process/application on Windows
   */
  public async launchApp(appName: string): Promise<UiaActionResult> {
    return this.executeCommand<UiaActionResult>('LAUNCH_APP', { appName });
  }

  /**
   * Executes a hotkey sequence (e.g. Win+D, Win+R, Alt+Tab)
   */
  public async pressHotkey(modifier: 'WIN' | 'ALT' | 'CTRL', key: string): Promise<UiaActionResult> {
    return this.executeCommand<UiaActionResult>('PRESS_HOTKEY', { modifier, key });
  }

  /**
   * Clicks on an element by UIA name or bounds
   */
  public async uiaClick(name: string, controlType?: string): Promise<UiaActionResult> {
    return this.executeCommand<UiaActionResult>('UIA_CLICK', { name, controlType });
  }

  /**
   * Sets or types text into a targeted element
   */
  public async uiaType(name: string, text: string): Promise<UiaActionResult> {
    return this.executeCommand<UiaActionResult>('UIA_TYPE', { name, text });
  }

  /**
   * Moves mouse cursor directly to (x, y) coordinates
   */
  public async mouseMove(x: number, y: number): Promise<UiaActionResult> {
    return this.executeCommand<UiaActionResult>('MOUSE_MOVE', { x, y });
  }

  /**
   * Performs mouse click at (x, y) coordinates with specified button ('left', 'right', 'double')
   */
  public async mouseClick(x: number, y: number, button: 'left' | 'right' | 'double' = 'left'): Promise<UiaActionResult> {
    return this.executeCommand<UiaActionResult>('MOUSE_CLICK', { x, y, button });
  }

  /**
   * Direct low-level keyboard text input
   */
  public async keyboardType(text: string): Promise<UiaActionResult> {
    return this.executeCommand<UiaActionResult>('KEYBOARD_TYPE', { text });
  }

  /**
   * Direct low-level virtual key trigger
   */
  public async keyboardKey(key: string): Promise<UiaActionResult> {
    return this.executeCommand<UiaActionResult>('KEYBOARD_KEY', { key });
  }

  /**
   * Captures primary screen screenshot as base64 PNG
   */
  public async takeScreenshot(): Promise<{ success: boolean; base64?: string; message?: string }> {
    return this.executeCommand<{ success: boolean; base64?: string; message?: string }>('TAKE_SCREENSHOT');
  }

  /**
   * Retrieves list of open desktop windows
   */
  public async getWindows(): Promise<{ success: boolean; windows?: WindowInfo[]; message?: string }> {
    return this.executeCommand<{ success: boolean; windows?: WindowInfo[]; message?: string }>('GET_WINDOWS');
  }

  /**
   * Scrolls the mouse wheel by delta clicks, optionally moving to (x, y) first.
   */
  public async scroll(delta: number, x?: number, y?: number): Promise<UiaActionResult> {
    return this.executeCommand<UiaActionResult>('SCROLL', { delta, x, y });
  }

  /**
   * Displays an interactive on-screen Scratchpad overlay with message and suggested commands
   */
  public async showScratchpad(title: string, message: string, command: string): Promise<{ success: boolean; action?: string; command?: string }> {
    return this.executeCommand<{ success: boolean; action?: string; command?: string }>('SHOW_SCRATCHPAD', { title, message, command });
  }

  /**
   * Prompts the user with a question and selectable options (or free-form text) via the on-screen overlay
   */
  public async askHuman(question: string, options: string[] = []): Promise<{ success: boolean; action?: string; answer?: string }> {
    return this.executeCommand<{ success: boolean; action?: string; answer?: string }>('ASK_HUMAN', { question, options, type: 'question' });
  }

  /**
   * Renders multi-colored highlight boxes and directional arrows directly on the screen
   */
  public async showAnnotations(boxes: Array<Record<string, unknown>> = [], arrows: Array<Record<string, unknown>> = [], durationSeconds = 6): Promise<{ success: boolean; message?: string }> {
    return this.executeCommand<{ success: boolean; message?: string }>('SHOW_ANNOTATIONS', { boxes, arrows, durationSeconds });
  }

  /**
   * Highlights a single step box on screen
   */
  public async highlightBox(x: number, y: number, width: number, height: number, color = 'cyan', label = '', stepNumber = 0): Promise<{ success: boolean; message?: string }> {
    return this.executeCommand<{ success: boolean; message?: string }>('HIGHLIGHT_BOX', { x, y, width, height, color, label, stepNumber });
  }

  /**
   * Unified tool execution dispatcher
   */
  public async executeTool(name: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    switch (name) {
      case 'minimize_all_windows':
        return (await this.minimizeAll()) as unknown as Record<string, unknown>;
      case 'minimize_window':
        return (await this.minimizeWindow(String(args.windowTitle || args.title || ''))) as unknown as Record<string, unknown>;
      case 'focus_window':
        return (await this.focusWindow(String(args.windowTitle || args.title || ''))) as unknown as Record<string, unknown>;
      case 'launch_app':
        return (await this.launchApp(String(args.appName || ''))) as unknown as Record<string, unknown>;
      case 'press_hotkey':
        return (await this.pressHotkey(
          (args.modifier as 'WIN' | 'ALT' | 'CTRL') || 'CTRL',
          String(args.key || '')
        )) as unknown as Record<string, unknown>;
      case 'uia_click':
        return (await this.uiaClick(
          String(args.elementName || args.name || ''),
          args.controlType ? String(args.controlType) : undefined
        )) as unknown as Record<string, unknown>;
      case 'uia_type':
        return (await this.uiaType(
          String(args.elementName || args.name || ''),
          String(args.text || '')
        )) as unknown as Record<string, unknown>;
      case 'mouse_move':
        return (await this.mouseMove(Number(args.x), Number(args.y))) as unknown as Record<string, unknown>;
      case 'mouse_click':
        return (await this.mouseClick(
          Number(args.x),
          Number(args.y),
          (args.button as 'left' | 'right' | 'double') || 'left'
        )) as unknown as Record<string, unknown>;
      case 'keyboard_type':
        return (await this.keyboardType(String(args.text || ''))) as unknown as Record<string, unknown>;
      case 'keyboard_key':
        return (await this.keyboardKey(String(args.key || ''))) as unknown as Record<string, unknown>;
      case 'get_open_windows':
        return (await this.getWindows()) as unknown as Record<string, unknown>;
      case 'take_screenshot':
        return (await this.takeScreenshot()) as unknown as Record<string, unknown>;
      case 'scroll':
        return (await this.scroll(
          Number(args.delta),
          args.x !== undefined ? Number(args.x) : undefined,
          args.y !== undefined ? Number(args.y) : undefined
        )) as unknown as Record<string, unknown>;
      case 'show_screenpad':
        return (await this.showScratchpad(
          String(args.title || 'Scratchpad'),
          String(args.message || 'Suggested content:'),
          String(args.content || '')
        )) as unknown as Record<string, unknown>;
      case 'ask_human':
        return (await this.askHuman(
          String(args.question || ''),
          Array.isArray(args.options) ? (args.options as string[]) : []
        )) as unknown as Record<string, unknown>;
      case 'highlight_box':
        return (await this.highlightBox(
          Number(args.x),
          Number(args.y),
          Number(args.width),
          Number(args.height),
          String(args.color || 'cyan'),
          String(args.label || ''),
          args.stepNumber !== undefined ? Number(args.stepNumber) : 0
        )) as unknown as Record<string, unknown>;
      case 'wait_seconds': {
        const secs = Number(args.seconds || 2);
        await new Promise((r) => setTimeout(r, secs * 1000));
        return { success: true, message: `Waited ${secs} seconds` };
      }
      default:
        throw new Error(`Unrecognized tool call in UiaBridge: ${name}`);
    }
  }
}




