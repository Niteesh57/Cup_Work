import React, { useState, useEffect } from 'react';
import { AgentStep } from '../../shared/types';
import {
  Bot, Loader2, Zap, Monitor, Type, Keyboard,
  Presentation, Clock, Terminal, ShieldAlert, Pause, Brain,
  ChevronDown, ChevronUp, Layers, HelpCircle, FileCode, Search,
  Eye, Volume2, Sparkles
} from 'lucide-react';


interface ToolCallTimelineProps {
  steps?: AgentStep[];
  isThinking?: boolean;
  isPaused?: boolean;
  isWaitingInput?: boolean;
  isCompleted?: boolean;
  spokeVoice?: boolean;
  hadWhiteboard?: boolean;
  error?: string;
  activeAgent?: string;
  outputTokens?: {
    prompt?: number;
    completion?: number;
    total?: number;
  };
  totalDurationMs?: number;
}

interface AgentMeta {
  name: string;
  label: string;
  badgeClass: string;
  stepColorClass: string;
  icon: React.ReactNode;
}

const AGENT_PROFILES: Record<string, AgentMeta> = {
  root: {
    name: 'root',
    label: 'Root Orchestrator',
    badgeClass: 'badge-primary text-white',
    stepColorClass: 'step-primary',
    icon: <Bot size={12} />,
  },
  strange_planner: {
    name: 'strange_planner',
    label: 'Strange UI Guide',
    badgeClass: 'badge-accent text-white',
    stepColorClass: 'step-accent',
    icon: <Zap size={12} />,
  },
  on_screen_agent: {
    name: 'on_screen_agent',
    label: 'Whiteboard Lecturer',
    badgeClass: 'badge-secondary text-white',
    stepColorClass: 'step-secondary',
    icon: <Presentation size={12} />,
  },
  main_executor: {
    name: 'main_executor',
    label: 'Desktop Executor',
    badgeClass: 'badge-info text-white',
    stepColorClass: 'step-info',
    icon: <Terminal size={12} />,
  },
  clarification: {
    name: 'clarification',
    label: 'Clarification Master',
    badgeClass: 'badge-warning text-slate-900 font-semibold',
    stepColorClass: 'step-warning',
    icon: <HelpCircle size={12} />,
  },
  research: {
    name: 'research',
    label: 'Research Analyst',
    badgeClass: 'badge-info text-white',
    stepColorClass: 'step-info',
    icon: <Search size={12} />,
  },
  general_agent: {
    name: 'general_agent',
    label: 'Friendly Companion',
    badgeClass: 'badge-neutral text-white',
    stepColorClass: 'step-neutral',
    icon: <Sparkles size={12} />,
  },
  general: {
    name: 'general',
    label: 'Friendly Companion',
    badgeClass: 'badge-neutral text-white',
    stepColorClass: 'step-neutral',
    icon: <Sparkles size={12} />,
  },
  scratchpad: {
    name: 'scratchpad',
    label: 'Code & Commands',
    badgeClass: 'badge-neutral text-white',
    stepColorClass: 'step-neutral',
    icon: <FileCode size={12} />,
  },
};

function resolveAgentMeta(rawAgentName?: string): AgentMeta {
  if (!rawAgentName) return AGENT_PROFILES.root;
  const key = rawAgentName.toLowerCase().trim();
  if (AGENT_PROFILES[key]) return AGENT_PROFILES[key];

  const formattedLabel = rawAgentName
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
  return {
    name: rawAgentName,
    label: formattedLabel,
    badgeClass: 'badge-primary text-white',
    stepColorClass: 'step-primary',
    icon: <Layers size={12} />,
  };
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
  minimize_all_windows: <Monitor size={13} />,
  minimize_window:      <Monitor size={13} />,
  focus_window:         <Monitor size={13} />,
  launch_app:           <Zap size={13} />,
  press_hotkey:         <Keyboard size={13} />,
  uia_click:            <Zap size={13} />,
  uia_type:             <Type size={13} />,
  mouse_move:           <Zap size={13} />,
  mouse_click:          <Zap size={13} />,
  keyboard_type:        <Type size={13} />,
  keyboard_key:         <Keyboard size={13} />,
  get_open_windows:     <Monitor size={13} />,
  take_screenshot:      <Eye size={13} />,
  draw_whiteboard_lecture: <Presentation size={13} />,
  draw_whiteboard_step: <Presentation size={13} />,
  draw_mermaid_diagram: <Presentation size={13} />,
  add_whiteboard_clarification: <HelpCircle size={13} />,
  show_annotations:     <Zap size={13} />,
  show_screenpad:       <FileCode size={13} />,
  ask_human:            <HelpCircle size={13} />,
  smart_ui_action:      <Zap size={13} />,
  uia_invoke:           <Zap size={13} />,
  search_and_explore_places: <Search size={13} />,
  read_grounded_news:   <Search size={13} />,
  create_todo_task:     <Zap size={13} />,
  update_todo_task:     <Zap size={13} />,
  list_todo_tasks:      <Layers size={13} />,
  set_user_preference:  <Bot size={13} />,
};

