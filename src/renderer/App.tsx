import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AgentStatus, AgentStep, AppConfig, ExecutionResponse, ExecutorState, HitlQuestion } from '../shared/types';
import { VoiceEngine } from './voiceEngine';
import {
  Bot, CheckCircle2, XCircle, Loader2, Zap, Monitor, Type, Keyboard, Mic, X,
  Pause, Play, Square
} from 'lucide-react';
import { CommentaryBanner } from './components/CommentaryBanner';

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
    await ipc()?.invoke('voice:speak', { text: plain });
  } catch (err) {
    console.error('[App] TTS failed:', err);
  }
}

/* ── Types ─────────────────────────────────────────────────── */
interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  text?: string;
  isVoice?: boolean;
  steps?: AgentStep[];
  status?: 'thinking' | 'done' | 'error';
}

interface ExecuteOptions {
  prompt?: string;
  audioBase64?: string;
  mimeType?: string;
  isVoice?: boolean;
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
  take_screenshot:      <Bot size={13} />,
};

/* ── App ────────────────────────────────────────────────────── */
export default function App() {
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [executorState, setExecutorState] = useState<ExecutorState | 'idle'>('idle');
  const [activeTaskId, setActiveTaskId] = useState<string>('');
  const [hitlQuestion, setHitlQuestion] = useState<HitlQuestion | null>(null);
  const [commentary, setCommentary] = useState('');
  const [config, setConfig] = useState<AppConfig>({
    geminiModel: 'gemini-2.5-flash',
  });
  const chatEndRef = useRef<HTMLDivElement>(null);

  /* ── Voice: ambient auto-listening (active by default) ── */
  const [recording, setRecording] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<string>('Listening for voice…');
  const engineRef = useRef<VoiceEngine | null>(null);
  const pendingHitlRef = useRef<HitlQuestion | null>(null);
  const lastUtteranceRef = useRef<{ wavBase64: string; mimeType: string } | null>(null);
  const voiceActiveRef = useRef(true);
  const sendPromptRef = useRef<(input: string | ExecuteOptions) => Promise<void>>();

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
      onUtterance: async (utterance) => {
        console.log('[Voice] Utterance captured:', utterance.durationMs, 'ms');
        lastUtteranceRef.current = { wavBase64: utterance.wavBase64, mimeType: utterance.mimeType };

        // If the agent is waiting for a HITL response, transcribe for fast answer resolution
        if (pendingHitlRef.current) {
          showBorderGlow(true, 'Analyzing answer…', 'thinking');
          const res = await ipc()?.invoke('voice:transcribe', {
            audioBase64: utterance.wavBase64,
            mimeType: utterance.mimeType,
          }) as { success: boolean; text?: string; error?: string } | undefined;

          if (res?.success && res.text) {
            const transcript = res.text.trim().replace(/^["']|["']$/g, '').trim();
            console.log('[Voice] Resolving HITL question with answer:', transcript);
            await ipc()?.invoke('agent:human-response', {
              id: pendingHitlRef.current.id,
              taskId: pendingHitlRef.current.taskId,
              answer: transcript,
            });
            setHitlQuestion(null);
            pendingHitlRef.current = null;
            setVoiceStatus('Listening for voice…');
            showBorderGlow(false, '');
            return;
          }
        }

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
        setVoiceStatus(`Wait ${seconds}…`);
      },
      onIdleTimeout: () => {
        console.log('[Voice] Idle timeout');
      },
    });

    engineRef.current = engine;

    // Auto-activate mic on mount
    let unmounted = false;
    (async () => {
      try {
        await engine.start();
        if (!unmounted && voiceActiveRef.current) {
          engine.activate();
          setRecording(true);
          setVoiceStatus('Listening for voice…');
          showBorderGlow(false, '');
        }
      } catch (err) {
        console.warn('[App] Auto-mic start error:', err);
        if (!unmounted) {
          setRecording(false);
          voiceActiveRef.current = false;
          setVoiceStatus('Tap mic to activate');
        }
      }
    })();

    return () => {
      unmounted = true;
      engine.stop().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showBorderGlow]);

  /* Start / Resume listening */
  const startRecording = useCallback(async () => {
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
  }, [showBorderGlow]);

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
      }
    }).catch(console.error);

    const onStep = (_: unknown, data: unknown) => {
      const step = data as AgentStep;
      setMessages(prev => prev.map(m =>
        m.role === 'agent' && m.status === 'thinking'
          ? { ...m, steps: [...(m.steps || []), step] }
          : m
      ));
      if (step.thought || step.actionName) {
        showBorderGlow(true, `🛠️ ${step.thought || `Executing ${step.actionName}`}`, 'executing');
      }
    };

    const onBackendStatus = (_: unknown, data: unknown) => {
      const st = data as { connected: boolean };
      if (st.connected) {
        renderer.invoke('config:get').then((res) => {
          if (res) setConfig(res as AppConfig);
        }).catch(console.error);
      }
    };

    const onStateChange = (_: unknown, data: unknown) => {
      const st = data as { taskId: string; state: ExecutorState };
      setActiveTaskId(st.taskId);
      setExecutorState(st.state);
      if (st.state === 'waiting_hitl') setStatus('verifying');
    };

    const onHitlQuestion = (_: unknown, data: unknown) => {
      const q = data as HitlQuestion;
      setHitlQuestion(q);
      pendingHitlRef.current = q;
    };

    const onCommentary = (_: unknown, data: unknown) => {
      const c = data as { text: string };
      setCommentary(c.text);
    };

    const onTtsSpeak = (_: unknown, data: unknown) => {
      const c = data as { text: string };
      if (c.text) void speak(c.text);
    };

    renderer.on('agent:step-update', onStep);
    renderer.on('backend:status', onBackendStatus);
    renderer.on('agent:state-change', onStateChange);
    renderer.on('agent:hitl-question', onHitlQuestion);
    renderer.on('agent:commentary', onCommentary);
    renderer.on('agent:tts-speak', onTtsSpeak);

    return () => {
      renderer.removeAllListeners('agent:step-update');
      renderer.removeAllListeners('backend:status');
      renderer.removeAllListeners('agent:state-change');
      renderer.removeAllListeners('agent:hitl-question');
      renderer.removeAllListeners('agent:commentary');
      renderer.removeAllListeners('agent:tts-speak');
    };
  }, []);

  /* Auto-scroll */
  const inFlightRef = useRef(false);
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const isBusy = status === 'analyzing' || status === 'executing';
  const isTaskRunning = isBusy || isSpeaking || (executorState !== 'idle');
  const isAnimationActive = isBusy || isSpeaking;

  const handlePause = useCallback(async (taskId: string) => {
    await ipc()?.invoke('task:pause', taskId);
    setExecutorState('paused');
  }, []);

  const handleResume = useCallback(async (taskId: string) => {
    await ipc()?.invoke('task:resume', taskId);
    setHitlQuestion(null);
    setExecutorState('acting');
  }, []);

  const handleCancel = useCallback(async (taskId: string) => {
    await ipc()?.invoke('task:cancel', taskId);
    setHitlQuestion(null);
    setExecutorState('idle');
    setStatus('idle');
    showBorderGlow(false, '');
  }, [showBorderGlow]);

  const handleHitlAnswer = useCallback(async (answer: string) => {
    if (!hitlQuestion) return;
    await ipc()?.invoke('agent:human-response', {
      id: hitlQuestion.id,
      taskId: hitlQuestion.taskId,
      answer,
    });
    setHitlQuestion(null);
    pendingHitlRef.current = null;
  }, [hitlQuestion]);

  const sendPrompt = useCallback(async (input: string | ExecuteOptions) => {
    const opts: ExecuteOptions = typeof input === 'string' ? { prompt: input } : input;
    const trimmed = opts.prompt?.trim() || '';
    if (!trimmed && !opts.audioBase64) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    // Temporarily pause voice engine during execution/TTS
    engineRef.current?.deactivate();

    console.log('[App] sendPrompt started:', opts.isVoice ? '[Spoken Audio]' : trimmed);

    const userMsgId  = `u-${Date.now()}`;
    const agentMsgId = `a-${Date.now()}`;
    const currentTaskId = `task-${Date.now()}`;

    setActiveTaskId(currentTaskId);
    setMessages(prev => [
      ...prev,
      { id: userMsgId, role: 'user', text: trimmed, isVoice: opts.isVoice },
      { id: agentMsgId, role: 'agent', status: 'thinking', steps: [] },
    ]);
    setStatus('executing');
    setExecutorState('observing');
    setHitlQuestion(null);
    lastUtteranceRef.current = null;
    showBorderGlow(true, '⚡ Thinking & Planning…', 'thinking');

    // If audio is provided, optionally transcribe in parallel for user message text display
    if (opts.isVoice && opts.audioBase64 && !trimmed) {
      ipc()?.invoke('voice:transcribe', {
        audioBase64: opts.audioBase64,
        mimeType: opts.mimeType,
      }).then((res) => {
        const trans = res as { success: boolean; text?: string } | undefined;
        if (trans?.success && trans.text) {
          const cleanText = trans.text.trim().replace(/^["']|["']$/g, '').trim();
          setMessages(prev => prev.map(m => m.id === userMsgId ? { ...m, text: cleanText } : m));
        }
      }).catch(() => {});
    }

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

      setMessages(prev => prev.map(m =>
        m.id === agentMsgId
          ? { ...m, text: response.message, status: response.success ? 'done' : 'error' }
          : m
      ));
      setStatus(response.success ? 'completed' : 'error');
      setActiveTaskId(response.taskId || currentTaskId);

      // Speak the agent's final answer back via TTS with active glow animation
      if (response.success && response.message) {
        setIsSpeaking(true);
        showBorderGlow(true, '🔊 Hey Jave is speaking…', 'speaking');
        await speak(response.message);
        setIsSpeaking(false);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[App] execute-prompt failed:', msg);
      setMessages(prev => prev.map(m =>
        m.id === agentMsgId
          ? { ...m, text: `Error: ${msg}`, status: 'error' }
          : m
      ));
      setStatus('error');
    } finally {
      inFlightRef.current = false;
      setStatus('idle');
      setExecutorState('idle');
      // Automatically resume voice listening if voice is enabled
      if (voiceActiveRef.current && engineRef.current) {
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
              <Bot size={18} />
            </div>
            <span className="logo-name">Hey Jave</span>
          </div>

          <div className="topbar-center">
            <div className="model-pill" title={`Python Brain: ${config.geminiModel || 'gemini-2.5-flash'}`}>
              <span className={`status-dot${isAnimationActive ? ' busy' : ''}${dotClass ? ` ${dotClass}` : ''}`} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {statusLabel()}
              </span>
            </div>
          </div>

          <div className="topbar-right">
            {recording && (
              <button className="icon-btn" onClick={cancelRecording} title="Mute microphone">
                <Mic size={16} color="#34a853" />
              </button>
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
              <div className="big-icon">
                <Bot size={22} color="var(--accent)" />
              </div>
              <h3>How can I help you today?</h3>
              <p>Voice detection is active — speak naturally to control your Windows PC.</p>
            </div>
          ) : (
            messages.map(msg =>
              msg.role === 'user'
                ? <UserMessage key={msg.id} text={msg.text || ''} isVoice={msg.isVoice} />
                : <AgentMessage key={msg.id} msg={msg} />
            )
          )}
          <div ref={chatEndRef} />
          <CommentaryBanner text={commentary} />
        </main>

        {/* ── Human-in-the-loop Question ── */}
        {hitlQuestion && (
          <div className="hitl-panel">
            <div className="hitl-question">{hitlQuestion.question}</div>
            <div className="hitl-options">
              {hitlQuestion.options.map((opt) => (
                <button
                  key={opt}
                  onClick={() => handleHitlAnswer(opt)}
                  className="hitl-option"
                >
                  {opt}
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleHitlAnswer((e.target as HTMLFormElement).hitlFreeText.value);
                (e.target as HTMLFormElement).reset();
              }}
              className="hitl-freeform"
            >
              <input
                name="hitlFreeText"
                placeholder="Or type your answer…"
                className="hitl-input"
              />
              <button type="submit" className="hitl-send">Send</button>
            </form>
          </div>
        )}

        {/* ── Bottom Dock Bar (Voice & Task Execution Controls) ── */}
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
          ) : recording ? (
            <>
              <button className="voice-btn cancel" onClick={cancelRecording} title="Mute microphone" aria-label="Mute microphone">
                <X size={18} />
              </button>
              <div className="recording-pill">
                <span className="rec-dot" aria-hidden="true" />
                {voiceStatus || 'Listening for voice…'}
              </div>
            </>
          ) : (
            <>
              <button
                className="mic-btn"
                onClick={startRecording}
                title="Tap to activate voice detection"
                aria-label="Start voice listening"
              >
                <Mic size={28} />
              </button>
              <p className="voice-hint">{voiceStatus || 'Mic paused — tap to activate'}</p>
            </>
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

function AgentMessage({ msg }: { msg: ChatMessage }) {
  const isThinking = msg.status === 'thinking';
  const isError    = msg.status === 'error';

  return (
    <div className="message-row">
      <div className="msg-avatar agent">
        {isThinking
          ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
          : <Bot size={13} />
        }
      </div>
      <div className="msg-body">
        <div className="msg-label">Hey Jave</div>

        {isThinking && (!msg.steps || msg.steps.length === 0) && (
          <div className="thinking-dots">
            <span /><span /><span />
          </div>
        )}

        {msg.steps && msg.steps.length > 0 && (
          <div className="steps-list">
            {msg.steps.map(step => <StepCard key={step.id} step={step} />)}
            {isThinking && (
              <div className="step-item run">
                <div className="step-icon">
                  <Loader2 size={13} style={{ animation: 'spin 1s linear infinite', color: '#fbbc04' }} />
                </div>
                <div className="step-detail">
                  <div className="step-desc" style={{ color: '#fbbc04' }}>Running…</div>
                </div>
              </div>
            )}
          </div>
        )}

        {msg.text && (
          <div
            className="msg-text"
            style={{
              marginTop: msg.steps && msg.steps.length > 0 ? 10 : 0,
              color: isError ? '#ea4335' : 'var(--text-primary)',
            }}
          >
            {msg.text}
          </div>
        )}
      </div>
    </div>
  );
}

function StepCard({ step }: { step: AgentStep }) {
  const icon = step.success
    ? <CheckCircle2 size={13} style={{ color: '#34a853', flexShrink: 0 }} />
    : <XCircle size={13} style={{ color: '#ea4335', flexShrink: 0 }} />;

  const actionIcon = ACTION_ICONS[step.actionName] || <Zap size={13} />;

  return (
    <div className={`step-item ${step.success ? 'ok' : 'fail'}`}>
      <div className="step-icon">{icon}</div>
      <div className="step-detail">
        <div className="step-name" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {actionIcon} {step.actionName.replaceAll('_', ' ')}
        </div>
        {step.thought && step.thought !== `Executing desktop action: ${step.actionName}` && (
          <div className="step-desc">{step.thought}</div>
        )}
        <div className="step-time">{step.timestamp}</div>
      </div>
    </div>
  );
}
