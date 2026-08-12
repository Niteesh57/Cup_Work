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

      const inputPayload = JSON.stringify({ action, params });

      const args = [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-File', this.scriptPath,
        '-InputJson', inputPayload
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
}
