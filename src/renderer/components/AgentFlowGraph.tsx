import React, { useState, useMemo } from 'react';
import { AgentStep } from '../../shared/types';
import {
  Bot, Loader2, Zap, Monitor, Type, Keyboard,
  Presentation, Terminal, ShieldAlert,
  HelpCircle, FileCode, Search,
  Eye, Sparkles, CheckCircle2,
  CornerDownRight, UserCheck, Play,
  Copy, Check, Layers, ArrowRight, Activity, ChevronDown, ChevronUp
} from 'lucide-react';

export interface HitlInfo {
  id: string;
  taskId: string;
  question: string;
  options: string[];
  selectedAnswer?: string;
  isCancelled?: boolean;
}

export interface AgentFlowGraphProps {
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

export interface AgentMeta {
  name: string;
  label: string;
  description: string;
  badgeBg: string;
  badgeText: string;
  stepColorClass: string;
  icon: React.ReactNode;
}

export const AGENT_PROFILES: Record<string, AgentMeta> = {
  root: {
    name: 'root',
    label: 'Root Orchestrator',
    description: 'Top-level routing, memory & coordinator',
    badgeBg: 'bg-indigo-600',
    badgeText: 'text-white',
    stepColorClass: 'step-primary',
    icon: <Bot size={13} className="text-indigo-300" />,
  },
  on_screen_agent: {
    name: 'on_screen_agent',
    label: 'Whiteboard Lecturer',
    description: 'Conceptual diagrams & animated sketches',
    badgeBg: 'bg-amber-600',
    badgeText: 'text-white',
    stepColorClass: 'step-secondary',
    icon: <Presentation size={13} className="text-amber-300" />,
  },
  main_executor: {
    name: 'main_executor',
    label: 'Desktop Executor',
    description: 'Windows UI automation & keyboard control',
    badgeBg: 'bg-cyan-600',
    badgeText: 'text-white',
    stepColorClass: 'step-info',
    icon: <Terminal size={13} className="text-cyan-300" />,
  },
  strange_planner: {
    name: 'strange_planner',
    label: 'Strange UI Guide',
    description: 'Visual element inspection & on-screen highlights',
    badgeBg: 'bg-emerald-600',
    badgeText: 'text-white',
    stepColorClass: 'step-accent',
    icon: <Zap size={13} className="text-emerald-300" />,
  },
  clarification: {
    name: 'clarification',
    label: 'Clarification Master',
    description: 'Human confirmations & interactive quizzes',
    badgeBg: 'bg-fuchsia-600',
    badgeText: 'text-white',
    stepColorClass: 'step-warning',
    icon: <HelpCircle size={13} className="text-fuchsia-300" />,
  },
  research: {
    name: 'research',
    label: 'Research Analyst',
    description: 'Deep web grounding & multi-source synthesis',
    badgeBg: 'bg-sky-600',
    badgeText: 'text-white',
    stepColorClass: 'step-info',
    icon: <Search size={13} className="text-sky-300" />,
  },
  general_agent: {
    name: 'general_agent',
    label: 'Friendly Companion',
    description: 'Conversations, places, trips & news reading',
    badgeBg: 'bg-purple-600',
    badgeText: 'text-white',
    stepColorClass: 'step-neutral',
    icon: <Sparkles size={13} className="text-purple-300" />,
  },
  scratchpad: {
    name: 'scratchpad',
    label: 'Code & Commands',
    description: 'Terminal scripts & code snippet cards',
    badgeBg: 'bg-zinc-600',
    badgeText: 'text-white',
    stepColorClass: 'step-neutral',
    icon: <FileCode size={13} className="text-zinc-300" />,
  },
};

export function resolveAgentMeta(rawAgentName?: string): AgentMeta {
  if (!rawAgentName) return AGENT_PROFILES.root;
  const key = rawAgentName.toLowerCase().trim();
  if (AGENT_PROFILES[key]) return AGENT_PROFILES[key];

  const formattedLabel = rawAgentName
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
  return {
    name: rawAgentName,
    label: formattedLabel,
    description: 'Specialist Sub-Agent',
    badgeBg: 'bg-indigo-600',
    badgeText: 'text-white',
    stepColorClass: 'step-primary',
    icon: <Layers size={13} className="text-indigo-300" />,
  };
}

export const ACTION_ICONS: Record<string, React.ReactNode> = {
  minimize_all_windows: <Monitor size={12} />,
  minimize_window:      <Monitor size={12} />,
  focus_window:         <Monitor size={12} />,
  launch_app:           <Zap size={12} />,
  press_hotkey:         <Keyboard size={12} />,
  uia_click:            <Zap size={12} />,
  uia_type:             <Type size={12} />,
  mouse_move:           <Zap size={12} />,
  mouse_click:          <Zap size={12} />,
  keyboard_type:        <Type size={12} />,
  keyboard_key:         <Keyboard size={12} />,
  get_open_windows:     <Monitor size={12} />,
  take_screenshot:      <Eye size={12} />,
  take_screenshot_tool: <Eye size={12} />,
  draw_whiteboard_lecture: <Presentation size={12} />,
  draw_whiteboard_step: <Presentation size={12} />,
  draw_mermaid_diagram: <Presentation size={12} />,
  add_whiteboard_clarification: <HelpCircle size={12} />,
  show_annotations:     <Zap size={12} />,
  show_screenpad:       <FileCode size={12} />,
  ask_human:            <UserCheck size={12} />,
  smart_ui_action:      <Zap size={12} />,
  uia_invoke:           <Zap size={12} />,
  search_and_explore_places: <Search size={12} />,
  read_grounded_news:   <Search size={12} />,
  create_todo_task:     <Zap size={12} />,
  update_todo_task:     <Zap size={12} />,
  list_todo_tasks:      <Layers size={12} />,
  set_user_preference:  <Bot size={12} />,
  get_user_preferences: <Bot size={12} />,
  expire_user_preference: <Bot size={12} />,
  transfer_to_agent:    <CornerDownRight size={12} />,
};

interface AgentCluster {
  id: string;
  agentName: string;
  agentMeta: AgentMeta;
  steps: AgentStep[];
  isCurrentActive: boolean;
  totalDurationMs: number;
}

export function AgentFlowGraph({
  steps = [],
  isThinking = false,
  isCompleted = false,
  activeAgent: propActiveAgent,
  hitl,
  totalDurationMs,
}: AgentFlowGraphProps) {
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [selectedStep, setSelectedStep] = useState<AgentStep | null>(null);
  const [copied, setCopied] = useState(false);

  // Group steps into consecutive Agent Execution Clusters
  const clusters = useMemo<AgentCluster[]>(() => {
    const result: AgentCluster[] = [];
    if (steps.length === 0) {
      if (isThinking) {
        const rootMeta = resolveAgentMeta(propActiveAgent || 'root');
        result.push({
          id: 'cluster-root-initial',
          agentName: propActiveAgent || 'root',
          agentMeta: rootMeta,
          steps: [],
          isCurrentActive: true,
          totalDurationMs: 0,
        });
      }
      return result;
    }

    let currentCluster: AgentCluster | null = null;

    steps.forEach((step, idx) => {
      const aName = (step.agentName || 'root').toLowerCase();
      if (!currentCluster || currentCluster.agentName !== aName) {
        currentCluster = {
          id: `cluster-${aName}-${idx}`,
          agentName: aName,
          agentMeta: resolveAgentMeta(aName),
          steps: [step],
          isCurrentActive: false,
          totalDurationMs: step.durationMs || 0,
        };
        result.push(currentCluster);
      } else {
        currentCluster.steps.push(step);
        currentCluster.totalDurationMs += step.durationMs || 0;
      }
    });

    if (isThinking && result.length > 0) {
      const activeName = (propActiveAgent || steps[steps.length - 1].agentName || 'root').toLowerCase();
      const lastCluster = result[result.length - 1];
      if (lastCluster.agentName === activeName) {
        lastCluster.isCurrentActive = true;
      } else {
        result.push({
          id: `cluster-${activeName}-active`,
          agentName: activeName,
          agentMeta: resolveAgentMeta(activeName),
          steps: [],
          isCurrentActive: true,
          totalDurationMs: 0,
        });
      }
    }

    return result;
  }, [steps, isThinking, propActiveAgent]);

  const activeCluster = clusters.find(c => c.id === selectedClusterId) || null;

  const copyJson = (data: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const hitlResolvedAnswer = hitl?.selectedAnswer;
  const isHitlCancelled = hitl?.isCancelled || hitlResolvedAnswer?.toLowerCase() === 'cancel' || hitlResolvedAnswer?.toLowerCase() === 'cancelled';
  const isHitlPassed = Boolean(hitlResolvedAnswer && !isHitlCancelled);

  return (
    <div className="w-full my-1.5 select-text font-sans text-xs space-y-1.5">
      {/* ── SIMPLE & COMPACT AGENTIC FLOW GRAPH (NO DEAD SPACE) ── */}
      <div className="relative w-full rounded-xl border border-zinc-700/70 bg-zinc-900/95 text-zinc-100 p-2.5 shadow-sm">
        
        {/* ── Top Header Bar ── */}
        <div className="flex items-center justify-between gap-2 pb-1.5 mb-2 border-b border-zinc-800 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-white flex items-center gap-1.5 text-xs">
              <Activity size={12} className="text-indigo-400" /> Multi-Agent Execution Graph
            </span>
            <span className="badge badge-xs bg-zinc-800 text-zinc-300 font-mono border-zinc-700 px-1.5 py-0.5">
              {clusters.length} {clusters.length === 1 ? 'Phase' : 'Phases'}
            </span>
          </div>

          <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400">
            {isThinking && (
              <span className="flex items-center gap-1 text-amber-400 font-bold animate-pulse">
                <Loader2 size={11} className="animate-spin" /> Live
              </span>
            )}
            {totalDurationMs ? (
              <span className="text-zinc-300 font-semibold">{(totalDurationMs / 1000).toFixed(1)}s</span>
            ) : steps.length > 0 ? (
              <span className="text-zinc-300 font-semibold">{steps.length} {steps.length === 1 ? 'tool' : 'tools'}</span>
            ) : null}
          </div>
        </div>

        {/* ── SIMPLE CONNECTED FLOW PIPELINE RAIL ── */}
        <div className="w-full overflow-x-auto py-0.5 scrollbar-thin">
          <div className="flex items-center gap-1.5 min-w-max">
            {/* Goal Node */}
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800 border border-zinc-700 text-white font-bold text-[11px] shadow-2xs">
              <Play size={10} className="fill-white text-white" />
              <span>Goal</span>
            </div>

            <ArrowRight size={11} className="text-zinc-500 shrink-0" />

            {/* Agent Nodes in Connected Chain */}
            {clusters.map((cluster) => {
              const isSelected = selectedClusterId === cluster.id;
              return (
                <React.Fragment key={`chain-${cluster.id}`}>
                  <button
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        setSelectedClusterId(null);
                        setSelectedStep(null);
                      } else {
                        setSelectedClusterId(cluster.id);
                        setSelectedStep(cluster.steps.length > 0 ? cluster.steps[0] : null);
                      }
                    }}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-all shadow-2xs cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-400 ring-2 ring-indigo-400/40 shadow-xs'
                        : cluster.isCurrentActive
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 animate-pulse'
                        : 'bg-zinc-800 hover:bg-zinc-750 text-zinc-100 border-zinc-700 hover:border-zinc-500'
                    }`}
                    title="Click to view tools & arguments"
                  >
                    <span className="shrink-0">{cluster.agentMeta.icon}</span>
                    <span>{cluster.agentMeta.label}</span>
                    {cluster.steps.length > 0 && (
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                        isSelected ? 'bg-indigo-900 text-indigo-200' : 'bg-zinc-700 text-zinc-200'
                      }`}>
                        {cluster.steps.length}
                      </span>
                    )}
                    {isSelected ? <ChevronUp size={11} /> : <ChevronDown size={11} className="opacity-60" />}
                  </button>

