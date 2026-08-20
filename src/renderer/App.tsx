import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AgentStatus, AgentStep, AppConfig, ExecutionResponse, ExecutorState } from '../shared/types';
import { VoiceEngine } from './voiceEngine';
import { Loader2, Mic, MicOff, X, Pause, Play, Square } from 'lucide-react';
import { CommentaryBanner } from './components/CommentaryBanner';
import { MarkdownView } from './components/MarkdownView';
import { ToolCallTimeline } from './components/ToolCallTimeline';
import { CoffeeCup, StaticCupIcon } from './components/CoffeeCup';



/* ── Safe IPC accessor (lazy — avoids module-level crash) ────── */
function ipc() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (window as any).require('electron').ipcRenderer as {
      invoke: (channel: string, data?: unknown) => Promise<unknown>;
      on: (channel: string, listener: (_e: unknown, d: unknown) => void) => void;
      removeAllListeners: (channel: string) => void;
    };
  } catch {
    console.error('[App] Could not access electron ipcRenderer');
    return null;
  }
}

/* ── Speak text via native Windows SAPI TTS (main process) ─────── */
function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')        // remove code blocks
    .replace(/`[^`]+`/g, '')               // remove inline code
    .replace(/#{1,6}\s+/g, '')             // remove headings
    .replace(/\*\*([^*]+)\*\*/g, '$1')     // bold → plain
    .replace(/\*([^*]+)\*/g, '$1')         // italic → plain
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links → label
    .replace(/[*_~|>#\-=]/g, '')           // remaining markdown chars
    .replace(/\s{2,}/g, ' ')              // collapse whitespace
    .trim();
}

async function speak(text: string): Promise<void> {
  const plain = stripMarkdown(text).slice(0, 600); // cap at 600 chars for TTS
  if (!plain) return;
  console.log('[TTS] Speaking:', plain.slice(0, 80) + '…');
  try {
    const res = await ipc()?.invoke('voice:speak', { text: plain }) as { success?: boolean; error?: string } | undefined;
    if (res && res.success === false && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(plain);
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  } catch (err) {
    console.error('[App] Main TTS failed, fallback to Web Speech API:', err);
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(plain);
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  }
}

/* ── Types ─────────────────────────────────────────────────── */
interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  text?: string;
  isVoice?: boolean;
  activeAgent?: string;
  steps?: AgentStep[];
  status?: 'thinking' | 'done' | 'error';
  spokeVoice?: boolean;
  hadWhiteboard?: boolean;
  durationMs?: number;
  outputTokens?: {
    prompt?: number;
    completion?: number;
    total?: number;
  };
  hitl?: {
    id: string;
    taskId: string;
    question: string;
    options: string[];
    selectedAnswer?: string;
  };
}


interface ExecuteOptions {
  prompt?: string;
  audioBase64?: string;
  mimeType?: string;
  isVoice?: boolean;
}

/* ── App ────────────────────────────────────────────────────── */
export default function App() {
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [executorState, setExecutorState] = useState<ExecutorState | 'idle'>('idle');
  const [activeAgent, setActiveAgent] = useState<string>('root');
  const [activeTaskId, setActiveTaskId] = useState<string>('');
  const [commentary, setCommentary] = useState('');
  const [backendConnected, setBackendConnected] = useState<boolean>(false);
  const [config, setConfig] = useState<AppConfig>({
    geminiModel: '',
    backendConnected: false,
  });
  const chatEndRef = useRef<HTMLDivElement>(null);

  /* ── Voice: ambient auto-listening (active ONLY when connected) ── */
  const [recording, setRecording] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<string>('');
  const engineRef = useRef<VoiceEngine | null>(null);
  const lastUtteranceRef = useRef<{ wavBase64: string; mimeType: string } | null>(null);
  const voiceActiveRef = useRef(false);
  const sendPromptRef = useRef<(input: string | ExecuteOptions) => Promise<void>>();

  const isBusy = status === 'analyzing' || status === 'executing';
  const isTaskRunning = isBusy || isSpeaking || (executorState !== 'idle');
  const isAnimationActive = isBusy || isSpeaking;

  const isTaskRunningRef = useRef(false);
  isTaskRunningRef.current = isTaskRunning;
  const executorStateRef = useRef<ExecutorState | 'idle'>('idle');
  executorStateRef.current = executorState;
  const inFlightRef = useRef(false);

  const showBorderGlow = useCallback((show: boolean, message?: string, mode?: 'user-speaking' | 'thinking' | 'executing' | 'speaking') => {
    if (show) {
      ipc()?.invoke('agent:glow-show', { text: message, mode: mode || 'thinking' });
    } else {
      ipc()?.invoke('agent:glow-hide');
    }
    if (message !== undefined) setVoiceStatus(message);
  }, []);

  useEffect(() => {
    const engine = new VoiceEngine({
      endSilenceMs: 2000, // 2-second silence buffer time to stop voice recording
      onUtterance: async (utterance) => {
        // Discard if actively executing and not in paused state
        if (inFlightRef.current || (isTaskRunningRef.current && executorStateRef.current !== 'paused')) {
          console.log('[Voice] Ignored utterance: agent is actively executing a request');
          return;
        }
        console.log('[Voice] Utterance captured:', utterance.durationMs, 'ms');
        lastUtteranceRef.current = { wavBase64: utterance.wavBase64, mimeType: utterance.mimeType };

        // Automatic voice detection -> Send directly to agents!
        setVoiceStatus('Sending to agent…');
        showBorderGlow(true, '⚡ Thinking & Planning…', 'thinking');
        if (sendPromptRef.current) {
          await sendPromptRef.current({
            audioBase64: utterance.wavBase64,
            mimeType: utterance.mimeType,
            isVoice: true,
          });
        }
      },
      onStateChange: (state) => {
        if (inFlightRef.current || (isTaskRunningRef.current && executorStateRef.current !== 'paused')) return;
        console.log('[Voice] State:', state);
        if (state === 'SPEAKING') {
          setVoiceStatus('Hearing speech…');
          showBorderGlow(true, '🎙️ Hearing your voice…', 'user-speaking');
        } else if (state === 'COUNTDOWN') {
          setVoiceStatus('Processing voice…');
          showBorderGlow(true, '⚡ Processing voice…', 'thinking');
        } else if (state === 'LISTENING') {
          setVoiceStatus('Listening for voice…');
          showBorderGlow(false, '');
        }
      },
      onCountdown: (seconds) => {
        if (inFlightRef.current || (isTaskRunningRef.current && executorStateRef.current !== 'paused')) return;
        setVoiceStatus(`Wait ${seconds}…`);
      },
      onIdleTimeout: () => {
        console.log('[Voice] Idle timeout');
      },
    });

    engineRef.current = engine;

    return () => {
      engine.stop().catch(() => {});
    };
  }, [showBorderGlow]);

  /* Start / Resume listening (Only if backend connected and not actively executing) */
  const startRecording = useCallback(async () => {
    if (!backendConnected) {
      console.warn('[App] Cannot start voice: Python backend is offline.');
      return;
    }
    if (inFlightRef.current || (isTaskRunning && executorState !== 'paused')) {
      console.warn('[App] Cannot start voice: Agent is currently busy executing a task.');
      return;
    }
    const engine = engineRef.current;
    if (!engine) return;
    try {
      voiceActiveRef.current = true;
      await engine.start();
      engine.activate();
      setRecording(true);
      lastUtteranceRef.current = null;
      setVoiceStatus('Listening for voice…');
      showBorderGlow(false, '');
    } catch (err) {
      console.error('[App] Mic start failed:', err);
      setVoiceStatus('Mic unavailable');
      setRecording(false);
      voiceActiveRef.current = false;
    }
  }, [backendConnected, isTaskRunning, executorState, showBorderGlow]);

  /* Pause / Mute voice listening */
  const cancelRecording = useCallback(() => {
    voiceActiveRef.current = false;
    const engine = engineRef.current;
    engine?.deactivate();
    setRecording(false);
    setVoiceStatus('Mic muted — tap to activate');
    lastUtteranceRef.current = null;
    showBorderGlow(false, '');
  }, [showBorderGlow]);

  /* Load config and setup listeners on mount */
  useEffect(() => {
    const renderer = ipc();
    if (!renderer) return;

    renderer.invoke('config:get').then((res) => {
      if (res) {
        const c = res as AppConfig;
        setConfig(c);
        setBackendConnected(!!c.backendConnected);
      }
    }).catch(console.error);

    const onStep = (_: unknown, data: unknown) => {
      const step = data as AgentStep;
      if (step.agentName) {
        setActiveAgent(step.agentName);
      }
      setMessages(prev => prev.map(m =>
        m.role === 'agent' && m.status === 'thinking'
          ? {
              ...m,
              activeAgent: step.agentName || m.activeAgent || activeAgent,
              steps: [...(m.steps || []), step]
            }
          : m
      ));
      if (step.thought || step.actionName) {
        showBorderGlow(true, `🛠️ ${step.thought || `Executing ${step.actionName}`}`, 'executing');
      }
    };

    const onBackendStatus = (_: unknown, data: unknown) => {
      const st = data as { connected: boolean };
      setBackendConnected(st.connected);
      if (st.connected) {
        renderer.invoke('config:get').then((res) => {
          if (res) setConfig(res as AppConfig);
        }).catch(console.error);
      } else {
        setConfig({ geminiModel: '', backendConnected: false });
        voiceActiveRef.current = false;
        engineRef.current?.deactivate();
        setRecording(false);
        setVoiceStatus('');
        showBorderGlow(false, '');
      }
    };

    const onStateChange = (_: unknown, data: unknown) => {
      const st = data as { taskId: string; state: ExecutorState; activeAgent?: string; agentName?: string };
      setActiveTaskId(st.taskId);
      setExecutorState(st.state);
      if (st.activeAgent || st.agentName) {
        const agent = st.activeAgent || st.agentName || 'root';
        setActiveAgent(agent);
        setMessages(prev => prev.map(m =>
          m.role === 'agent' && m.status === 'thinking'
            ? { ...m, activeAgent: agent }
            : m
        ));
      }
      if (st.state === 'waiting_hitl') setStatus('verifying');
    };

    const onCommentary = (_: unknown, data: unknown) => {
      const c = data as { text: string };
      setCommentary(c.text);
    };

    const onLiveAction = (_: unknown, data: unknown) => {
      const act = data as { tool: string; label?: string };
      if (act?.label) {
        setCommentary(act.label);
      }
    };

    const onTtsSpeak = (_: unknown, data: unknown) => {
      const c = data as { text: string };
      if (c.text) void speak(c.text);
    };

    const onHitlQuestion = (_: unknown, data: unknown) => {
      const q = data as { id: string; taskId: string; question: string; options: string[] };
      console.log('[App] Received HITL question:', q);
      setMessages(prev => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg && lastMsg.role === 'agent' && lastMsg.status === 'thinking') {
          return prev.map((m, idx) =>
            idx === prev.length - 1
              ? {
                  ...m,
                  hitl: {
                    id: q.id,
                    taskId: q.taskId,
                    question: q.question,
                    options: q.options || [],
                  },
                }
              : m
          );
        } else {
          return [
            ...prev,
            {
              id: `hitl-${q.id || Date.now()}`,
              role: 'agent',
              status: 'thinking',
              hitl: {
                id: q.id,
                taskId: q.taskId,
                question: q.question,
                options: q.options || [],
              },
            },
          ];
        }
      });
    };

    renderer.on('agent:step-update', onStep);
    renderer.on('backend:status', onBackendStatus);
    renderer.on('agent:state-change', onStateChange);
    renderer.on('agent:commentary', onCommentary);
    renderer.on('agent:live-action', onLiveAction);
    renderer.on('agent:tts-speak', onTtsSpeak);
    renderer.on('agent:hitl-question', onHitlQuestion);

    return () => {
      renderer.removeAllListeners('agent:step-update');
      renderer.removeAllListeners('backend:status');
      renderer.removeAllListeners('agent:state-change');
      renderer.removeAllListeners('agent:commentary');
      renderer.removeAllListeners('agent:live-action');
      renderer.removeAllListeners('agent:tts-speak');
      renderer.removeAllListeners('agent:hitl-question');
    };
  }, []);

  /* Auto-scroll */
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handlePause = useCallback(async (taskId: string) => {
    await ipc()?.invoke('task:pause', taskId);
    setExecutorState('paused');
    // After calling API to pause, voice can activate so user can interact
    if (voiceActiveRef.current && engineRef.current) {
      engineRef.current.activate();
      setRecording(true);
      setVoiceStatus('Listening for voice…');
    }
  }, []);

  const handleResume = useCallback(async (taskId: string) => {
    // When resuming, deactivate voice while task is actively running
    engineRef.current?.deactivate();
    setRecording(false);
    setVoiceStatus('');
    await ipc()?.invoke('task:resume', taskId);
    setExecutorState('acting');
  }, []);

  const handleCancel = useCallback(async (taskId: string) => {
    try {
      await ipc()?.invoke('task:cancel', taskId);
      await ipc()?.invoke('voice:stop-speaking');
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    } catch (err) {
      console.error('[App] Error cancelling task:', err);
    }
    setIsSpeaking(false);
    setExecutorState('idle');
    setStatus('idle');
    inFlightRef.current = false;
    showBorderGlow(false, '');
    setMessages(prev =>
      prev.map(m =>
        m.status === 'thinking'
          ? {
              ...m,
              status: 'error',
              text: m.text || 'Task cancelled by user.',
            }
          : m
      )
    );
    // After calling API to cancel the request, voice can immediately activate
    if (voiceActiveRef.current && engineRef.current) {
      engineRef.current.activate();
      setRecording(true);
      setVoiceStatus('Listening for voice…');
    } else {
      setRecording(false);
    }
  }, [showBorderGlow]);

  const sendPrompt = useCallback(async (input: string | ExecuteOptions) => {
    const opts: ExecuteOptions = typeof input === 'string' ? { prompt: input } : input;
    const trimmed = opts.prompt?.trim() || '';
    if (!trimmed && !opts.audioBase64) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    // Temporarily pause voice engine during execution/TTS
    engineRef.current?.deactivate();
    setRecording(false);

    console.log('[App] sendPrompt started:', opts.isVoice ? '[Spoken Audio]' : trimmed);

    const startTime = Date.now();
    const userMsgId  = `u-${Date.now()}`;
    const agentMsgId = `a-${Date.now()}`;
    const currentTaskId = `task-${Date.now()}`;

    setActiveTaskId(currentTaskId);
    setMessages(prev => [
      ...prev,
      { id: userMsgId, role: 'user', text: trimmed || '🎤 Spoken Voice Input', isVoice: opts.isVoice },
      { id: agentMsgId, role: 'agent', status: 'thinking', steps: [] },
    ]);
    setStatus('executing');
    setExecutorState('observing');
    lastUtteranceRef.current = null;
    showBorderGlow(true, '⚡ Thinking & Planning…', 'thinking');

    try {
      const renderer = ipc();
      if (!renderer) throw new Error('IPC not available');

      const response = await renderer.invoke('agent:execute-prompt', {
        prompt: trimmed || undefined,
        audioBase64: opts.audioBase64,
        mimeType: opts.mimeType,
        taskId: currentTaskId,
        model: config.geminiModel,
      }) as ExecutionResponse;

      console.log('[App] agent:execute-prompt result:', response);

      const hadWhiteboardTool = response.steps?.some(s => 
        s.actionName === 'draw_whiteboard_lecture' ||
        s.actionName === 'draw_whiteboard_step' ||
        s.actionName === 'draw_mermaid_diagram'
      );

      let spokeVoiceOutput = false;
      if (response.success && response.message && !hadWhiteboardTool) {
        spokeVoiceOutput = true;
        setIsSpeaking(true);
        engineRef.current?.setMuted(true);
        engineRef.current?.deactivate();
        showBorderGlow(true, '🔊 Hey Jave is speaking…', 'speaking');
        await speak(response.message);
        setIsSpeaking(false);
        await new Promise(r => setTimeout(r, 600));
        engineRef.current?.setMuted(false);
      }

      const durationMs = Date.now() - startTime;
      const stepsCount = response.steps?.length || 0;
      const promptTokens = Math.round((trimmed.length || 20) * 1.3 + stepsCount * 380 + 320);
      const completionTokens = Math.round((response.message?.length || 50) * 0.75 + stepsCount * 120);

      setMessages(prev => prev.map(m =>
        m.id === agentMsgId
          ? {
              ...m,
              text: response.message,
              status: response.success ? 'done' : 'error',
              steps: response.steps && response.steps.length > 0 ? response.steps : m.steps,
              spokeVoice: spokeVoiceOutput,
              hadWhiteboard: !!hadWhiteboardTool,
              durationMs,
              outputTokens: {
                prompt: promptTokens,
                completion: completionTokens,
                total: promptTokens + completionTokens,
              },
            }
          : m
      ));
      setStatus(response.success ? 'completed' : 'error');

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[App] execute-prompt failed:', msg);
      const durationMs = Date.now() - startTime;
      setMessages(prev => prev.map(m =>
        m.id === agentMsgId
          ? {
              ...m,
              text: `Error: ${msg}`,
              status: 'error',
              durationMs,
            }
          : m
      ));
      setStatus('error');
    } finally {
      inFlightRef.current = false;
      setStatus('idle');
      setExecutorState('idle');
      
      // Settling buffer before resuming voice listening
      await new Promise(r => setTimeout(r, 500));

      // Automatically resume voice listening ONLY if voice detection is active
      if (voiceActiveRef.current && !inFlightRef.current && engineRef.current) {
        engineRef.current.activate();
        setRecording(true);
        setVoiceStatus('Listening for voice…');
        showBorderGlow(false, '');
      } else {
        setRecording(false);
        showBorderGlow(false, '');
      }
    }
  }, [config.geminiModel, showBorderGlow]);

  sendPromptRef.current = sendPrompt;

  /* Status label */
  const statusLabel = () => {
    if (voiceStatus) return voiceStatus;
    if (isSpeaking) return 'Speaking…';
    if (status === 'executing') return 'Agent is working…';
    if (status === 'completed') return 'Done';
    if (status === 'error') return 'Something went wrong';
    return config.geminiModel || 'gemini-2.5-flash';
  };

  const handleSelectHitlOption = useCallback(async (hitlId: string, taskId: string, option: string) => {
    const renderer = ipc();
    if (!renderer) return;

    setMessages(prev =>
      prev.map(m =>
        m.hitl && m.hitl.id === hitlId
          ? {
              ...m,
              hitl: {
                ...m.hitl,
                selectedAnswer: option,
              },
            }
          : m
      )
    );

    try {
      await renderer.invoke('agent:human-response', { id: hitlId, taskId, answer: option });
    } catch (err) {
      console.error('[App] Failed to send HITL response:', err);
    }
  }, []);

  const dotClass = isAnimationActive ? 'busy' : status === 'error' ? 'error' : '';


  return (
    <>
      {/* Window edge animation — visible while agent/user is speaking or busy */}
      <div className={`edge-border${isAnimationActive ? ' is-active' : ''}`} />

      <div className="app">
        {/* ── Top Bar ── */}
        <header className="topbar">
          <div className="topbar-left">
            <div className="logo-icon">
              <StaticCupIcon size={18} />
            </div>
            <span className="logo-name">Cup Work</span>
          </div>

          <div className="topbar-center">
            {backendConnected && config.geminiModel ? (
              <div
                className="tooltip tooltip-bottom"
                data-tip={`Python Brain: ${config.geminiModel} • Status: ${statusLabel()}`}
              >
                <div className="model-pill cursor-help">
                  <span className={`status-dot${isAnimationActive ? ' busy' : ''}${dotClass ? ` ${dotClass}` : ''}`} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {statusLabel()}
                  </span>
                </div>
              </div>
            ) : null}
          </div>

          <div className="topbar-right flex items-center gap-1.5">
            {backendConnected && (
              <div
                className="tooltip tooltip-left"
                data-tip={
                  (isTaskRunning && executorState !== 'paused') || inFlightRef.current
                    ? "Agent is busy executing — microphone disabled until complete or paused"
                    : recording
                    ? "Microphone is ON (listening for voice) — click to mute"
                    : "Microphone is OFF — click to activate voice detection"
                }
              >
                <button
                  className={`btn btn-circle btn-sm transition-all ${
                    (isTaskRunning && executorState !== 'paused') || inFlightRef.current
                      ? 'btn-ghost opacity-40 cursor-not-allowed text-slate-400'
                      : recording
                      ? 'btn-success text-white shadow-2xs'
                      : 'btn-ghost text-slate-400 hover:text-slate-700 hover:bg-slate-200'
                  }`}
                  onClick={
                    (isTaskRunning && executorState !== 'paused') || inFlightRef.current
                      ? undefined
                      : recording
                      ? cancelRecording
                      : startRecording
                  }
                  disabled={(isTaskRunning && executorState !== 'paused') || inFlightRef.current}
                  aria-label={recording ? "Mute microphone" : "Activate microphone"}
                >
                  {recording ? <Mic size={15} /> : <MicOff size={15} />}
                </button>
              </div>
            )}
          </div>
        </header>

        {/* ── Agent State Bar ── */}
        {isBusy && (
          <div className="agent-state-bar">
            {[
              { key: 'observing', label: 'OBSERVING' },
              { key: 'planning', label: 'PLANNING' },
              { key: 'acting', label: 'ACTING' },
              { key: 'verifying', label: 'VERIFYING' },
            ].map((step, i) => {
              const activeIndex = ['observing', 'planning', 'acting', 'verifying'].findIndex(s => s === executorState);
              const isActive = i === activeIndex;
              const isDone = i < activeIndex;
              return (
                <React.Fragment key={step.key}>
                  <span className={`agent-state-step${isActive ? ' active' : ''}${isDone ? ' done' : ''}`}>
                    <span className="step-dot" />
                    {step.label}
                  </span>
                  {i < 3 && <span className="agent-state-arrow">→</span>}
                </React.Fragment>
              );
            })}
          </div>
        )}

        {/* ── Chat Area ── */}
        <main className="chat-area" style={{ position: 'relative' }}>
          {messages.length === 0 ? (
            <div className="empty-state">
              <CoffeeCup />
              {backendConnected ? (
                <>
                  <h3>How can I help you today?</h3>
                  <p>
                    {recording
                      ? 'Voice detection is active — speak naturally to control your Windows PC.'
                      : 'Microphone is OFF — click the microphone button below to activate voice control.'}
                  </p>
                </>
              ) : (
                <>
                  <h3>Waiting for Brain Connection…</h3>
                  <p className="text-slate-400">
                    Python Brain server is offline. Please launch backend to start Cup Work.
                  </p>
                </>
              )}
            </div>
          ) : (
            messages.map(msg =>
              msg.role === 'user'
                ? <UserMessage key={msg.id} text={msg.text || ''} isVoice={msg.isVoice} />
                : <AgentMessage
                    key={msg.id}
                    msg={msg}
                    isPaused={executorState === 'paused'}
                    onSelectHitlOption={handleSelectHitlOption}
                  />
            )

          )}
          <div ref={chatEndRef} />
          <CommentaryBanner text={commentary} />
        </main>

        {/* ── Bottom Dock Bar (Voice & Task Execution Controls with DaisyUI Tooltips) ── */}
        <div className="voice-bar">
          {isTaskRunning ? (
            <div className="task-controls-dock">
              <div className="task-status-pill">
                <span className={`step-dot active${executorState === 'paused' ? ' paused' : ''}`} />
                <span>{executorState === 'paused' ? 'Task paused' : (statusLabel() || 'Agent executing…')}</span>
              </div>
              {executorState === 'paused' ? (
                <button
                  className="task-action-btn resume"
                  onClick={() => handleResume(activeTaskId)}
                  title="Resume task execution"
                >
                  <Play size={14} /> Resume
                </button>
              ) : (
                <button
                  className="task-action-btn pause"
                  onClick={() => handlePause(activeTaskId)}
                  title="Pause task execution"
                >
                  <Pause size={14} /> Pause
                </button>
              )}
              <button
                className="task-action-btn cancel"
                onClick={() => handleCancel(activeTaskId)}
                title="Stop / Cancel task"
              >
                <Square size={13} /> Stop
              </button>
            </div>
          ) : !backendConnected ? (
            <div className="flex flex-col items-center">
              <div
                className="tooltip tooltip-top"
                data-tip="Python Brain is offline — start backend to activate voice"
              >
                <button
                  className="mic-btn opacity-40 cursor-not-allowed bg-slate-200 shadow-none hover:shadow-none"
                  disabled
                  aria-label="Backend offline"
                >
                  <MicOff size={24} className="text-slate-400" />
                </button>
              </div>
            </div>
          ) : recording ? (
            <div className="flex items-center gap-2">
              <div
                className="tooltip tooltip-top tooltip-error"
                data-tip="Microphone is ON (listening) — click to mute"
              >
                <button
                  className="voice-btn cancel"
                  onClick={cancelRecording}
                  aria-label="Mute microphone"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="recording-pill">
                <span className="rec-dot" aria-hidden="true" />
                <span className="text-xs font-semibold text-slate-700">
                  {voiceStatus || 'Listening for voice…'}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <div
                className="tooltip tooltip-top tooltip-primary"
                data-tip="Microphone is OFF — click to activate voice detection"
              >
                <button
                  className="mic-btn"
                  onClick={startRecording}
                  aria-label="Start voice listening"
                >
                  <Mic size={28} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ── Sub-components ─────────────────────────────────────────── */
function UserMessage({ text, isVoice }: { text?: string; isVoice?: boolean }) {
  return (
    <div className="message-row">
      <div className="msg-avatar user">Y</div>
      <div className="msg-body">
        <div className="msg-label">You</div>
        {isVoice ? (
          <div
            className="msg-text voice-command-badge"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 14px',
              borderRadius: 16,
              background: 'rgba(251, 188, 4, 0.12)',
              border: '1px solid rgba(251, 188, 4, 0.3)',
              color: '#fbbc04',
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            <Mic size={14} style={{ flexShrink: 0 }} />
            <span>Voice Command</span>
          </div>
        ) : (
          <div className="msg-text">{text}</div>
        )}
      </div>
    </div>
  );
}

function AgentMessage({
  msg,
  isPaused,
  onSelectHitlOption,
}: {
  msg: ChatMessage;
  isPaused?: boolean;
  onSelectHitlOption?: (hitlId: string, taskId: string, option: string) => void;
}) {
  const isThinking = msg.status === 'thinking';
  const isError    = msg.status === 'error';
  const isWaitingInput = !!msg.hitl && !msg.hitl.selectedAnswer;
  const [customInput, setCustomInput] = useState('');


  return (
    <div className="message-row">
      <div className="msg-avatar agent">
        {isThinking
          ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
          : <StaticCupIcon size={14} />
        }
      </div>
      <div className="msg-body w-full">
        <div className="msg-label flex items-center gap-2">
          <span>Cup Work</span>
          {msg.durationMs && msg.durationMs > 0 && (
            <span className="badge badge-xs badge-ghost font-mono text-[10px] text-slate-400">
              {(msg.durationMs / 1000).toFixed(1)}s
            </span>
          )}
        </div>

        {isThinking && (!msg.steps || msg.steps.length === 0) && !msg.hitl && (
          <div className="thinking-dots my-2">
            <span /><span /><span />
          </div>
        )}

        {/* ── Interactive In-App Question Card (HITL Options) ── */}
        {msg.hitl && (
          <div className="my-3 p-4 rounded-2xl border border-primary/20 bg-base-100 shadow-md transition-all">
            <div className="flex items-center justify-between gap-2 mb-2.5 pb-2 border-b border-base-200">
              <div className="flex items-center gap-2">
                <span className="badge badge-primary badge-sm font-semibold gap-1">
                  ❓ Question
                </span>
                <span className="text-xs font-semibold text-slate-500">
                  Select your answer below
                </span>
              </div>
              {msg.hitl.selectedAnswer && (
                <span className="badge badge-success badge-sm text-white font-medium gap-1 animate-fadeIn">
                  ✓ Answered: {msg.hitl.selectedAnswer}
                </span>
              )}
            </div>

            <p className="text-sm font-bold text-black mb-3.5 leading-relaxed" style={{ color: '#000000' }}>
              {msg.hitl.question}
            </p>

            {msg.hitl.options && msg.hitl.options.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {msg.hitl.options.map((opt, optIdx) => {
                  const isSelected = msg.hitl?.selectedAnswer === opt;
                  const isAnswered = !!msg.hitl?.selectedAnswer;
                  const letter = String.fromCharCode(65 + optIdx);
                  return (
                    <button
                      key={optIdx}
                      onClick={() => !isAnswered && onSelectHitlOption?.(msg.hitl!.id, msg.hitl!.taskId, opt)}
                      disabled={isAnswered}
                      className={`btn btn-sm justify-start text-left normal-case transition-all duration-150 h-auto py-2.5 px-3 rounded-xl border ${
                        isSelected
                          ? 'bg-slate-900 hover:bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-primary ring-offset-1 scale-[1.01]'
                          : isAnswered
                          ? 'bg-slate-100 border-slate-300 text-black cursor-not-allowed opacity-90'
                          : 'bg-white hover:bg-slate-50 border-slate-300 hover:border-slate-500 text-black shadow-xs hover:scale-[1.01] active:scale-[0.99]'
                      }`}
                    >
                      <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[11px] font-extrabold mr-2 shrink-0 ${
                        isSelected ? 'bg-white text-slate-900' : 'bg-slate-200 text-black'
                      }`}>
                        {letter}
                      </span>
                      <span
                        className="text-xs font-bold flex-1 leading-snug"
                        style={{ color: isSelected ? '#ffffff' : '#000000' }}
                      >
                        {opt}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {!msg.hitl.selectedAnswer && (!msg.hitl.options || msg.hitl.options.length === 0) && (
              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  className="input input-sm input-bordered flex-1 rounded-xl text-xs text-black font-medium bg-white"
                  style={{ color: '#000000' }}
                  placeholder="Type your response…"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customInput.trim()) {
                      onSelectHitlOption?.(msg.hitl!.id, msg.hitl!.taskId, customInput.trim());
                      setCustomInput('');
                    }
                  }}
                />
                <button
                  className="btn btn-sm btn-primary rounded-xl px-4 text-xs font-semibold"
                  disabled={!customInput.trim()}
                  onClick={() => {
                    if (customInput.trim()) {
                      onSelectHitlOption?.(msg.hitl!.id, msg.hitl!.taskId, customInput.trim());
                      setCustomInput('');
                    }
                  }}
                >
                  Send
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── DaisyUI Horizontal Steps with Scrollable Wrapper & Live Execution Controller ── */}
        <ToolCallTimeline
          steps={msg.steps}
          isThinking={isThinking}
          isPaused={isPaused}
          isWaitingInput={isWaitingInput}
          isCompleted={msg.status === 'done'}
          spokeVoice={msg.spokeVoice}
          hadWhiteboard={msg.hadWhiteboard}
          error={isError ? msg.text : undefined}
          activeAgent={msg.activeAgent}
          outputTokens={msg.outputTokens}
          totalDurationMs={msg.durationMs}
        />


        {msg.text && (
          <div
            className="msg-text"
            style={{
              marginTop: msg.steps && msg.steps.length > 0 ? 12 : 4,
              color: isError ? '#ea4335' : 'var(--text-primary)',
            }}
          >
            <MarkdownView content={msg.text} />
          </div>
        )}

      </div>
    </div>
  );
}

