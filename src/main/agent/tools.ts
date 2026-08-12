import { FunctionDeclaration, Type } from '@google/genai';
import { UiaBridge } from '../bridge/uiaBridge';
import { AgentStep } from '../../shared/types';

export const desktopToolDeclarations: FunctionDeclaration[] = [
  {
    name: 'minimize_all_windows',
    description: 'Minimizes all currently active desktop windows, taking the user to the Desktop.',
    parameters: {
      type: Type.OBJECT,
      properties: {}
    }
  },
  {
    name: 'minimize_window',
    description: 'Minimizes a specific application window by matching its title.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        windowTitle: {
          type: Type.STRING,
          description: 'Title or partial title of the window to minimize (e.g., "Notepad", "Chrome", "Calculator")'
        }
      },
      required: ['windowTitle']
    }
  },
  {
    name: 'focus_window',
    description: 'Brings a specific application window to the foreground.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        windowTitle: {
          type: Type.STRING,
          description: 'Title or partial title of the window to bring to front'
        }
      },
      required: ['windowTitle']
    }
  },
  {
    name: 'launch_app',
    description: 'Launches a Windows application by name or executable path (e.g., "notepad", "calc", "chrome", "explorer").',
    parameters: {
      type: Type.OBJECT,
      properties: {
        appName: {
          type: Type.STRING,
          description: 'Executable name or path to start (e.g. "notepad", "calc", "cmd", "explorer")'
        }
      },
      required: ['appName']
    }
  },
  {
    name: 'press_hotkey',
    description: 'Triggers a system keyboard hotkey shortcut on Windows.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        modifier: {
          type: Type.STRING,
          description: 'Modifier key: WIN, ALT, or CTRL'
        },
        key: {
          type: Type.STRING,
          description: 'Key char (e.g., "d" for Win+D, "r" for Win+R, "tab" for Alt+Tab)'
        }
      },
      required: ['modifier', 'key']
    }
  },
  {
    name: 'uia_click',
    description: 'Clicks on a UI element (button, checkbox, menu item, tab) using Windows UI Automation.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        elementName: {
          type: Type.STRING,
          description: 'Accessible label, title, or button text'
        },
        controlType: {
          type: Type.STRING,
          description: 'Optional UIA control type (e.g., "Button", "Edit", "MenuItem", "TabItem")'
        }
      },
      required: ['elementName']
    }
  },
  {
    name: 'uia_type',
    description: 'Types text into an active input field or window.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        elementName: {
          type: Type.STRING,
          description: 'Accessible name or description of the field'
        },
        text: {
          type: Type.STRING,
          description: 'Text string to type into the input field'
        }
      },
      required: ['elementName', 'text']
    }
  },
  {
    name: 'get_open_windows',
    description: 'Queries the list of currently open top-level desktop windows.',
    parameters: {
      type: Type.OBJECT,
      properties: {}
    }
  },
  {
    name: 'take_screenshot',
    description: 'Captures a fresh screenshot of the primary desktop display.',
    parameters: {
      type: Type.OBJECT,
      properties: {}
    }
  }
];

export async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
  uiaBridge: UiaBridge
): Promise<{ result: Record<string, unknown>; stepData: Partial<AgentStep> }> {
  const stepData: Partial<AgentStep> = {
    actionName: name,
    parameters: args
  };

  switch (name) {
    case 'minimize_all_windows': {
      const res = await uiaBridge.minimizeAll();
      stepData.success = res.success;
      return { result: res as unknown as Record<string, unknown>, stepData };
    }
    case 'minimize_window': {
      const res = await uiaBridge.minimizeWindow(String(args.windowTitle || ''));
      stepData.success = res.success;
      return { result: res as unknown as Record<string, unknown>, stepData };
    }
    case 'focus_window': {
      const res = await uiaBridge.focusWindow(String(args.windowTitle || ''));
      stepData.success = res.success;
      return { result: res as unknown as Record<string, unknown>, stepData };
    }
    case 'launch_app': {
      const res = await uiaBridge.launchApp(String(args.appName || ''));
      stepData.success = res.success;
      return { result: res as unknown as Record<string, unknown>, stepData };
    }
    case 'press_hotkey': {
      const res = await uiaBridge.pressHotkey(
        args.modifier as 'WIN' | 'ALT' | 'CTRL',
        String(args.key || '')
      );
      stepData.success = res.success;
      return { result: res as unknown as Record<string, unknown>, stepData };
    }
    case 'uia_click': {
      const res = await uiaBridge.uiaClick(
        String(args.elementName || ''),
        args.controlType ? String(args.controlType) : undefined
      );
      stepData.success = res.success;
      return { result: res as unknown as Record<string, unknown>, stepData };
    }
    case 'uia_type': {
      const res = await uiaBridge.uiaType(
        String(args.elementName || ''),
        String(args.text || '')
      );
      stepData.success = res.success;
      return { result: res as unknown as Record<string, unknown>, stepData };
    }
    case 'get_open_windows': {
      const res = await uiaBridge.getWindows();
      stepData.success = res.success;
      return { result: res as unknown as Record<string, unknown>, stepData };
    }
    case 'take_screenshot': {
      const res = await uiaBridge.takeScreenshot();
      stepData.success = res.success;
      if (res.base64) {
        stepData.screenshotUrl = `data:image/png;base64,${res.base64}`;
      }
      return { result: { success: res.success, message: res.message }, stepData };
    }
    default:
      throw new Error(`Unrecognized tool call: ${name}`);
  }
}