                  <ArrowRight size={11} className="text-zinc-500 shrink-0" />
                </React.Fragment>
              );
            })}

            {/* HITL Node in Chain if active */}
            {hitl && (
              <>
                <div className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold shadow-2xs ${
                  isHitlPassed
                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-600'
                    : isHitlCancelled
                    ? 'bg-rose-950/80 text-rose-300 border-rose-600'
                    : 'bg-amber-950/80 text-amber-300 border-amber-600 animate-pulse'
                }`}>
                  <UserCheck size={11} />
                  <span>HITL: {isHitlPassed ? 'Passed' : isHitlCancelled ? 'Cancelled' : 'Waiting'}</span>
                </div>
                <ArrowRight size={11} className="text-zinc-500 shrink-0" />
              </>
            )}

            {/* End Node */}
            <div className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold shadow-2xs ${
              isCompleted || (!isThinking && steps.length > 0)
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-600'
                : 'bg-zinc-800 text-zinc-400 border-zinc-700'
            }`}>
              <CheckCircle2 size={11} />
              <span>Done</span>
            </div>
          </div>
        </div>

        {/* ── COMPACT DETAIL INSPECTOR (PROPORTIONED, NO EMPTY VOID) ── */}
        {activeCluster && (
          <div className="mt-2.5 p-3 bg-zinc-850 rounded-xl border border-zinc-700 shadow-md text-xs space-y-2.5 animate-fadeIn">
            {/* Active Cluster Header */}
            <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-zinc-750 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded bg-zinc-700 flex items-center justify-center shrink-0">
                  {activeCluster.agentMeta.icon}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-white text-[12px]">{activeCluster.agentMeta.label}</span>
                    <span className="badge badge-xs bg-zinc-700 text-zinc-200 font-mono font-semibold">
                      {activeCluster.agentName}
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-400 font-medium">{activeCluster.agentMeta.description}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-300">
                {activeCluster.totalDurationMs > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-700">
                    {(activeCluster.totalDurationMs / 1000).toFixed(1)}s
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedClusterId(null);
                    setSelectedStep(null);
                  }}
                  className="btn btn-ghost btn-xs text-[10px] text-zinc-400 hover:text-white px-1.5 h-6 min-h-0"
                >
                  ✕ Close
                </button>
              </div>
            </div>

            {/* Dispatched Tool Pills */}
            {activeCluster.steps.length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] font-bold text-zinc-300 uppercase tracking-wide">
                  Dispatched Tools ({activeCluster.steps.length}):
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {activeCluster.steps.map((st, sIdx) => {
                    const isStepSelected = selectedStep?.id === st.id;
                    const isFailed = st.success === false;

                    return (
                      <button
                        key={st.id || `tool-${sIdx}`}
                        type="button"
                        onClick={() => setSelectedStep(isStepSelected ? null : st)}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] font-mono font-bold transition-all cursor-pointer ${
                          isStepSelected
                            ? 'bg-indigo-600 text-white border-indigo-400 shadow-xs ring-2 ring-indigo-400/40'
                            : isFailed
                            ? 'bg-rose-950/80 text-rose-300 border-rose-700'
                            : 'bg-zinc-900 hover:bg-zinc-750 text-zinc-200 border-zinc-700'
                        }`}
                      >
                        <span>{ACTION_ICONS[st.actionName] || <Zap size={11} />}</span>
                        <span>{st.actionName.replace(/^browser_/, '').replace(/_tool$/, '')}</span>
                        {st.durationMs ? (
                          <span className="text-[9px] opacity-70 ml-0.5">
                            {(st.durationMs / 1000).toFixed(1)}s
                          </span>
                        ) : null}
                        {isFailed && <ShieldAlert size={11} className="text-rose-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Selected Tool Details (Full Width / Balanced Grid) */}
            {selectedStep && (
              <div className="p-2.5 bg-zinc-900 rounded-lg border border-zinc-750 space-y-2 text-xs">
                <div className="flex items-center justify-between pb-1 border-b border-zinc-800">
                  <span className="font-bold text-indigo-300 font-mono text-[11px] flex items-center gap-1">
                    {ACTION_ICONS[selectedStep.actionName] || <Zap size={11} />} {selectedStep.actionName}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyJson(selectedStep)}
                    className="btn btn-ghost btn-xs text-[10px] gap-1 px-1.5 h-6 min-h-0 text-zinc-300 hover:text-white"
                  >
                    {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                    <span>{copied ? 'Copied' : 'Copy JSON'}</span>
                  </button>
                </div>

                {selectedStep.thought && (
                  <div className="p-2 rounded bg-zinc-850 border border-zinc-800 text-[11px] text-zinc-200 leading-relaxed">
                    <strong className="text-white block mb-0.5">Thought / Plan:</strong>
                    {selectedStep.thought}
                  </div>
                )}

                {/* Parameters and Result (Responsive Balanced Layout) */}
                <div className={`grid gap-2 text-[10px] font-mono ${
                  selectedStep.parameters && selectedStep.result ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'
                }`}>
                  {selectedStep.parameters && Object.keys(selectedStep.parameters).length > 0 && (
                    <div className="p-2 rounded bg-black/90 text-zinc-100 overflow-x-auto max-h-40 border border-zinc-800 w-full">
                      <div className="text-[9px] text-zinc-400 font-sans font-bold mb-1 uppercase">Parameters:</div>
                      <pre>{JSON.stringify(selectedStep.parameters, null, 2)}</pre>
                    </div>
                  )}
                  {selectedStep.result && (
                    <div className="p-2 rounded bg-black/90 text-zinc-100 overflow-x-auto max-h-40 border border-zinc-800 w-full">
                      <div className="text-[9px] text-zinc-400 font-sans font-bold mb-1 uppercase">Result:</div>
                      <pre>{JSON.stringify(selectedStep.result, null, 2)}</pre>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
