import { useState, useEffect } from 'react';
import { AgentStep } from '../../shared/types';
import {
  Loader2, Presentation, Clock, ShieldAlert, Pause, Brain,
  ChevronDown, ChevronUp, Volume2, GitGraph, ListOrdered, UserCheck, Zap
} from 'lucide-react';
import { AgentFlowGraph, HitlInfo, resolveAgentMeta, ACTION_ICONS } from './AgentFlowGraph';

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
  hitl?: HitlInfo;
  outputTokens?: {
    prompt?: number;
    completion?: number;
    total?: number;
  };
  totalDurationMs?: number;
}

function formatStepLabel(actionName?: string, agentName?: string): string {
  if (!actionName) return agentName ? agentName.replace(/_/g, ' ') : 'Action';
  const clean = actionName
    .replace(/^browser_/, '')
    .replace(/_tool$/, '')
    .replaceAll('_', ' ');
  return clean.length > 20 ? clean.substring(0, 18) + '…' : clean;
}

function getTwoDigitSeconds(ms?: number): number {
  if (!ms || ms < 0) return 1;
  const sec = Math.round(ms / 1000);
  return Math.min(99, Math.max(0, sec));
}

type ViewTab = 'graph' | 'steps' | 'thoughts';

export function ToolCallTimeline({
  steps = [],
  isThinking = false,
  isPaused = false,
  isWaitingInput = false,
  isCompleted = false,
  spokeVoice = false,
  hadWhiteboard = false,
  error,
  activeAgent: propActiveAgent,
  hitl,
  outputTokens,
  totalDurationMs,
}: ToolCallTimelineProps) {
  const [runningSeconds, setRunningSeconds] = useState(0);
  const [activeTab, setActiveTab] = useState<ViewTab>('graph');
  const [isExpanded, setIsExpanded] = useState(true);

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

  if (steps.length === 0 && !isThinking && !hitl) {
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
    <div className="w-full my-1.5 space-y-1.5 font-sans select-text text-xs">
      {/* ── TOP CONTROL & VIEW SWITCHER BAR ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-0.5 text-xs">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Active Agent Badge */}
          <span className={`badge badge-sm font-bold font-mono gap-1.5 py-1 px-2.5 rounded-lg border shadow-2xs ${currentAgentMeta.badgeBg} ${currentAgentMeta.badgeText}`}>
            {currentAgentMeta.icon}
            <span className="font-sans font-bold">{currentAgentMeta.label}</span>
          </span>

          {/* Live Execution Status */}
          {isThinking ? (
            <span className="text-amber-800 font-bold flex items-center gap-1.5 animate-pulse text-[11px]">
              {isPaused ? (
                <>
                  <Pause size={12} className="text-amber-600" /> Paused
                </>
              ) : (
                <>
                  <Loader2 size={12} className="animate-spin text-amber-600" /> Executing ({runningSeconds}s)…
                </>
              )}
            </span>
          ) : (
            <span className="text-slate-600 font-semibold flex items-center gap-1 text-[11px]">
              <Clock size={11} className="text-slate-400" /> {durationSec}s • {steps.length} {steps.length === 1 ? 'call' : 'calls'}
            </span>
          )}

          {spokeVoice && (
            <span className="badge badge-sm bg-blue-600 text-white font-bold gap-0.5">
              <Volume2 size={10} /> Spoken Voice
            </span>
          )}

          {hadWhiteboard && (
            <span className="badge badge-sm bg-amber-600 text-white font-bold gap-0.5">
              <Presentation size={10} /> Whiteboard
            </span>
          )}

          {hitl && (
            <span className="badge badge-sm bg-fuchsia-700 text-white font-bold gap-0.5">
              <UserCheck size={10} /> HITL Gate
            </span>
          )}

          {hasAnyFailure && (
            <span className="badge badge-sm bg-rose-600 text-white font-bold gap-0.5">
              <ShieldAlert size={10} /> Error
            </span>
          )}
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl border border-slate-300 shadow-2xs">
          <button
            type="button"
            onClick={() => {
              setActiveTab('graph');
              setIsExpanded(true);
            }}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all ${
              isExpanded && activeTab === 'graph'
                ? 'bg-white text-slate-950 border border-slate-300 shadow-xs'
                : 'text-slate-600 hover:text-slate-950'
            }`}
            title="Multi-Agent Execution Graph"
          >
            <GitGraph size={12} />
            <span>Agent Graph</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('steps');
              setIsExpanded(true);
            }}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all ${
              isExpanded && activeTab === 'steps'
                ? 'bg-white text-slate-950 border border-slate-300 shadow-xs'
                : 'text-slate-600 hover:text-slate-950'
            }`}
            title="Horizontal progress rail"
          >
            <ListOrdered size={12} />
            <span>Steps</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('thoughts');
              setIsExpanded(true);
            }}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all ${
              isExpanded && activeTab === 'thoughts'
                ? 'bg-white text-slate-950 border border-slate-300 shadow-xs'
                : 'text-slate-600 hover:text-slate-950'
            }`}
            title="Internal thoughts & details"
          >
            <Brain size={12} />
            <span>Thoughts</span>
          </button>

          <button
            type="button"
            onClick={() => setIsExpanded(prev => !prev)}
            className="p-1 rounded-lg text-slate-500 hover:text-slate-900 transition-colors"
            title={isExpanded ? 'Collapse view' : 'Expand view'}
          >
            {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      {/* ── EXPANDABLE CONTENT BODY ── */}
      {isExpanded && (
        <div className="animate-fadeIn">
          {/* TAB 1: CRISP MULTI-AGENT FLOW GRAPH */}
          {activeTab === 'graph' && (
            <AgentFlowGraph
              steps={steps}
              isThinking={isThinking}
              isPaused={isPaused}
              isWaitingInput={isWaitingInput}
              isCompleted={isCompleted}
              spokeVoice={spokeVoice}
              hadWhiteboard={hadWhiteboard}
              error={error}
              activeAgent={propActiveAgent}
              hitl={hitl}
              outputTokens={outputTokens}
              totalDurationMs={totalDurationMs}
            />
          )}

          {/* TAB 2: COMPACT & 100% VISIBLE STEPS RAIL */}
          {activeTab === 'steps' && (
            <div className="w-full p-2.5 bg-slate-50 rounded-xl border border-slate-300 shadow-2xs overflow-x-auto scrollbar-thin">
              <div className="flex items-center justify-between min-w-max gap-3 px-2">
                {steps.map((step, idx) => {
                  const sAgentMeta = resolveAgentMeta(step.agentName);
                  const isFailed = step.success === false;
                  const isLast = idx === steps.length - 1 && !isThinking;

                  return (
                    <div key={step.id || `step-${idx}`} className="flex items-center flex-1">
                      {/* Step Circle & Label Node */}
                      <div className="flex flex-col items-center min-w-[80px] max-w-[130px]">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shadow-xs ${
                          isFailed
                            ? 'bg-rose-600 text-white ring-2 ring-rose-300'
                            : 'bg-slate-900 text-white ring-2 ring-slate-400'
                        }`}>
                          {isFailed ? '✕' : idx + 1}
                        </div>
                        {/* Explicit Solid High-Contrast Dark Slate Text (Always 100% visible) */}
                        <span className="text-[11px] font-bold text-slate-900 text-center mt-1 truncate max-w-full block">
                          {formatStepLabel(step.actionName, step.agentName)}
                        </span>
                        <span className="text-[9px] font-semibold text-slate-600">
                          {sAgentMeta.label}
                        </span>
                      </div>

                      {/* Connecting Track Line */}
                      {!isLast && (
                        <div className="h-0.5 bg-slate-400 flex-1 mx-2" />
                      )}
                    </div>
                  );
                })}

                {/* In-Flight Running Step */}
                {isThinking && (
                  <div className="flex items-center flex-1">
                    <div className="h-0.5 bg-slate-400 flex-1 mx-2" />
                    <div className="flex flex-col items-center min-w-[80px]">
                      <div className="w-7 h-7 rounded-full bg-amber-500 text-white flex items-center justify-center font-bold text-xs shadow-xs animate-pulse ring-2 ring-amber-300">
                        <Loader2 size={13} className="animate-spin" />
                      </div>
                      <span className="text-[11px] font-bold text-amber-900 text-center mt-1">
                        {isPaused ? 'Paused' : currentAgentMeta.label}
                      </span>
                      <span className="text-[9px] text-amber-700 font-semibold">Running…</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: THOUGHTS & INTERNAL DETAILS */}
          {activeTab === 'thoughts' && (
            <div className="p-3 bg-slate-900 text-white rounded-xl border border-slate-800 shadow-xs space-y-2.5 text-xs">
              <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
                <span className="font-bold text-white flex items-center gap-1.5 text-xs">
                  <Brain size={13} className="text-indigo-400" /> Internal Execution Steps & Thoughts
                </span>
                <span className="text-[11px] font-mono text-slate-400 font-semibold">
                  {steps.length} tool calls recorded
                </span>
              </div>

              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {steps.map((step, idx) => {
                  const sAgentMeta = resolveAgentMeta(step.agentName);
                  const isFailed = step.success === false;

                  return (
                    <div
                      key={step.id || `detail-${idx}`}
                      className={`p-2.5 rounded-lg border text-xs space-y-1.5 ${
                        isFailed
                          ? 'bg-rose-950/50 border-rose-800 text-rose-100'
                          : 'bg-slate-800 border-slate-700 text-slate-100'
                      }`}
                    >
                      {/* Step Header */}
                      <div className="flex items-center justify-between gap-1.5 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className={`badge badge-xs font-mono font-bold ${isFailed ? 'bg-rose-600 text-white' : 'bg-white text-slate-950 font-bold'}`}>
                            {idx + 1}
                          </span>
                          <span className={`badge badge-xs font-bold font-mono px-1.5 py-0.5 rounded border ${sAgentMeta.badgeBg} ${sAgentMeta.badgeText}`}>
                            {sAgentMeta.label}
                          </span>
                          <span className="font-mono font-bold text-white flex items-center gap-1 text-[11px]">
                            {ACTION_ICONS[step.actionName] || <Zap size={11} />}
                            {step.actionName || 'Action'}
                          </span>
                        </div>
                        {step.durationMs && (
                          <span className="text-[10px] font-mono text-slate-400 font-semibold">
                            {(step.durationMs / 1000).toFixed(1)}s
                          </span>
                        )}
                      </div>

                      {/* Internal Thought / Reasoning */}
                      {step.thought && (
                        <p className="text-[11px] text-slate-100 bg-slate-950 p-2 rounded border border-slate-700 leading-relaxed font-sans font-medium">
                          {step.thought}
                        </p>
                      )}

                      {/* Failure Info */}
                      {isFailed && (
                        <div className="alert alert-error py-1.5 px-2.5 rounded text-white text-[11px] flex items-center gap-1 font-bold">
                          <ShieldAlert size={12} className="shrink-0" />
                          <span>{String((step.result as Record<string, unknown>)?.error || error || 'Action failed')}</span>
                        </div>
                      )}

                      {/* Tool Parameters */}
                      {step.parameters && Object.keys(step.parameters).length > 0 && (
                        <details className="text-[11px]">
                          <summary className="cursor-pointer text-slate-300 hover:text-white font-bold py-0.5 select-none">
                            Parameters ({Object.keys(step.parameters).length})
                          </summary>
                          <pre className="p-2 mt-1 bg-black text-slate-100 rounded border border-slate-800 font-mono text-[10px] overflow-x-auto">
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
      )}
    </div>
  );
}
