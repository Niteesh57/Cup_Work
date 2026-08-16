// ── Agent Status (legacy, kept for compatibility) ────────────────────────────
export type AgentStatus = 'idle' | 'analyzing' | 'executing' | 'verifying' | 'completed' | 'error';

// ── Agent Types ───────────────────────────────────────────────────────────────
export type AgentType =
  | 'orchestrator' | 'execution' | 'research'
  | 'highlight'    | 'clarifier' | 'sleep';

// ── Task Lifecycle State Machine ──────────────────────────────────────────────
export type TaskLifecycle =
  | 'IDLE' | 'RUNNING' | 'WAITING_FOR_HUMAN'
  | 'PAUSED' | 'RESUMING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

// ── Task Checkpoint (save/restore state for resume) ───────────────────────────
export interface TaskCheckpoint {
  taskId:          string;
  agentType:       AgentType;
  status:          TaskLifecycle;
  goal:            string;
  currentStep:     number;
  completedSteps:  string[];      // step IDs already done — skip on resume
  conversationHistory: ChatMessage[]; // Gemini message history to restore
  pendingQuestion?: string;
  pendingOptions?:  string[];
  browserContext?:  string;
  timestamp:        number;
}

// ── Conversation message ──────────────────────────────────────────────────────
export interface ChatMessage {
  role:       'system' | 'user' | 'assistant' | 'tool';
  content:    string;
  name?:      string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id:       string;
  type:     'function';
  function: { name: string; arguments: string };
}

// ── Human-in-Loop ─────────────────────────────────────────────────────────────
export interface HumanLoopRequest {
  taskId:       string;
  question:     string;
  options:      string[];     // empty = open voice/text answer
  optionCount:  number;       // ≤2 → TTS only; >2 → ScreenPad
}

export interface HumanLoopResponse {
  taskId:  string;
  answer:  string;
}

// ── Screen Highlight Boxes ────────────────────────────────────────────────────
export interface HighlightBox {
  id:          string;
  x:           number;
  y:           number;
  width:       number;
  height:      number;
  color:       'red' | 'green' | 'yellow' | 'blue';
  label:       string;        // e.g. "Step 1: Click OK"
  stepNumber?: number;
}

// ── ScreenPad / Scratchpad Content ──────────────────────────────────────────
export interface ScreenPadContent {
  id?:                  string;
  title?:               string;
  message?:             string;
  content?:             string;
  command?:             string;
  options?:             string[];
  type?:                'command' | 'code' | 'markdown' | 'options' | 'question' | 'scratchpad';
  requiresConfirmation?: boolean;
}

// ── Agent Event Bus ───────────────────────────────────────────────────────────
export type AgentEventType =
  | 'TASK_SUBMIT'          | 'CLARIFICATION_REQUIRED' | 'HUMAN_RESPONSE'
  | 'USER_STOP'            | 'USER_RESUME'             | 'TIMER_EXPIRED'
  | 'SLEEP_REQUESTED'      | 'CHILD_TASK_DONE'         | 'RESEARCH_JOIN_READY'
  | 'TASK_COMPLETED'       | 'TASK_PAUSED'             | 'AGENT_STEP_UPDATE'
  | 'OVERLAY_SHOW_BOX'     | 'OVERLAY_CLOSE_BOX'       | 'OVERLAY_CLEAR_BOXES'
  | 'OVERLAY_SHOW_SCREENPAD'| 'OVERLAY_CLOSE_SCREENPAD' | 'TTS_SPEAK'
  | 'LISTEN_START'         | 'LISTEN_STOP';

export interface AgentEvent {
  type:       AgentEventType;
  taskId:     string;
  agentType?: AgentType;
  payload?:   Record<string, unknown>;
}

// ── Research Worker ───────────────────────────────────────────────────────────
export interface ResearchWorker {
  workerId:  string;
  subtopic:  string;
  status:    'pending' | 'running' | 'done' | 'failed';
  result?:   string;
}

// ── Voice Intent ──────────────────────────────────────────────────────────────
export type VoiceIntent =
  | 'new_task' | 'clarify' | 'stop' | 'resume' | 'human_response';

// ── Log ───────────────────────────────────────────────────────────────────────
export type LogLevel = 'info' | 'warn' | 'error' | 'step';

export interface LogEntry {
  id:        string;
  timestamp: string;
  level:     LogLevel;
  message:   string;
  details?:  Record<string, unknown>;
}

// ── Agent Step ────────────────────────────────────────────────────────────────
export interface AgentStep {
  id:            string;
  timestamp:     string;
  thought:       string;
  actionName:    string;
  parameters:    Record<string, unknown>;
  result?:       Record<string, unknown>;
  success?:      boolean;
  screenshotUrl?: string;
}

// ── Execution Request / Response ──────────────────────────────────────────────
export interface ExecutionRequest {
  prompt:   string;
  apiKey?:  string;
  model?:   string;
  taskId?:  string;
}

export interface ExecutionResponse {
  success:  boolean;
  message:  string;
  steps:    AgentStep[];
  taskId?:  string;
  error?:   string;
}

// ── Window Info ───────────────────────────────────────────────────────────────
export interface WindowInfo {
  handle:      number;
  title:       string;
  processName: string;
  bounds: {
    x: number; y: number;
    width: number; height: number;
  };
  isMinimized: boolean;
}

// ── UIA ───────────────────────────────────────────────────────────────────────
export interface UiaElementSelector {
  name?:         string;
  controlType?:  string;
  automationId?: string;
  className?:    string;
  windowTitle?:  string;
}

export interface UiaActionResult {
  success: boolean;
  method:  'UIA_NATIVE' | 'SEND_INPUT' | 'SYSTEM_API' | 'VISION_FALLBACK';
  message: string;
  bounds?: { x: number; y: number; width: number; height: number };
  error?:  string;
}

// ── App Config (Fetched dynamically from Python Backend) ─────────────────────
export interface AppConfig {
  geminiModel?: string;
  backendUrl?: string;
  backendWs?: string;
  backendConnected?: boolean;
}


