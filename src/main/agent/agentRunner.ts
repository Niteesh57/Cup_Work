import { GoogleGenAI } from '@google/genai';
import { UiaBridge } from '../bridge/uiaBridge';
import { desktopToolDeclarations, executeToolCall } from './tools';
import { AgentStep, ExecutionResponse } from '../../shared/types';
import dotenv from 'dotenv';
import path from 'path';

// Load .env configuration
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export class AgentRunner {
  private uiaBridge: UiaBridge;

  constructor() {
    this.uiaBridge = new UiaBridge();
  }

  /**
   * Fast local intent fallback for standard deterministic OS prompts
   */
  private checkLocalIntent(prompt: string): { actionName: string; args: Record<string, unknown> } | null {
    const p = prompt.toLowerCase().trim();
    if (p.includes('minimize all') || p.includes('minimize windows') || p.includes('show desktop') || p.includes('hide all windows')) {
      return { actionName: 'minimize_all_windows', args: {} };
    }
    if (p.startsWith('launch ') || p.startsWith('open ')) {
      const app = p.replace(/^(launch|open)\s+/, '').replace(/\s+app$/, '').trim();
      if (app) return { actionName: 'launch_app', args: { appName: app } };
    }
    if (p.includes('screenshot') || p.includes('capture screen')) {
      return { actionName: 'take_screenshot', args: {} };
    }
    return null;
  }

  public async runTask(
    prompt: string,
    onStepUpdate?: (step: AgentStep) => void,
    userApiKey?: string,
    userModel?: string
  ): Promise<ExecutionResponse> {
    const apiKey = userApiKey || process.env.GEMINI_API_KEY || '';
    const steps: AgentStep[] = [];

    // Fallback: If local deterministic action matches
    const localMatch = this.checkLocalIntent(prompt);

    if (!apiKey) {
      if (localMatch) {
        // Execute direct local action even without API Key
        const stepId = `step-${Date.now()}`;
        const executed = await executeToolCall(localMatch.actionName, localMatch.args, this.uiaBridge);
        const step: AgentStep = {
          id: stepId,
          timestamp: new Date().toLocaleTimeString(),
          thought: `Local Intent Execution: ${prompt}`,
          actionName: localMatch.actionName,
          parameters: localMatch.args,
          result: executed.result,
          success: executed.stepData.success ?? false,
          screenshotUrl: executed.stepData.screenshotUrl
        };
        steps.push(step);
        if (onStepUpdate) onStepUpdate(step);

        return {
          success: executed.stepData.success ?? false,
          message: String(executed.result.message || 'Executed action locally.'),
          steps
        };
      }

      return {
        success: false,
        message: 'Gemini API Key is missing. Please enter your API Key in Settings or set GEMINI_API_KEY in .env.',
        steps: [],
        error: 'API_KEY_MISSING'
      };
    }

    // Standard production Gemini models
    const modelName = userModel || process.env.GEMINI_MODEL || 'gemini-2.0-flash';
    const ai = new GoogleGenAI({ apiKey });

    const systemInstruction = `You are Hey Jave, a high-performance Windows Desktop Automation AI Agent.
Your goal is to inspect the user request, plan the sequence of actions, and execute system level tools to fulfill the task on Windows.

Available Tool Strategies:
1. Window Management: Minimize all windows ('minimize_all_windows'), minimize specific window ('minimize_window'), focus window ('focus_window'), launch app ('launch_app').
2. System Input & Hotkeys: Trigger Windows key shortcuts ('press_hotkey' with WIN+d, WIN+r, ALT+tab).
3. UI Automation: Click UI elements ('uia_click') or type text ('uia_type').
4. Inspection: Query open desktop windows ('get_open_windows') or capture screen ('take_screenshot').

Rules:
- Execute actions step-by-step. Explain your reasoning briefly before each tool call.
- If asked to minimize windows, use 'minimize_all_windows' or 'minimize_window'.
- Verify actions where necessary. When finished, provide a concise confirmation summary to the user.`;

    try {
      // Initialize multi-turn chat session with tools
      const chat = ai.chats.create({
        model: modelName,
        config: {
          systemInstruction,
          tools: [{ functionDeclarations: desktopToolDeclarations }]
        }
      });

      let response = await chat.sendMessage({ message: prompt });
      let turns = 0;
      const MAX_TURNS = 10;

      while (turns < MAX_TURNS) {
        turns++;
        const functionCalls = response.functionCalls;

        if (!functionCalls || functionCalls.length === 0) {
          // Final text response reached
          const finalText = response.text || 'Task execution finished successfully.';
          return {
            success: true,
            message: finalText,
            steps
          };
        }

        // Execute function calls sequentially
        for (const call of functionCalls) {
          const actionName = call.name || 'unknown_action';
          const stepId = `step-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
          const thought = response.text || `Executing desktop action: ${actionName}`;
          
          let toolResult: Record<string, unknown> = {};
          let partialStep: Partial<AgentStep> = {};

          try {
            const executed = await executeToolCall(actionName, (call.args as Record<string, unknown>) || {}, this.uiaBridge);
            toolResult = executed.result;
            partialStep = executed.stepData;
          } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            toolResult = { success: false, error: errorMsg };
            partialStep = { actionName, parameters: (call.args as Record<string, unknown>) || {}, success: false };
          }

          const completeStep: AgentStep = {
            id: stepId,
            timestamp: new Date().toLocaleTimeString(),
            thought,
            actionName,
            parameters: (call.args as Record<string, unknown>) || {},
            result: toolResult,
            success: partialStep.success ?? false,
            screenshotUrl: partialStep.screenshotUrl
          };

          steps.push(completeStep);
          if (onStepUpdate) {
            onStepUpdate(completeStep);
          }

          // Send function result back to Gemini conversation thread
          response = await chat.sendMessage({
            message: [
              {
                functionResponse: {
                  name: actionName,
                  response: toolResult
                }
              }
            ]
          });
        }
      }

      return {
        success: true,
        message: 'Completed maximum allowed execution steps.',
        steps
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Fallback if LLM API call throws an exception (e.g. invalid model / network error)
      if (localMatch && steps.length === 0) {
        const stepId = `step-${Date.now()}`;
        const executed = await executeToolCall(localMatch.actionName, localMatch.args, this.uiaBridge);
        const step: AgentStep = {
          id: stepId,
          timestamp: new Date().toLocaleTimeString(),
          thought: `Fallback Action Execution for '${prompt}': ${errorMessage}`,
          actionName: localMatch.actionName,
          parameters: localMatch.args,
          result: executed.result,
          success: executed.stepData.success ?? false,
          screenshotUrl: executed.stepData.screenshotUrl
        };
        steps.push(step);
        if (onStepUpdate) onStepUpdate(step);

        return {
          success: executed.stepData.success ?? false,
          message: `Executed action via local engine (${executed.result.message || 'Done'})`,
          steps
        };
      }

      return {
        success: false,
        message: `Gemini API Error: ${errorMessage}`,
        steps,
        error: errorMessage
      };
    }
  }
}
