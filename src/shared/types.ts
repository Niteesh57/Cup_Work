export type AgentStatus = 'idle' | 'analyzing' | 'executing' | 'verifying' | 'completed' | 'error';

export type LogLevel = 'info' | 'warn' | 'error' | 'step';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  details?: Record<string, unknown>;
}

export interface AgentStep {
  id: string;
  timestamp: string;
  thought: string;
  actionName: string;
  parameters: Record<string, unknown>;
  result?: Record<string, unknown>;
  success?: boolean;
  screenshotUrl?: string;
}

export interface ExecutionRequest {
  prompt: string;
  apiKey?: string;
  model?: string;
}

export interface ExecutionResponse {
  success: boolean;
  message: string;
  steps: AgentStep[];
  error?: string;
}

export interface WindowInfo {
  handle: number;
  title: string;
  processName: string;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  isMinimized: boolean;
}

export interface UiaElementSelector {
  name?: string;
  controlType?: string;
  automationId?: string;
  className?: string;
  windowTitle?: string;
}

export interface UiaActionResult {
  success: boolean;
  method: 'UIA_NATIVE' | 'SEND_INPUT' | 'SYSTEM_API' | 'VISION_FALLBACK';
  message: string;
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  error?: string;
}

export interface AppConfig {
  geminiApiKey: string;
  geminiModel: string;
  uiaTimeoutMs: number;
  enableVisionFallback: boolean;
}
