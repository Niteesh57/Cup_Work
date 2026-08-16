import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AgentStatus, AgentStep, AppConfig, ExecutionResponse } from '../shared/types';
import { VoiceEngine } from './voiceEngine';
import {
  Bot, Send, Settings, Sun, Moon, CheckCircle2,
  XCircle, Loader2, AlertCircle, Zap, Monitor, Type, Keyboard
} from 'lucide-react';
import { SettingsModal } from './components/SettingsModal';
import appIconUrl from './assets/icon.png';

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

function speak(text: string) {
  const plain = stripMarkdown(text).slice(0, 600); // cap at 600 chars for TTS
  if (!plain) return;
  console.log('[TTS] Speaking:', plain.slice(0, 80) + '…');
  ipc()?.invoke('voice:speak', { text: plain }).catch((err) => console.error('[App] TTS failed:', err));
}

/* ── Types ─────────────────────────────────────────────────── */
interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  text?: string;
  steps?: AgentStep[];
  status?: 'thinking' | 'done' | 'error';
}

const QUICK_ACTIONS = [
  'Minimize all open windows',
  'Open Notepad',
  'Take a screenshot',
  'Show me what windows are open',
];

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
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try { return (localStorage.getItem('hj-theme') as 'dark' | 'light') || 'dark'; }
    catch { return 'dark'; }
  });
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [config, setConfig] = useState<AppConfig>({
    geminiApiKey: '',
    geminiModel: 'gemini-2.5-flash',
    uiaTimeoutMs: 5000,
    enableVisionFallback: true,
  });
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /* ── Voice: native mic + VAD state machine ─────────────────────── */
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<string>('');
  const engineRef = useRef<VoiceEngine | null>(null);
  const activatedRef = useRef(false);
  const sendPromptRef = useRef<(text: string) => void>(() => {});

  const showBorderGlow = useCallback((show: boolean, message?: string) => {
    if (show) {
      ipc()?.invoke('agent:listen-start');
    } else {
      ipc()?.invoke('agent:listen-stop');
    }
    if (message !== undefined) setVoiceStatus(message);
  }, []);

  useEffect(() => {
    const engine = new VoiceEngine({
      onUtterance: async (utterance) => {
        console.log('[Voice] Utterance captured:', utterance.durationMs, 'ms');
        showBorderGlow(true, 'Analyzing audio…');

        // Transcribe via Gemini in the main process.
        const res = await ipc()?.invoke('voice:transcribe', {
          audioBase64: utterance.wavBase64,
          mimeType: utterance.mimeType,
        }) as { success: boolean; text?: string; error?: string } | undefined;

        if (!res?.success || !res.text) {
          const errorMsg = res?.error || 'Unknown transcription error';
          console.error('[Voice] Transcription failed:', errorMsg);
          setVoiceStatus(`Error: ${errorMsg}`);
          showBorderGlow(false, '');
          return;
        }

        const transcript = res.text.trim().replace(/^["']|["']$/g, '').trim();
        console.log('[Voice] Transcript:', transcript);

        // Extract command if it starts with "hey [name]", or use whole transcript
        const match = transcript.match(/^(?:\s*hey(?:\s+(?:jave|java|jawa|javi|jarvis|javee|agent|buddy|there))?\b[,\s!?.:]*)/i);
        let command = transcript;
        if (match) {
          command = transcript.slice(match[0].length).trim();
        }

        activatedRef.current = true;
        setVoiceActive(true);
        engine.activate();

        if (command) {
          console.log('[Voice] Sending command to agent:', command);
          void sendPromptRef.current(command);
        } else {
          showBorderGlow(true, 'Listening…');
          speak("I'm listening, tell me what you need.");
        }
      },
      onStateChange: (state) => {
        console.log('[Voice] State:', state);
        if (state === 'SPEAKING') {
          showBorderGlow(true, 'User speaking…');
        } else if (state === 'COUNTDOWN') {
          showBorderGlow(true, 'Listening…');
        }
      },
      onCountdown: (seconds) => {
        setVoiceStatus(`Wait ${seconds}…`);
      },
      onIdleTimeout: () => {
        console.log('[Voice] Idle timeout (30s) — deactivating');
        activatedRef.current = false;
        setVoiceActive(false);
        showBorderGlow(false, '');
        setStatus('idle');
      },
    });

    engineRef.current = engine;
    engine.start()
      .then(() => console.log('[Voice] Native voice engine started (background listening)'))
      .catch((err) => console.error('[Voice] Failed to start mic:', err));

    return () => {
      engine.stop().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showBorderGlow]);

  /* Toggle theme */
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('hj-theme', next); } catch {}
  };

  /* Load config on mount */
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
    };

    renderer.on('agent:step-update', onStep);
    return () => renderer.removeAllListeners('agent:step-update');
  }, []);

  /* Auto-scroll */
  const inFlightRef = useRef(false);
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /* Auto-resize textarea */
  const resizeTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  };

  const isBusy = status === 'analyzing' || status === 'executing';

  const sendPrompt = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || inFlightRef.current) return;
    inFlightRef.current = true;

    console.log('[App] sendPrompt started:', trimmed);

    const userMsgId  = `u-${Date.now()}`;
    const agentMsgId = `a-${Date.now()}`;

    setMessages(prev => [
      ...prev,
      { id: userMsgId, role: 'user', text: trimmed },
      { id: agentMsgId, role: 'agent', status: 'thinking', steps: [] },
    ]);
    setPrompt('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setStatus('executing');
    showBorderGlow(true, 'Thinking…');

    try {
      const renderer = ipc();
      if (!renderer) throw new Error('IPC not available');

      const response = await renderer.invoke('agent:execute-prompt', {
        prompt: trimmed,
      }) as ExecutionResponse;

      console.log('[App] agent:execute-prompt result:', response);

      setMessages(prev => prev.map(m =>
        m.id === agentMsgId
          ? { ...m, text: response.message, status: response.success ? 'done' : 'error' }
          : m
      ));
      setStatus(response.success ? 'completed' : 'error');

      // Speak the agent's final answer back via TTS.
      if (response.success && response.message) {
        showBorderGlow(true, 'Agent speaking…');
        speak(response.message);
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
    }

    setTimeout(() => {
      setStatus('idle');
      showBorderGlow(false, '');
    }, 3000);
  }, [config, showBorderGlow]);

  // Keep the voice engine's reference to the latest sendPrompt.
  sendPromptRef.current = sendPrompt;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendPrompt(prompt);
    }
  };

  const handleSaveConfig = async (partial: Partial<AppConfig>) => {
    const updated = { ...config, ...partial };
    setConfig(updated);
    try {
      await ipc()?.invoke('config:save', partial);
    } catch (e) { console.error(e); }
  };

  /* Status label */
  const statusLabel = () => {
    if (voiceStatus) return voiceStatus;
    if (status === 'executing') return 'Agent is working…';
    if (status === 'completed') return 'Done';
    if (status === 'error') return 'Something went wrong';
    return config.geminiModel || 'Ready';
  };

  const dotClass = isBusy ? 'busy' : status === 'error' ? 'error' : '';

  return (
    <>
      {/* Window edge animation — visible while busy or voice active */}
      <div className={`edge-border${isBusy || voiceActive ? ' is-active' : ''}`} />

      <div className="app">
        {/* ── Top Bar ── */}
        <header className="topbar">
          <div className="topbar-left">
            <img src={appIconUrl} alt="Hey Jave" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover' }} />
            <span className="logo-name">Hey Jave</span>
          </div>

          <div className="topbar-center">
            <div className="model-pill" title={voiceActive ? 'Voice session active' : 'Background voice listening active'}>
              <span className={`status-dot${voiceActive || isBusy ? ' busy' : ''}${dotClass ? ` ${dotClass}` : ''}`} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {statusLabel()}
              </span>
            </div>
          </div>

          <div className="topbar-right">
            <button className="icon-btn" onClick={toggleTheme} title="Toggle dark / light mode">
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button className="icon-btn" onClick={() => setShowSettings(true)} title="Settings">
              <Settings size={16} />
            </button>
          </div>
        </header>

        {/* ── API Key Warning ── */}
        {!config.geminiApiKey && (
          <div className="no-key-banner">
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <AlertCircle size={14} />
              <span>Gemini API key not set — add it in Settings to run prompts.</span>
            </div>
            <button onClick={() => setShowSettings(true)}>Add API Key</button>
          </div>
        )}

        {/* ── Chat Area ── */}
        <main className="chat-area">
          {messages.length === 0 ? (
            <div className="empty-state">
              <div className="big-icon">
                <Bot size={22} color="var(--accent)" />
              </div>
              <h3>How can I help you today?</h3>
              <p>Tell me what to do on your Windows PC.</p>
              <div className="quick-chips">
                {QUICK_ACTIONS.map(action => (
                  <button key={action} className="quick-chip" onClick={() => sendPrompt(action)}>
                    {action}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map(msg =>
              msg.role === 'user'
                ? <UserMessage key={msg.id} text={msg.text || ''} />
                : <AgentMessage key={msg.id} msg={msg} />
            )
          )}
          <div ref={chatEndRef} />
        </main>

        {/* ── Input Bar ── */}
        <div className="input-bar">
          <div className="input-wrap">
            <textarea
              ref={textareaRef}
              className="prompt-input"
              placeholder="Ask Hey Jave to do something on your PC…"
              rows={1}
              value={prompt}
              onChange={(e) => { setPrompt(e.target.value); resizeTextarea(); }}
              onKeyDown={handleKeyDown}
              disabled={isBusy}
            />
            <button
              className="send-btn"
              onClick={() => sendPrompt(prompt)}
              disabled={isBusy || !prompt.trim()}
              title="Send (Enter)"
            >
              {isBusy
                ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
                : <Send size={15} />
              }
            </button>
          </div>
          <p className="input-hint">Press Enter to send · Shift+Enter for new line</p>
        </div>
      </div>

      {/* ── Settings Modal ── */}
      {showSettings && (
        <SettingsModal
          config={config}
          onClose={() => setShowSettings(false)}
          onSave={handleSaveConfig}
        />
      )}
    </>
  );
}

/* ── Sub-components ─────────────────────────────────────────── */
function UserMessage({ text }: { text: string }) {
  return (
    <div className="message-row">
      <div className="msg-avatar user">Y</div>
      <div className="msg-body">
        <div className="msg-label">You</div>
        <div className="msg-text">{text}</div>
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
