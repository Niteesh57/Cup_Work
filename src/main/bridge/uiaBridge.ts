import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { shell } from 'electron';
import { UiaActionResult, WindowInfo } from '../../shared/types';
import {
  showScreenPad,
  closeScreenPad,
  showHighlightBox,
  clearAllHighlightBoxes,
  showWhiteboardStep,
  showWhiteboardDiagram,
  addWhiteboardClarification,
  clearWhiteboard,
  closeWhiteboard
} from '../overlayWindow';
import { speakTextNative, stopAllTts, streamGeminiTts } from '../tts';


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
   * Brings a window matching the title substring to the foreground and optionally maximizes it
   */
  public async focusWindow(title: string, maximize: boolean = true): Promise<UiaActionResult> {
    return this.executeCommand<UiaActionResult>('FOCUS_WINDOW', { title, maximize });
  }

  /**
   * Maximizes a window matching the title substring
   */
  public async maximizeWindow(title: string): Promise<UiaActionResult> {
    return this.executeCommand<UiaActionResult>('MAXIMIZE_WINDOW', { title });
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
   * Returns current foreground window title + bounds
   */
  public async getActiveWindow(): Promise<Record<string, unknown>> {
    return this.executeCommand<Record<string, unknown>>('GET_ACTIVE_WINDOW');
  }

  /**
   * Restores a minimized window by title
   */
  public async restoreWindow(title: string): Promise<UiaActionResult> {
    return this.executeCommand<UiaActionResult>('RESTORE_WINDOW', { title });
  }

  /**
   * Sets window x,y,width,height
   */
  public async resizeWindow(title: string, x: number, y: number, width: number, height: number): Promise<UiaActionResult> {
    return this.executeCommand<UiaActionResult>('RESIZE_WINDOW', { title, x, y, width, height });
  }

  /**
   * Reads current clipboard text
   */
  public async readClipboard(): Promise<{ success: boolean; text?: string; message?: string }> {
    return this.executeCommand<{ success: boolean; text?: string; message?: string }>('READ_CLIPBOARD');
  }

  /**
   * Writes text to clipboard
   */
  public async writeClipboard(text: string): Promise<UiaActionResult> {
    return this.executeCommand<UiaActionResult>('WRITE_CLIPBOARD', { text });
  }

  /**
   * Runs a shell command and returns stdout/stderr/exitCode
   */
  public async runShellCommand(command: string, timeoutSeconds = 30): Promise<Record<string, unknown>> {
    return this.executeCommand<Record<string, unknown>>('EXECUTE_COMMAND', { command, timeoutSeconds });
  }

  /**
   * Returns running processes
   */
  public async getProcessList(): Promise<Record<string, unknown>> {
    return this.executeCommand<Record<string, unknown>>('GET_PROCESS_LIST');
  }

  /**
   * Terminates a process by name or PID
   */
  public async killProcess(name?: string, pid?: number): Promise<UiaActionResult> {
    return this.executeCommand<UiaActionResult>('KILL_PROCESS', { name, pid });
  }

  /**
   * Captures a screen region as base64 PNG
   */
  public async screenshotRegion(x: number, y: number, width: number, height: number): Promise<{ success: boolean; base64?: string; message?: string }> {
    return this.executeCommand<{ success: boolean; base64?: string; message?: string }>('SCREENSHOT_REGION', { x, y, width, height });
  }

  /**
   * Returns primary display resolution
   */
  public async getScreenResolution(): Promise<{ success: boolean; width?: number; height?: number; message?: string }> {
    return this.executeCommand<{ success: boolean; width?: number; height?: number; message?: string }>('GET_SCREEN_RESOLUTION');
  }

  /**
   * Performs a drag-drop from (x1,y1) to (x2,y2)
   */
  public async dragDrop(x1: number, y1: number, x2: number, y2: number): Promise<UiaActionResult> {
    return this.executeCommand<UiaActionResult>('DRAG_DROP', { x1, y1, x2, y2 });
  }

  /**
   * Dumps the UIA element tree of the focused window as JSON
   */
  public async uiaGetTree(): Promise<Record<string, unknown>> {
    return this.executeCommand<Record<string, unknown>>('UIA_GET_TREE');
  }

  /**
   * Retrieves all actionable interactive elements (buttons, inputs, links, tabs, etc.)
   * with their exact bounding boxes and center coordinates.
   */
  public async uiaGetInteractiveElements(opts: { windowTitle?: string; maxElements?: number } = {}): Promise<Record<string, unknown>> {
    return this.executeCommand<Record<string, unknown>>('UIA_GET_INTERACTIVE_ELEMENTS', {
      windowTitle: opts.windowTitle || '',
      maxElements: opts.maxElements || 60,
    });
  }

  /**
   * Searches the UIA element tree for controls matching a query string across
   * names, automationIds, class names, or control types.
   */
  public async uiaSearchElements(query: string, opts: { windowTitle?: string; maxResults?: number } = {}): Promise<Record<string, unknown>> {
    return this.executeCommand<Record<string, unknown>>('UIA_SEARCH_ELEMENTS', {
      query,
      windowTitle: opts.windowTitle || '',
      maxResults: opts.maxResults || 30,
    });
  }

  /**
   * Inspects the low-level UI element directly under screen coordinates (x, y).
   */
  public async uiaInspectElementAt(x: number, y: number, normalized = false): Promise<Record<string, unknown>> {
    return this.executeCommand<Record<string, unknown>>('UIA_INSPECT_ELEMENT_AT', { x, y, normalized });
  }

  /**
   * Reads text from a named UIA element
   */
  public async uiaGetText(name: string): Promise<{ success: boolean; text?: string; message?: string }> {
    return this.executeCommand<{ success: boolean; text?: string; message?: string }>('UIA_GET_TEXT', { name });
  }

  /**
   * Finds a UIA element by AutomationId first, then Name + ControlType, and
   * returns its bounds and supported control patterns. Scoped to the focused
   * window (or a specific window title) before falling back to the desktop root.
   */
  public async uiaFind(opts: { name?: string; automationId?: string; controlType?: string; windowTitle?: string } = {}): Promise<Record<string, unknown>> {
    return this.executeCommand<Record<string, unknown>>('UIA_FIND', {
      name: opts.name || '',
      automationId: opts.automationId || '',
      controlType: opts.controlType || '',
      windowTitle: opts.windowTitle || '',
    });
  }

  /**
   * Activates a Button/MenuItem/etc. via the UIA Invoke pattern without moving
   * the mouse. Falls back to SelectionItem, then (rarely) a center click.
   */
  public async uiaInvoke(opts: { name?: string; automationId?: string; controlType?: string; windowTitle?: string } = {}): Promise<Record<string, unknown>> {
    return this.executeCommand<Record<string, unknown>>('UIA_INVOKE', {
      name: opts.name || '',
      automationId: opts.automationId || '',
      controlType: opts.controlType || '',
      windowTitle: opts.windowTitle || '',
    });
  }

  /**
   * Sets text directly in an Edit field via the UIA Value pattern.
   */
  public async uiaSetValue(text: string, opts: { name?: string; automationId?: string; controlType?: string; windowTitle?: string } = {}): Promise<Record<string, unknown>> {
    return this.executeCommand<Record<string, unknown>>('UIA_SET_VALUE', {
      name: opts.name || '',
      automationId: opts.automationId || '',
      controlType: opts.controlType || '',
      windowTitle: opts.windowTitle || '',
      text,
    });
  }

  /**
   * Selects an element (list item, radio, tab) via the UIA SelectionItem pattern.
   */
  public async uiaSelect(opts: { name?: string; automationId?: string; controlType?: string; windowTitle?: string } = {}): Promise<Record<string, unknown>> {
    return this.executeCommand<Record<string, unknown>>('UIA_SELECT', {
      name: opts.name || '',
      automationId: opts.automationId || '',
      controlType: opts.controlType || '',
      windowTitle: opts.windowTitle || '',
    });
  }

  /**
   * Toggles a checkbox/switch via the UIA Toggle pattern.
   */
  public async uiaToggle(opts: { name?: string; automationId?: string; controlType?: string; windowTitle?: string } = {}): Promise<Record<string, unknown>> {
    return this.executeCommand<Record<string, unknown>>('UIA_TOGGLE', {
      name: opts.name || '',
      automationId: opts.automationId || '',
      controlType: opts.controlType || '',
      windowTitle: opts.windowTitle || '',
    });
  }

  /**
   * Expands a menu/tree node via the UIA ExpandCollapse pattern.
   */
  public async uiaExpand(opts: { name?: string; automationId?: string; controlType?: string; windowTitle?: string } = {}): Promise<Record<string, unknown>> {
    return this.executeCommand<Record<string, unknown>>('UIA_EXPAND', {
      name: opts.name || '',
      automationId: opts.automationId || '',
      controlType: opts.controlType || '',
      windowTitle: opts.windowTitle || '',
    });
  }

  /**
   * Scrolls a target element into view via the UIA ScrollItem pattern.
   */
  public async uiaScrollIntoView(opts: { name?: string; automationId?: string; controlType?: string; windowTitle?: string } = {}): Promise<Record<string, unknown>> {
    return this.executeCommand<Record<string, unknown>>('UIA_SCROLL_INTO_VIEW', {
      name: opts.name || '',
      automationId: opts.automationId || '',
      controlType: opts.controlType || '',
      windowTitle: opts.windowTitle || '',
    });
  }

  /**
   * Programmatically closes all annotation overlay windows
   */
  public async clearAnnotations(): Promise<UiaActionResult> {
    return this.executeCommand<UiaActionResult>('CLEAR_ANNOTATIONS');
  }

  /**
   * Scrolls the mouse wheel by delta clicks, optionally moving to (x, y) first.
   */
  public async scroll(delta: number, x?: number, y?: number): Promise<UiaActionResult> {
    return this.executeCommand<UiaActionResult>('SCROLL', { delta, x, y });
  }

  /**
   * Displays an interactive on-screen Scratchpad overlay with formatted markdown, message, and suggested commands
   */
  public async showScratchpad(title: string, message: string, content: string, type = 'auto'): Promise<{ success: boolean; action?: string; command?: string }> {
    return this.executeCommand<{ success: boolean; action?: string; command?: string }>('SHOW_SCRATCHPAD', { title, message, content, command: content, type });
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
  public async showAnnotations(
    boxes: Array<Record<string, unknown>> = [],
    arrows: Array<Record<string, unknown>> = [],
    durationSeconds = 0,
    imageWidth?: number,
    imageHeight?: number
  ): Promise<{ success: boolean; message?: string }> {
    return this.executeCommand<{ success: boolean; message?: string }>('SHOW_ANNOTATIONS', {
      boxes,
      arrows,
      durationSeconds,
      imageWidth,
      imageHeight
    });
  }

  /**
   * Highlights a single step box on screen
   */
  public async highlightBox(x: number, y: number, width: number, height: number, color = 'cyan', label = '', stepNumber = 0): Promise<{ success: boolean; message?: string }> {
    return this.executeCommand<{ success: boolean; message?: string }>('HIGHLIGHT_BOX', { x, y, width, height, color, label, stepNumber });
  }

  /**
   * Speaks text asynchronously via streaming Gemini TTS without blocking tool execution.
   */
  public async speakSync(text: string): Promise<{ success: boolean; message?: string }> {
    if (text && text.trim()) {
      void streamGeminiTts(text);
    }
    return { success: true, message: 'Initiated Gemini TTS stream' };
  }

  /**
   * Unified tool execution dispatcher
   */
  public async executeTool(name: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    switch (name) {
      case 'open_url': {
        const targetUrl = String(args.url || args.link || '');
        if (targetUrl) {
          await shell.openExternal(targetUrl);
          return { success: true, message: `Opened URL: ${targetUrl}` };
        }
        return { success: false, message: 'No URL provided' };
      }
      case 'minimize_all_windows':
        return (await this.minimizeAll()) as unknown as Record<string, unknown>;
      case 'minimize_window':
        return (await this.minimizeWindow(String(args.windowTitle || args.title || ''))) as unknown as Record<string, unknown>;
      case 'focus_window':
        return (await this.focusWindow(
          String(args.windowTitle || args.title || ''),
          args.maximize !== undefined ? Boolean(args.maximize) : true
        )) as unknown as Record<string, unknown>;
      case 'maximize_window':
        return (await this.maximizeWindow(String(args.windowTitle || args.title || ''))) as unknown as Record<string, unknown>;
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
      case 'get_active_window':
        return (await this.getActiveWindow()) as unknown as Record<string, unknown>;
      case 'restore_window':
        return (await this.restoreWindow(String(args.windowTitle || args.title || ''))) as unknown as Record<string, unknown>;
      case 'resize_window':
        return (await this.resizeWindow(
          String(args.windowTitle || args.title || ''),
          Number(args.x),
          Number(args.y),
          Number(args.width),
          Number(args.height)
        )) as unknown as Record<string, unknown>;
      case 'read_clipboard':
        return (await this.readClipboard()) as unknown as Record<string, unknown>;
      case 'write_clipboard':
        return (await this.writeClipboard(String(args.text || ''))) as unknown as Record<string, unknown>;
      case 'execute_command':
        return (await this.runShellCommand(
          String(args.command || ''),
          args.timeoutSeconds !== undefined ? Number(args.timeoutSeconds) : 30
        )) as unknown as Record<string, unknown>;
      case 'get_process_list':
        return (await this.getProcessList()) as unknown as Record<string, unknown>;
      case 'kill_process':
        return (await this.killProcess(
          args.name !== undefined ? String(args.name) : undefined,
          args.pid !== undefined ? Number(args.pid) : undefined
        )) as unknown as Record<string, unknown>;
      case 'screenshot_region':
        return (await this.screenshotRegion(
          Number(args.x),
          Number(args.y),
          Number(args.width),
          Number(args.height)
        )) as unknown as Record<string, unknown>;
      case 'get_screen_resolution':
        return (await this.getScreenResolution()) as unknown as Record<string, unknown>;
      case 'drag_drop':
        return (await this.dragDrop(
          Number(args.x1),
          Number(args.y1),
          Number(args.x2),
          Number(args.y2)
        )) as unknown as Record<string, unknown>;
      case 'uia_get_tree':
        return (await this.uiaGetTree()) as unknown as Record<string, unknown>;
      case 'uia_get_interactive_elements':
        return (await this.uiaGetInteractiveElements({
          windowTitle: args.windowTitle !== undefined ? String(args.windowTitle) : undefined,
          maxElements: args.maxElements !== undefined ? Number(args.maxElements) : undefined,
        })) as unknown as Record<string, unknown>;
      case 'uia_search_elements':
        return (await this.uiaSearchElements(
          String(args.query || args.search || args.name || ''),
          {
            windowTitle: args.windowTitle !== undefined ? String(args.windowTitle) : undefined,
            maxResults: args.maxResults !== undefined ? Number(args.maxResults) : undefined,
          }
        )) as unknown as Record<string, unknown>;
      case 'uia_inspect_element_at':
        return (await this.uiaInspectElementAt(
          Number(args.x),
          Number(args.y),
          Boolean(args.normalized)
        )) as unknown as Record<string, unknown>;
      case 'uia_get_text':
        return (await this.uiaGetText(String(args.elementName || args.name || ''))) as unknown as Record<string, unknown>;
      case 'uia_find':
        return (await this.uiaFind({
          name: args.name !== undefined ? String(args.name) : (args.elementName !== undefined ? String(args.elementName) : undefined),
          automationId: args.automationId !== undefined ? String(args.automationId) : undefined,
          controlType: args.controlType !== undefined ? String(args.controlType) : undefined,
          windowTitle: args.windowTitle !== undefined ? String(args.windowTitle) : undefined,
        })) as unknown as Record<string, unknown>;
      case 'uia_invoke':
        return (await this.uiaInvoke({
          name: args.name !== undefined ? String(args.name) : (args.elementName !== undefined ? String(args.elementName) : undefined),
          automationId: args.automationId !== undefined ? String(args.automationId) : undefined,
          controlType: args.controlType !== undefined ? String(args.controlType) : undefined,
          windowTitle: args.windowTitle !== undefined ? String(args.windowTitle) : undefined,
        })) as unknown as Record<string, unknown>;
      case 'uia_set_value':
        return (await this.uiaSetValue(String(args.text || ''), {
          name: args.name !== undefined ? String(args.name) : (args.elementName !== undefined ? String(args.elementName) : undefined),
          automationId: args.automationId !== undefined ? String(args.automationId) : undefined,
          controlType: args.controlType !== undefined ? String(args.controlType) : undefined,
          windowTitle: args.windowTitle !== undefined ? String(args.windowTitle) : undefined,
        })) as unknown as Record<string, unknown>;
      case 'uia_select':
        return (await this.uiaSelect({
          name: args.name !== undefined ? String(args.name) : (args.elementName !== undefined ? String(args.elementName) : undefined),
          automationId: args.automationId !== undefined ? String(args.automationId) : undefined,
          controlType: args.controlType !== undefined ? String(args.controlType) : undefined,
          windowTitle: args.windowTitle !== undefined ? String(args.windowTitle) : undefined,
        })) as unknown as Record<string, unknown>;
      case 'uia_toggle':
        return (await this.uiaToggle({
          name: args.name !== undefined ? String(args.name) : (args.elementName !== undefined ? String(args.elementName) : undefined),
          automationId: args.automationId !== undefined ? String(args.automationId) : undefined,
          controlType: args.controlType !== undefined ? String(args.controlType) : undefined,
          windowTitle: args.windowTitle !== undefined ? String(args.windowTitle) : undefined,
        })) as unknown as Record<string, unknown>;
      case 'uia_expand':
        return (await this.uiaExpand({
          name: args.name !== undefined ? String(args.name) : (args.elementName !== undefined ? String(args.elementName) : undefined),
          automationId: args.automationId !== undefined ? String(args.automationId) : undefined,
          controlType: args.controlType !== undefined ? String(args.controlType) : undefined,
          windowTitle: args.windowTitle !== undefined ? String(args.windowTitle) : undefined,
        })) as unknown as Record<string, unknown>;
      case 'uia_scroll_into_view':
        return (await this.uiaScrollIntoView({
          name: args.name !== undefined ? String(args.name) : (args.elementName !== undefined ? String(args.elementName) : undefined),
          automationId: args.automationId !== undefined ? String(args.automationId) : undefined,
          controlType: args.controlType !== undefined ? String(args.controlType) : undefined,
          windowTitle: args.windowTitle !== undefined ? String(args.windowTitle) : undefined,
        })) as unknown as Record<string, unknown>;
      case 'show_annotations':
        return (await this.showAnnotations(
          Array.isArray(args.boxes) ? (args.boxes as Array<Record<string, unknown>>) : [],
          Array.isArray(args.arrows) ? (args.arrows as Array<Record<string, unknown>>) : [],
          args.durationSeconds !== undefined ? Number(args.durationSeconds) : 0,
          args.imageWidth !== undefined ? Number(args.imageWidth) : undefined,
          args.imageHeight !== undefined ? Number(args.imageHeight) : undefined
        )) as unknown as Record<string, unknown>;
      case 'clear_annotations':
        return (await this.clearAnnotations()) as unknown as Record<string, unknown>;
      case 'take_screenshot':
        return (await this.takeScreenshot()) as unknown as Record<string, unknown>;
      case 'scroll':
        return (await this.scroll(
          Number(args.delta),
          args.x !== undefined ? Number(args.x) : undefined,
          args.y !== undefined ? Number(args.y) : undefined
        )) as unknown as Record<string, unknown>;
      case 'show_screenpad': {
        const title = String(args.title || 'Scratchpad');
        const message = String(args.message || 'Suggested content:');
        const content = String(args.content || args.command || '');
        const type = String(args.type || 'auto');
        showScreenPad({
          title,
          message,
          content,
          type: type as 'command' | 'code' | 'markdown' | 'options' | 'question' | 'scratchpad',
        });
        return { success: true, message: `Displayed ScreenPad: ${title}` };
      }
      case 'close_screenpad': {
        closeScreenPad();
        return { success: true, message: 'Closed ScreenPad' };
      }
      case 'ask_human': {
        const question = String(args.question || 'Please select an option:');
        const options = Array.isArray(args.options) ? (args.options as string[]) : [];
        if (question.trim()) {
          void speakTextNative(question);
        }
        return {
          success: true,
          question,
          options,
          message: `Presented question in app: ${question}`,
        };
      }

      case 'highlight_box': {
        const boxId = `box-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        showHighlightBox({
          id: boxId,
          x: Number(args.x),
          y: Number(args.y),
          width: Number(args.width),
          height: Number(args.height),
          color: (String(args.color || 'blue')) as 'red' | 'green' | 'yellow' | 'blue',
          label: String(args.label || ''),
          stepNumber: args.stepNumber !== undefined ? Number(args.stepNumber) : undefined,
        });
        return { success: true, id: boxId, message: 'Highlighted element on screen' };
      }
      case 'clear_highlight_boxes': {
        clearAllHighlightBoxes();
        return { success: true, message: 'Cleared highlight boxes' };
      }

      case 'wait_seconds': {
        const secs = Number(args.seconds || 2);
        await new Promise((r) => setTimeout(r, secs * 1000));
        return { success: true, message: `Waited ${secs} seconds` };
      }
      case 'speak_sync':
        return (await this.speakSync(String(args.text || ''))) as unknown as Record<string, unknown>;
      case 'draw_whiteboard_lecture': {
        closeScreenPad();
        const conceptTitle = String(args.conceptTitle || 'Concept');
        const steps = Array.isArray(args.steps) ? (args.steps as Array<Record<string, unknown>>) : [];
        const delaySec = typeof args.stepDelaySeconds === 'number' ? args.stepDelaySeconds : 1.5;


        for (let i = 0; i < steps.length; i++) {
          const stepData = { ...steps[i] };
          stepData.conceptTitle = stepData.conceptTitle || conceptTitle;
          stepData.totalSteps = stepData.totalSteps || stepData.total_steps || steps.length;
          stepData.stepNumber = stepData.stepNumber !== undefined ? stepData.stepNumber : (stepData.step_number !== undefined ? stepData.step_number : (i + 1));
          stepData.stepLabel = stepData.stepLabel || stepData.step_label || stepData.title || `Stage ${i + 1}`;
          stepData.notes = stepData.notes || stepData.bullet_points || stepData.bullets || [];
          stepData.appendMode = i > 0;

          // 1. Render step elements and left sidebar card
          showWhiteboardStep(stepData);

          // 2. Speak narration text via Google Gemini TTS
          const narration = String(stepData.narration || '');
          if (narration.trim()) {
            await speakTextNative(narration);

            // Natural speech duration pacing based on word count + buffer
            const wordCount = narration.trim().split(/\s+/).length;
            const speechDurationMs = Math.max(3500, Math.round((wordCount / 2.2) * 1000) + 1500);
            await new Promise((r) => setTimeout(r, speechDurationMs));
          } else {
            await new Promise((r) => setTimeout(r, 2500));
          }

          // 3. Pause between stages before gliding camera to next step
          if (i < steps.length - 1) {
            await new Promise((r) => setTimeout(r, Math.max(500, delaySec * 1000)));
          }
        }

        return { success: true, message: `Completed ${steps.length}-step whiteboard lecture: ${conceptTitle}` };
      }

      case 'draw_whiteboard_step': {
        showWhiteboardStep(args);
        const narration = String(args.narration || '');
        if (narration.trim()) {
          await speakTextNative(narration);
        }
        await new Promise((r) => setTimeout(r, 1000));
        return { success: true, message: `Rendered whiteboard step: ${args.conceptTitle || 'concept'}` };
      }

      case 'draw_mermaid_diagram': {
        showWhiteboardDiagram(args);
        const narration = String(args.narration || '');
        if (narration.trim()) {
          await speakTextNative(narration);
        }
        await new Promise((r) => setTimeout(r, 1000));
        return { success: true, message: `Rendered whiteboard diagram: ${args.conceptTitle || 'diagram'}` };
      }
      case 'add_whiteboard_clarification': {
        addWhiteboardClarification(args);
        const narration = String(args.narration || '');
        if (narration.trim()) {
          await speakTextNative(narration);
        }
        await new Promise((r) => setTimeout(r, 1000));
        return { success: true, message: `Added clarification note on whiteboard` };
      }

      case 'clear_whiteboard': {
        clearWhiteboard();
        return { success: true, message: `Cleared whiteboard` };
      }
      case 'close_whiteboard': {
        closeWhiteboard();
        return { success: true, message: `Closed whiteboard overlay` };
      }

      default:
        throw new Error(`Unrecognized tool call in UiaBridge: ${name}`);
    }
  }
}