function formatStepLabel(actionName?: string, agentName?: string): string {
  if (!actionName) return agentName ? agentName.replace(/_/g, ' ') : 'Action';
  const clean = actionName
    .replace(/^browser_/, '')
    .replace(/_tool$/, '')
    .replaceAll('_', ' ');
  return clean.length > 18 ? clean.substring(0, 16) + '…' : clean;
}

function getTwoDigitSeconds(ms?: number): number {
  if (!ms || ms < 0) return 1;
  const sec = Math.round(ms / 1000);
  return Math.min(99, Math.max(0, sec));
}

export function ToolCallTimeline({
  steps = [],
  isThinking = false,
  isPaused = false,
  isWaitingInput = false,
  spokeVoice = false,
  error,
  activeAgent: propActiveAgent,
  totalDurationMs,
}: ToolCallTimelineProps) {
  const [runningSeconds, setRunningSeconds] = useState(0);
  // COLLAPSED BY DEFAULT so the UI stays simple, clean, and not taking huge space
  const [showThinkingDetails, setShowThinkingDetails] = useState(false);

  useEffect(() => {
    if (!isThinking) {
      setRunningSeconds(0);
      return;
    }
    if (isPaused || isWaitingInput) {
      return;
    }
    const timer = setInterval(() => {
      setRunningSeconds(prev => (prev >= 99 ? 99 : prev + 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [isThinking, isPaused, isWaitingInput]);

  if (steps.length === 0 && !isThinking) {
    return null;
  }

  const lastStepAgent = steps.length > 0 ? steps[steps.length - 1].agentName : undefined;
  const currentActiveAgentName = propActiveAgent || lastStepAgent || 'root';
  const currentAgentMeta = resolveAgentMeta(currentActiveAgentName);

  const durationSec = isThinking
    ? runningSeconds
    : getTwoDigitSeconds(totalDurationMs || steps.reduce((sum, s) => sum + (s.durationMs || 1000), 0));

  const hasAnyFailure = steps.some(s => s.success === false) || !!error;

  return (
    <div className="w-full my-2.5 space-y-2 font-sans select-text">

      {/* ── 1. DAISYUI STEPS HORIZONTAL (SCROLLABLE WRAPPER) ── */}
      {/* Exactly as shown on https://daisyui.com/components/steps/ # With scrollable wrapper */}
      <div className="w-full overflow-x-auto py-3 px-3 bg-base-200/50 hover:bg-base-200/70 transition-colors rounded-2xl border border-base-300 scrollbar-thin scrollbar-thumb-base-300">
        <ul className="steps steps-horizontal w-full min-w-max">
          {steps.map((step, idx) => {
            const sAgentMeta = resolveAgentMeta(step.agentName);
            const isFailed = step.success === false;
            const stepColorClass = isFailed
              ? 'step-error'
              : sAgentMeta.stepColorClass || 'step-primary';

            return (
              <li
                key={step.id || `step-${idx}`}
                data-content={isFailed ? '✕' : `${idx + 1}`}
                onClick={() => setShowThinkingDetails(true)}
                className={`step ${stepColorClass} cursor-pointer transition-all hover:scale-105`}
                title={`Step ${idx + 1}: ${step.actionName} (${sAgentMeta.label}) - Click to inspect`}
              >
                <div className="text-[11px] font-semibold text-slate-700 max-w-[120px] truncate mt-1">
                  {formatStepLabel(step.actionName, step.agentName)}
                </div>
              </li>
            );
          })}

          {/* In-Flight Running Step */}
          {isThinking && (
            <li
              data-content={isPaused ? '⏸' : `${steps.length + 1}`}
              className="step step-warning animate-pulse cursor-pointer"
              onClick={() => setShowThinkingDetails(true)}
              title="Step running in real-time"
            >
              <div className="text-[11px] font-bold text-amber-800 max-w-[120px] truncate mt-1">
                {isPaused ? 'Paused' : currentAgentMeta.label}
              </div>
            </li>
          )}
        </ul>
      </div>

      {/* ── 2. COMPACT SUMMARY BAR & "THINKING" TOGGLE ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Active Agent Badge */}
          <span className={`badge ${currentAgentMeta.badgeClass} badge-sm font-semibold gap-1 py-2 px-2.5 rounded-lg shadow-2xs`}>
            {currentAgentMeta.icon}
            <span>{currentAgentMeta.label}</span>
          </span>

          {/* Live Execution Status */}
          {isThinking ? (
            <span className="text-amber-800 font-semibold flex items-center gap-1.5 animate-pulse text-[11px]">
              {isPaused ? (
                <>
                  <Pause size={12} className="text-warning" /> Paused
                </>
              ) : (
                <>
                  <Loader2 size={12} className="animate-spin text-amber-600" /> Executing ({runningSeconds}s)…
                </>
              )}
            </span>
          ) : (
            <span className="text-slate-500 font-medium flex items-center gap-1 text-[11px]">
              <Clock size={11} className="text-slate-400" /> {durationSec}s • {steps.length} {steps.length === 1 ? 'step' : 'steps'}
            </span>
          )}

          {spokeVoice && (
            <span className="badge badge-accent badge-xs font-medium text-white gap-0.5">
              <Volume2 size={9} /> Voice
            </span>
          )}

          {hasAnyFailure && (
            <span className="badge badge-error badge-xs font-medium text-white gap-0.5">
              <ShieldAlert size={9} /> Issue
            </span>
          )}
        </div>

        {/* Thinking Accordion Button (Collapsed by default) */}
        <button
          type="button"
          onClick={() => setShowThinkingDetails(prev => !prev)}
          className="btn btn-ghost btn-xs text-[11px] text-slate-600 hover:text-primary gap-1 font-medium px-2 py-0.5 rounded-lg border border-base-300 bg-base-100 shadow-2xs"
        >
          <Brain size={12} className={showThinkingDetails ? 'text-primary' : 'text-slate-400'} />
          <span>{showThinkingDetails ? 'Hide Thinking' : 'Thinking Process'}</span>
          {showThinkingDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {/* ── 3. COLLAPSIBLE THINKING COLUMN / DETAILS (Hidden by default) ── */}
      {showThinkingDetails && (
        <div className="p-3 bg-base-100 rounded-2xl border border-base-300 shadow-xs space-y-2.5 animate-fadeIn text-xs">
          <div className="flex items-center justify-between pb-1.5 border-b border-base-200">
            <span className="font-bold text-slate-700 flex items-center gap-1.5 text-xs">
              <Brain size={13} className="text-primary" /> Internal Execution Steps & Thoughts
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              {steps.length} tool calls recorded
            </span>
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {steps.map((step, idx) => {
              const sAgentMeta = resolveAgentMeta(step.agentName);
              const isFailed = step.success === false;

              return (
                <div
                  key={step.id || `detail-${idx}`}
                  className={`p-2.5 rounded-xl border text-xs space-y-1.5 ${
                    isFailed
                      ? 'bg-rose-50 border-rose-200 text-rose-950'
                      : 'bg-base-200/40 border-base-200 text-slate-800'
                  }`}
                >
                  {/* Step Header */}
                  <div className="flex items-center justify-between gap-1.5 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <span className={`badge badge-xs font-mono font-bold ${isFailed ? 'badge-error text-white' : 'badge-primary text-white'}`}>
                        {idx + 1}
                      </span>
                      <span className={`badge badge-xs ${sAgentMeta.badgeClass}`}>
                        {sAgentMeta.label}
                      </span>
                      <span className="font-mono font-bold text-slate-800 flex items-center gap-1 text-[11px]">
                        {ACTION_ICONS[step.actionName] || <Zap size={11} />}
                        {step.actionName || 'Action'}
                      </span>
                    </div>
                    {step.durationMs && (
                      <span className="text-[10px] font-mono text-slate-400">
                        {(step.durationMs / 1000).toFixed(1)}s
                      </span>
                    )}
                  </div>

                  {/* Internal Thought / Reasoning */}
                  {step.thought && (
                    <p className="text-[11px] text-slate-600 bg-white/80 p-2 rounded-lg border border-base-200 leading-relaxed font-sans">
                      {step.thought}
                    </p>
                  )}

                  {/* Failure Info */}
                  {isFailed && (
                    <div className="alert alert-error py-1.5 px-2.5 rounded-lg text-white text-[11px] flex items-center gap-1.5">
                      <ShieldAlert size={13} className="shrink-0" />
                      <span>{String((step.result as Record<string, unknown>)?.error || error || 'Action failed')}</span>
                    </div>
                  )}

                  {/* Tool Parameters (Collapsible) */}
                  {step.parameters && Object.keys(step.parameters).length > 0 && (
                    <details className="text-[11px]">
                      <summary className="cursor-pointer text-slate-500 hover:text-slate-800 font-medium py-0.5 select-none">
                        Parameters ({Object.keys(step.parameters).length})
                      </summary>
                      <pre className="p-1.5 mt-1 bg-white rounded-lg border border-base-200 font-mono text-[10px] overflow-x-auto text-slate-700">
                        {JSON.stringify(step.parameters, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
