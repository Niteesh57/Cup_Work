import { useState, useEffect, useRef, useCallback } from 'react';
import { AgentStatus, AgentStep, AppConfig, ExecutionResponse, ExecutorState } from '../shared/types';
import { VoiceEngine } from './voiceEngine';
import { Loader2, Mic, MicOff, X, Pause, Play, Square, Presentation, Coffee, ListTodo } from 'lucide-react';
import { CommentaryBanner } from './components/CommentaryBanner';
import { MarkdownView } from './components/MarkdownView';
import { ToolCallTimeline } from './components/ToolCallTimeline';
import { CoffeeCup } from './components/CoffeeCup';
import { SettingsPage } from './components/SettingsModal';
import { DeviceRegistrationScreen } from './components/DeviceRegistrationScreen';
import { TodoListModal, TodoTask, TodoCounts } from './components/TodoListModal';
import { MovingColorsAvatar } from './components/MovingColorsAvatar';

import appIcon from './assets/icon.png';



import { GeminiAudioStreamPlayer, AudioStreamEvent } from './audio/geminiAudioPlayer';

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

/* ── Speak text via streaming Gemini TTS (main process & backend) ─────── */
async function speak(text: string, voice = 'Kore', taskId = ''): Promise<void> {
  if (!text || !text.trim()) return;
  console.log('[GeminiTTS] Requesting stream:', text.slice(0, 80) + '…');
  try {
    await ipc()?.invoke('voice:speak', { text, voice, taskId });
  } catch (err) {
    console.error('[App] Gemini TTS request failed:', err);
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
  whiteboardData?: Record<string, unknown>;
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
  const [backendUrl, setBackendUrl] = useState<string>('http://127.0.0.1:8765');
  const [defaultBackendUrl, setDefaultBackendUrl] = useState<string>('http://127.0.0.1:8765');
  const [currentVoice, setCurrentVoice] = useState<string>('Kore');
  const [todoCounts, setTodoCounts] = useState<TodoCounts>({ total: 0, pending: 0, done: 0 });
  const [todoTasks, setTodoTasks] = useState<TodoTask[]>([]);
  const [showTodoModal, setShowTodoModal] = useState(false);
  const [config, setConfig] = useState<AppConfig>({
    geminiModel: '',
    backendConnected: false,
  });

  const [showSettings, setShowSettings] = useState(false);
  const [isDeviceRegistered, setIsDeviceRegistered] = useState<boolean | null>(null);
  const [suggestedUserName, setSuggestedUserName] = useState<string>('');
  const [userIdentity, setUserIdentity] = useState<{
    userId: string;
    userName: string;
    deviceId: string;
    deviceName: string;
  }>({
    userId: '',
    userName: 'User',
    deviceId: '',
    deviceName: 'Desktop',
  });
  const chatEndRef = useRef<HTMLDivElement>(null);

  /* ── Load Today's Daily Chat Session from SQLite ─────────────────── */
  const loadTodaySession = useCallback(async (userId?: string, deviceId?: string) => {
    try {
      const targetUserId = userId || userIdentity.userId || 'usr_local';
      const targetDeviceId = deviceId || userIdentity.deviceId || 'desktop-main';
      const res = (await ipc()?.invoke('session:get-today', {
        userId: targetUserId,
        deviceId: targetDeviceId,
      })) as { success: boolean; messages: ChatMessage[]; date?: string } | undefined;

      if (res && res.success && Array.isArray(res.messages) && res.messages.length > 0) {
        console.log(`[App] Loaded ${res.messages.length} messages from today's session (${res.date})`);
        setMessages(res.messages);
      }
    } catch (err) {
      console.error('[App] Failed to load today session:', err);
    }
  }, [userIdentity.userId, userIdentity.deviceId]);

  /* ── Multi-User Identity Fetch & Update ─────────────────────────── */
  const fetchUserProfile = useCallback(async () => {
    try {
      const res = (await ipc()?.invoke('user:get-profile')) as {
        success: boolean;
        userId: string;
        userName: string;
        deviceId: string;
        deviceName: string;
      } | undefined;
      if (res && res.success) {
        setUserIdentity({
          userId: res.userId,
          userName: res.userName,
          deviceId: res.deviceId,
          deviceName: res.deviceName,
        });
        loadTodaySession(res.userId, res.deviceId);
      }
    } catch (err) {
      console.error('[App] Failed to fetch user profile:', err);
    }
  }, [loadTodaySession]);

  const checkDeviceRegistration = useCallback(async () => {
    try {
      const res = (await ipc()?.invoke('device:check-status')) as {
        success: boolean;
        registered: boolean;
        deviceId: string;
        deviceName: string;
        userId?: string;
        userName?: string;
        suggestedUserName?: string;
      } | undefined;

      if (res && res.success) {
        setUserIdentity(prev => ({
          userId: res.userId || prev.userId,
          userName: res.userName || res.suggestedUserName || prev.userName,
          deviceId: res.deviceId || prev.deviceId,
          deviceName: res.deviceName || prev.deviceName,
        }));
        setSuggestedUserName(res.suggestedUserName || '');
        setIsDeviceRegistered(res.registered);
        loadTodaySession(res.userId, res.deviceId);
        if (res.registered) {
          fetchUserProfile();
        }
      } else {
        setIsDeviceRegistered(true);
        fetchUserProfile();
        loadTodaySession();
      }
    } catch (err) {
      console.error('[App] Failed to check device status:', err);
      setIsDeviceRegistered(true);
      loadTodaySession();
    }
  }, [fetchUserProfile, loadTodaySession]);


  const handleRegisterDevice = useCallback(async (customName: string): Promise<boolean> => {
    try {
      const res = (await ipc()?.invoke('device:register', customName)) as {
        success: boolean;
        userId: string;
        userName: string;
        deviceId: string;
        deviceName: string;
      } | undefined;

      if (res && res.success) {
        setUserIdentity({
          userId: res.userId,
          userName: res.userName,
          deviceId: res.deviceId,
          deviceName: res.deviceName,
        });
        setIsDeviceRegistered(true);
        return true;
      }
      return false;
    } catch (err) {
      console.error('[App] Device registration failed:', err);
      return false;
    }
  }, []);

  const handleUpdateUserName = useCallback(async (newName: string): Promise<boolean> => {
    if (!userIdentity.userId) return false;
    try {
      const res = (await ipc()?.invoke('user:update-name', {
        userId: userIdentity.userId,
        name: newName,
      })) as { success: boolean } | undefined;
      if (res && res.success) {
        setUserIdentity(prev => ({ ...prev, userName: newName }));
        return true;
      }
      return false;
    } catch (err) {
      console.error('[App] Failed to update user name:', err);
      return false;
    }
  }, [userIdentity.userId]);

  const handleUpdateVoice = useCallback(async (newVoice: string): Promise<boolean> => {
    try {
      setCurrentVoice(newVoice);
      await ipc()?.invoke('config:save', { geminiVoice: newVoice });
      return true;
    } catch (err) {
      console.error('[App] Failed to save voice:', err);
      return false;
    }
  }, []);

  const handlePreviewVoice = useCallback((voice: string) => {
    void speak(`Hello! This is the ${voice} voice talent for Cup Work.`, voice);
  }, []);

  const handleStartNewCup = useCallback(async () => {
    try {
      const targetUserId = userIdentity.userId || 'usr_local';
      const targetDeviceId = userIdentity.deviceId || 'desktop-main';
      await ipc()?.invoke('session:start-new-cup', {
        userId: targetUserId,
        deviceId: targetDeviceId,
      });
      setMessages([]);
      setStatus('idle');
      setExecutorState('idle');
      console.log('[App] Started a fresh cup of coffee! Today’s session cleared.');
    } catch (err) {
      console.error('[App] Failed to start new cup:', err);
    }
  }, [userIdentity.userId, userIdentity.deviceId]);

  /* ── Today's Tasks & Todos Fetching ─────────────────────────────── */
  const fetchTodayTodos = useCallback(async (userId?: string, deviceId?: string) => {
    try {
      const targetUserId = userId || userIdentity.userId || 'usr_local';
      const targetDeviceId = deviceId || userIdentity.deviceId || 'desktop-main';
      const res = (await ipc()?.invoke('todos:get-today', {
        userId: targetUserId,
        deviceId: targetDeviceId,
      })) as { success: boolean; counts: TodoCounts; tasks: TodoTask[] } | undefined;

      if (res && res.success) {
        setTodoCounts(res.counts || { total: 0, pending: 0, done: 0 });
        setTodoTasks(res.tasks || []);
      }
    } catch (err) {
      console.error('[App] Failed to fetch today todos:', err);
    }
  }, [userIdentity.userId, userIdentity.deviceId]);

  const handleToggleTodo = useCallback(async (taskId: string, currentStatus: string) => {
    try {
      const targetStatus = currentStatus === 'completed' ? 'pending' : 'completed';
      setTodoTasks(prev => prev.map(t => (t.id === taskId ? { ...t, status: targetStatus } : t)));
      setTodoCounts(prev => {
        const isNowDone = targetStatus === 'completed';
        return {
          total: prev.total,
          pending: Math.max(0, prev.pending + (isNowDone ? -1 : 1)),
          done: Math.max(0, prev.done + (isNowDone ? 1 : -1)),
        };
      });
      await ipc()?.invoke('todos:toggle', {
        taskId,
        userId: userIdentity.userId || 'usr_local',
        status: targetStatus,
      });
    } catch (err) {
      console.error('[App] Failed to toggle todo:', err);
      fetchTodayTodos();
    }
  }, [userIdentity.userId, fetchTodayTodos]);

  const handleAddTodo = useCallback(async (title: string, priority: string) => {
    try {
      await ipc()?.invoke('todos:create', {
        title,
        priority,
        userId: userIdentity.userId || 'usr_local',
      });
      fetchTodayTodos();
    } catch (err) {
      console.error('[App] Failed to create todo:', err);
    }
  }, [userIdentity.userId, fetchTodayTodos]);

  const handleClearTodos = useCallback(async () => {
    try {
      setTodoTasks([]);
      setTodoCounts({ total: 0, pending: 0, done: 0 });
      await ipc()?.invoke('todos:clear-today', {
        userId: userIdentity.userId || 'usr_local',
        deviceId: userIdentity.deviceId || 'desktop-main',
      });
      fetchTodayTodos();
    } catch (err) {
      console.error('[App] Failed to clear todos:', err);
    }
  }, [userIdentity.userId, userIdentity.deviceId, fetchTodayTodos]);

  const fetchConfig = useCallback(async () => {
    try {
      const res = (await ipc()?.invoke('config:get')) as (AppConfig & { geminiVoice?: string; backendUrl?: string }) | undefined;
      if (res) {
        setConfig(res);
        setBackendConnected(Boolean(res.backendConnected));
        if (res.geminiVoice) setCurrentVoice(res.geminiVoice);
        if (res.backendUrl) setBackendUrl(res.backendUrl);
      }
    } catch (err) {
      console.error('[App] Failed to fetch config:', err);
    }
  }, []);

  const fetchBackendUrlInfo = useCallback(async () => {
    try {
      const res = (await ipc()?.invoke('config:get-backend-url')) as {
        backendUrl: string;
        defaultUrl: string;
        connected: boolean;
      } | undefined;
      if (res) {
        if (res.backendUrl) setBackendUrl(res.backendUrl);
        if (res.defaultUrl) setDefaultBackendUrl(res.defaultUrl);
        setBackendConnected(Boolean(res.connected));
      }
    } catch (err) {
      console.error('[App] Failed to fetch backend URL info:', err);
    }
  }, []);

  useEffect(() => {
    checkDeviceRegistration();
    fetchConfig();
    fetchBackendUrlInfo();
    fetchTodayTodos();

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        void ipc()?.invoke('agent:close-whiteboard');
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [checkDeviceRegistration, fetchConfig, fetchBackendUrlInfo, fetchTodayTodos]);


  /* ── Voice: ambient auto-listening (active ONLY when connected) ── */
  const [recording, setRecording] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<string>('');
  const engineRef = useRef<VoiceEngine | null>(null);
  const audioPlayerRef = useRef<GeminiAudioStreamPlayer | null>(null);
  const lastUtteranceRef = useRef<{ wavBase64: string; mimeType: string } | null>(null);
  const voiceActiveRef = useRef(false);
  voiceActiveRef.current = recording;
  const isUserMutedRef = useRef(false);
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

  /* Helper to auto-resume listening when allowed (not muted by user, not executing) */
  const resumeListeningIfAllowed = useCallback(async () => {
    if (isUserMutedRef.current) return;
    if (!backendConnected) return;
    if (inFlightRef.current || (isTaskRunningRef.current && executorStateRef.current !== 'paused')) return;

    const engine = engineRef.current;
    if (!engine) return;
    try {
      voiceActiveRef.current = true;
      engine.setMuted(false);
      await engine.start();
      engine.activate();
      setRecording(true);
      setVoiceStatus('Listening for voice…');
      showBorderGlow(false, '');
    } catch (err) {
      console.error('[App] Auto-resume voice listening failed:', err);
    }
  }, [backendConnected, showBorderGlow]);

  /* ── Initialize Gemini TTS Streaming Web Audio Player ──────────── */
  useEffect(() => {
    const player = new GeminiAudioStreamPlayer((playing) => {
      setIsSpeaking(playing);
      if (playing) {
        engineRef.current?.setMuted(true);
        engineRef.current?.deactivate();
        setRecording(false);
        showBorderGlow(true, '🔊 Cup Work is speaking…', 'speaking');
      } else {
        engineRef.current?.setMuted(false);
        showBorderGlow(false, '');
        // Automatically reactivate microphone listening after agent finishes speaking
        setTimeout(() => {
          if (!isUserMutedRef.current && !inFlightRef.current && backendConnected) {
            resumeListeningIfAllowed();
          }
        }, 350);
      }
    });
    audioPlayerRef.current = player;

    return () => {
      player.stop();
    };
  }, [backendConnected, resumeListeningIfAllowed, showBorderGlow]);

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
      engine.stop().catch(() => { });
    };
  }, [showBorderGlow]);

  /* Start / Resume listening (user action) */
  const startRecording = useCallback(async () => {
    isUserMutedRef.current = false;
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
      engine.setMuted(false);
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

  /* Pause / Mute voice listening (user action) */
  const cancelRecording = useCallback(() => {
    isUserMutedRef.current = true;
    voiceActiveRef.current = false;
    const engine = engineRef.current;
    engine?.deactivate();
    engine?.setMuted(true);
    setRecording(false);
    setVoiceStatus('Mic muted — tap to activate');
    lastUtteranceRef.current = null;
    showBorderGlow(false, '');
  }, [showBorderGlow]);

  /* Backend URL Handlers */
  const handleUpdateBackendUrl = useCallback(async (newUrl: string): Promise<{ success: boolean; connected?: boolean; error?: string }> => {
    try {
      const res = (await ipc()?.invoke('config:set-backend-url', { backendUrl: newUrl })) as {
        success: boolean;
        connected: boolean;
        backendUrl: string;
        error?: string;
      } | undefined;
      if (res && res.success) {
        setBackendUrl(res.backendUrl);
        setBackendConnected(Boolean(res.connected));
        if (res.connected) {
          checkDeviceRegistration();
          fetchConfig();
          fetchTodayTodos();
        }
        return { success: true, connected: res.connected, error: res.error };
      }
      return { success: false, error: res?.error || 'Failed to update backend URL' };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }, [checkDeviceRegistration, fetchConfig, fetchTodayTodos]);

  const handleTestBackendUrl = useCallback(async (testUrl: string): Promise<{ success: boolean; message: string }> => {
    try {
      const res = (await ipc()?.invoke('config:test-backend-url', testUrl)) as {
        success: boolean;
        message: string;
      } | undefined;
      if (res) return res;
      return { success: false, message: 'No response from test connection' };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : 'Test connection error' };
    }
  }, []);

  /* Load config and setup listeners on mount */
  useEffect(() => {
    const renderer = ipc();
    if (!renderer) return;

    renderer.invoke('config:get').then((res) => {
      if (res) {
        const c = res as AppConfig & { backendUrl?: string };
        setConfig(c);
        setBackendConnected(!!c.backendConnected);
        if (c.backendUrl) setBackendUrl(c.backendUrl);
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
        checkDeviceRegistration();
        fetchBackendUrlInfo();
        renderer.invoke('config:get').then((res) => {
          if (res) setConfig(res as AppConfig);
        }).catch(console.error);
        // Auto-start listening on connection if not explicitly muted
        setTimeout(() => {
          if (!isUserMutedRef.current) {
            resumeListeningIfAllowed();
          }
        }, 600);
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

    const onTtsStreamStart = (_: unknown, data: unknown) => {
      const st = data as { streamId?: string };
      if (st?.streamId) {
        audioPlayerRef.current?.handleStreamStart(st.streamId);
      }
    };

    const onTtsStreamChunk = (_: unknown, data: unknown) => {
      const ch = data as AudioStreamEvent;
      if (ch) {
        audioPlayerRef.current?.handleStreamChunk(ch);
      }
    };

    const onTtsStreamEnd = (_: unknown, data: unknown) => {
      const st = data as { streamId?: string };
      audioPlayerRef.current?.handleStreamEnd(st?.streamId);
    };

    const onTtsStop = () => {
      audioPlayerRef.current?.stop();
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

    const onTodosUpdated = (_: unknown, data: unknown) => {
      const d = data as { counts?: TodoCounts; tasks?: TodoTask[] };
      console.log('[App] Received real-time TODO_UPDATED:', d);
      if (d?.counts) setTodoCounts(d.counts);
      if (Array.isArray(d?.tasks)) setTodoTasks(d.tasks);
    };

    renderer.on('agent:step-update', onStep);
    renderer.on('backend:status', onBackendStatus);
    renderer.on('agent:state-change', onStateChange);
    renderer.on('agent:commentary', onCommentary);
    renderer.on('agent:live-action', onLiveAction);
    renderer.on('agent:tts-stream-start', onTtsStreamStart);
    renderer.on('agent:tts-stream-chunk', onTtsStreamChunk);
    renderer.on('agent:tts-stream-end', onTtsStreamEnd);
    renderer.on('agent:tts-stop', onTtsStop);
    renderer.on('agent:hitl-question', onHitlQuestion);
    renderer.on('agent:todos-updated', onTodosUpdated);

    return () => {
      renderer.removeAllListeners('agent:step-update');
      renderer.removeAllListeners('backend:status');
      renderer.removeAllListeners('agent:state-change');
      renderer.removeAllListeners('agent:commentary');
      renderer.removeAllListeners('agent:live-action');
      renderer.removeAllListeners('agent:tts-stream-start');
      renderer.removeAllListeners('agent:tts-stream-chunk');
      renderer.removeAllListeners('agent:tts-stream-end');
      renderer.removeAllListeners('agent:tts-stop');
      renderer.removeAllListeners('agent:hitl-question');
      renderer.removeAllListeners('agent:todos-updated');
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
      audioPlayerRef.current?.stop();
      await ipc()?.invoke('task:cancel', taskId);
      await ipc()?.invoke('voice:stop-speaking', taskId);
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
    // After calling API to cancel the request, voice can immediately activate if allowed
    setTimeout(() => {
      resumeListeningIfAllowed();
    }, 300);
  }, [resumeListeningIfAllowed, showBorderGlow]);

  const handleSelectHitlOption = useCallback(async (hitlId: string, taskId: string, option: string) => {
    try {
      await ipc()?.invoke('agent:human-response', { id: hitlId, taskId, answer: option });
      setMessages(prev =>
        prev.map(m =>
          m.hitl?.id === hitlId
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
      void ipc()?.invoke('session:save-message', {
        id: `hitl-${hitlId}`,
        role: 'agent',
        status: 'done',
        text: `Answered: ${option}`,
        hitl: { id: hitlId, taskId, question: '', options: [], selectedAnswer: option },
        userId: userIdentity.userId || 'usr_local',
        deviceId: userIdentity.deviceId || 'desktop-main',
      });
    } catch (err) {
      console.error('[App] Failed to send HITL option response:', err);
    }
  }, [userIdentity.userId, userIdentity.deviceId]);

  const sendPrompt = useCallback(async (input: string | ExecuteOptions) => {
    const opts: ExecuteOptions = typeof input === 'string' ? { prompt: input } : input;
    const trimmed = opts.prompt?.trim() || '';
    if (!trimmed && !opts.audioBase64) return;

    // Strict single-request concurrency lock
    if (inFlightRef.current || (isTaskRunning && executorState !== 'paused')) {
      console.warn('[App] Blocked overlapping request: agent is currently busy.');
      return;
    }
    inFlightRef.current = true;

    // Completely block and mute microphone during execution
    engineRef.current?.setMuted(true);
    engineRef.current?.deactivate();
    setRecording(false);


    console.log('[App] sendPrompt started:', opts.isVoice ? '[Spoken Audio]' : trimmed);

    const startTime = Date.now();
    const userMsgId = `u-${Date.now()}`;
    const agentMsgId = `a-${Date.now()}`;
    const currentTaskId = `task-${Date.now()}`;

    setActiveTaskId(currentTaskId);
    const userMsg: ChatMessage = { id: userMsgId, role: 'user', text: trimmed || '🎤 Spoken Voice Input', isVoice: opts.isVoice };
    setMessages(prev => [
      ...prev,
      userMsg,
      { id: agentMsgId, role: 'agent', status: 'thinking', steps: [] },
    ]);

    // Persist user prompt in SQLite daily session
    void ipc()?.invoke('session:save-message', {
      ...userMsg,
      userId: userIdentity.userId || 'usr_local',
      deviceId: userIdentity.deviceId || 'desktop-main',
    });

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
        userId: userIdentity.userId || undefined,
        deviceId: userIdentity.deviceId || undefined,
        deviceName: userIdentity.deviceName || undefined,
        model: config.geminiModel,
      }) as ExecutionResponse;

      if (response.userId && response.userName) {
        setUserIdentity(prev => ({
          userId: response.userId || prev.userId,
          userName: response.userName || prev.userName,
          deviceId: response.deviceId || prev.deviceId,
          deviceName: response.deviceName || prev.deviceName,
        }));
      }

      console.log('[App] agent:execute-prompt result:', response);

      const isWbAction = (name?: string) => Boolean(name && (
        name.includes('whiteboard') || name.includes('mermaid')
      ));

      const whiteboardStep = response.steps?.find(s => isWbAction(s.actionName));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const extractedWhiteboardData = (response as any).whiteboardData ||
        (whiteboardStep?.parameters as Record<string, unknown>) ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((whiteboardStep as any)?.args as Record<string, unknown>) ||
        undefined;

      const hadWhiteboardTool = Boolean(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (response as any).hadWhiteboard || whiteboardStep || extractedWhiteboardData
      );

      let spokeVoiceOutput = false;
      if (response.success && response.message && !hadWhiteboardTool) {
        spokeVoiceOutput = true;
        await speak(response.message, currentVoice, currentTaskId);
      }


      const durationMs = Date.now() - startTime;
      const stepsCount = response.steps?.length || 0;
      const promptTokens = Math.round((trimmed.length || 20) * 1.3 + stepsCount * 380 + 320);
      const completionTokens = Math.round((response.message?.length || 50) * 0.75 + stepsCount * 120);

      const finalAgentMsg: ChatMessage = {
        id: agentMsgId,
        role: 'agent',
        text: response.message,
        status: response.success ? 'done' : 'error',
        steps: response.steps && response.steps.length > 0 ? response.steps : [],
        spokeVoice: spokeVoiceOutput,
        hadWhiteboard: hadWhiteboardTool,
        whiteboardData: extractedWhiteboardData,
        durationMs,
        outputTokens: {
          prompt: promptTokens,
          completion: completionTokens,
          total: promptTokens + completionTokens,
        },
      };


      setMessages(prev => prev.map(m => m.id === agentMsgId ? finalAgentMsg : m));
      setStatus(response.success ? 'completed' : 'error');

      // Persist completed agent message in SQLite daily session
      void ipc()?.invoke('session:save-message', {
        ...finalAgentMsg,
        userId: userIdentity.userId || 'usr_local',
        deviceId: userIdentity.deviceId || 'desktop-main',
      });


    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[App] execute-prompt failed:', msg);
      const durationMs = Date.now() - startTime;
      const errorAgentMsg: ChatMessage = {
        id: agentMsgId,
        role: 'agent',
        text: `Error: ${msg}`,
        status: 'error',
        durationMs,
      };
      setMessages(prev => prev.map(m => m.id === agentMsgId ? errorAgentMsg : m));
      setStatus('error');

      void ipc()?.invoke('session:save-message', {
        ...errorAgentMsg,
        userId: userIdentity.userId || 'usr_local',
        deviceId: userIdentity.deviceId || 'desktop-main',
      });
    } finally {
      inFlightRef.current = false;
      setStatus('idle');
      setExecutorState('idle');

      // Auto-resume microphone listening after prompt/task finishes if not muted by user and not speaking
      setTimeout(() => {
        if (!audioPlayerRef.current?.isPlaying() && !isSpeaking && !isUserMutedRef.current) {
          resumeListeningIfAllowed();
        }
      }, 450);
    }
  }, [config.geminiModel, isSpeaking, resumeListeningIfAllowed, showBorderGlow, userIdentity]);

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

      {backendConnected && isDeviceRegistered === false ? (
        <DeviceRegistrationScreen
          deviceId={userIdentity.deviceId}
          deviceName={userIdentity.deviceName}
          suggestedUserName={suggestedUserName || userIdentity.userName}
          onRegister={handleRegisterDevice}
        />
      ) : showSettings ? (
        <SettingsPage
          onBack={() => setShowSettings(false)}
          userName={userIdentity.userName}
          currentVoice={currentVoice}
          backendUrl={backendUrl}
          defaultBackendUrl={defaultBackendUrl}
          backendConnected={backendConnected}
          onUpdateUserName={handleUpdateUserName}
          onUpdateVoice={handleUpdateVoice}
          onUpdateBackendUrl={handleUpdateBackendUrl}
          onTestBackendUrl={handleTestBackendUrl}
          onPreviewVoice={handlePreviewVoice}
        />
      ) : (
        <div className="app">
          {/* ── Top Bar ── */}
          <header className="topbar">

            <div className="topbar-left flex items-center gap-2">
              <img
                src={appIcon}
                alt="Cup Work"
                className="w-6 h-6 object-contain rounded-md shadow-2xs"
              />
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
                  className="tooltip tooltip-bottom"
                  data-tip={
                    todoCounts.total > 0
                      ? `Today's Tasks: ${todoCounts.pending} remaining, ${todoCounts.done} completed (Click to view)`
                      : "Today's Tasks & Todo List (Click to open)"
                  }
                >
                  <button
                    className={`btn btn-sm gap-1.5 rounded-xl border text-xs font-semibold shadow-2xs transition-all ${todoCounts.total > 0
                        ? todoCounts.pending > 0
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-300 hover:bg-amber-500/20'
                          : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-300 hover:bg-emerald-500/20'
                        : 'btn-ghost border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      }`}
                    onClick={() => {
                      fetchTodayTodos();
                      setShowTodoModal(true);
                    }}
                    aria-label="Today's Tasks"
                  >
                    <ListTodo
                      size={14}
                      className={
                        todoCounts.total > 0
                          ? todoCounts.pending > 0
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                          : 'text-zinc-600 dark:text-zinc-400'
                      }
                    />
                    <span>
                      {todoCounts.total > 0 ? (
                        todoCounts.pending > 0 ? (
                          <>
                            <span className="font-bold">{todoCounts.pending}</span> left
                            {todoCounts.done > 0 && (
                              <span className="opacity-60 text-[10px] font-normal"> · {todoCounts.done} done</span>
                            )}
                          </>
                        ) : (
                          <span className="font-bold">{todoCounts.total} done 🎉</span>
                        )
                      ) : (
                        <span>Tasks</span>
                      )}
                    </span>
                  </button>
                </div>
              )}

              {backendConnected && (
                <div
                  className="tooltip tooltip-bottom"
                  data-tip="Start New Cup of Coffee (Clears today's chat, todos & short-term memory)"
                >
                  <button
                    className="btn btn-sm btn-ghost gap-1.5 rounded-xl text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:text-white dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-xs font-semibold shadow-2xs transition-all"
                    onClick={handleStartNewCup}
                    disabled={isTaskRunning || inFlightRef.current}
                    aria-label="Start New Cup of Coffee"
                  >
                    <Coffee size={14} className="text-zinc-600 dark:text-zinc-300" />
                    <span className="hidden sm:inline">New Cup</span>
                  </button>
                </div>
              )}


              {backendConnected && (
                <div
                  className="tooltip tooltip-bottom"
                  data-tip={`Profile & Settings (${userIdentity.userName || 'User'})`}
                >
                  <button
                    className="btn btn-sm btn-ghost gap-2 rounded-xl text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:text-white dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-xs font-semibold shadow-2xs transition-all px-2.5"
                    onClick={() => setShowSettings(true)}
                    aria-label="Settings and Profile"
                  >
                    <MovingColorsAvatar name={userIdentity.userName || 'You'} size="xs" showGlow={false} />
                    <span className="hidden sm:inline font-bold">{userIdentity.userName || 'Profile'}</span>
                  </button>
                </div>
              )}


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
                    className={`btn btn-circle btn-sm transition-all ${(isTaskRunning && executorState !== 'paused') || inFlightRef.current
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
              <>
                <div className="flex items-center justify-between px-3 py-1.5 mb-3 bg-base-200/50 backdrop-blur rounded-xl border border-base-300/40 text-[11px] font-medium text-slate-500 shadow-2xs">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm" />
                    <span className="font-semibold text-slate-700 dark:text-slate-200">Today's Session</span>
                  </span>
                  <div className="flex items-center gap-2">
                    {todoCounts.total > 0 && (
                      <button
                        onClick={() => {
                          fetchTodayTodos();
                          setShowTodoModal(true);
                        }}
                        className="btn btn-xs btn-ghost gap-1 text-[10px] font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/60 rounded-md px-2 py-0 border border-zinc-300/60 dark:border-zinc-700 shadow-2xs"
                      >
                        <ListTodo size={11} className={todoCounts.pending > 0 ? 'text-amber-600' : 'text-emerald-600'} />
                        <span>{todoCounts.pending} left · {todoCounts.done} done</span>
                      </button>
                    )}
                    <span className="font-mono text-[10px] text-slate-400">
                      {new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                </div>
                {messages.map(msg =>
                  msg.role === 'user'
                    ? <UserMessage key={msg.id} text={msg.text || ''} isVoice={msg.isVoice} userName={userIdentity.userName} />
                    : <AgentMessage
                      key={msg.id}
                      msg={msg}
                      isPaused={executorState === 'paused'}
                      onSelectHitlOption={handleSelectHitlOption}
                    />
                )}
              </>
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
      )}

      {/* Today's Todo List & Tasks Modal */}
      <TodoListModal
        isOpen={showTodoModal}
        onClose={() => setShowTodoModal(false)}
        tasks={todoTasks}
        counts={todoCounts}
        onToggleTask={handleToggleTodo}
        onAddTask={handleAddTodo}
        onClearAll={handleClearTodos}
        onRefresh={fetchTodayTodos}
      />
    </>
  );
}

/* ── Sub-components ─────────────────────────────────────────── */
function UserMessage({ text, isVoice, userName }: { text?: string; isVoice?: boolean; userName?: string }) {
  return (
    <div className="message-row">
      <div className="msg-avatar user overflow-hidden p-0 border-0">
        <MovingColorsAvatar name={userName || 'You'} size="sm" showGlow={false} />
      </div>
      <div className="msg-body">
        <div className="msg-label">{userName || 'You'}</div>
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
  const isError = msg.status === 'error';
  const isWaitingInput = !!msg.hitl && !msg.hitl.selectedAnswer;
  const [customInput, setCustomInput] = useState('');


  return (
    <div className="message-row">
      <div className="msg-avatar agent flex items-center justify-center overflow-hidden">
        {isThinking
          ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
          : <img src={appIcon} alt="Cup Work" className="w-3.5 h-3.5 object-contain" />
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
                      className={`btn btn-sm justify-start text-left normal-case transition-all duration-150 h-auto py-2.5 px-3 rounded-xl border ${isSelected
                          ? 'bg-slate-900 hover:bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-primary ring-offset-1 scale-[1.01]'
                          : isAnswered
                            ? 'bg-slate-100 border-slate-300 text-black cursor-not-allowed opacity-90'
                            : 'bg-white hover:bg-slate-50 border-slate-300 hover:border-slate-500 text-black shadow-xs hover:scale-[1.01] active:scale-[0.99]'
                        }`}
                    >
                      <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[11px] font-extrabold mr-2 shrink-0 ${isSelected ? 'bg-white text-slate-900' : 'bg-slate-200 text-black'
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

        {/* ── Interactive View Whiteboard Diagram Button ── */}
        {(msg.hadWhiteboard || msg.whiteboardData || msg.steps?.some(s => s.actionName?.includes('whiteboard') || s.actionName?.includes('mermaid'))) && (
          <div className="mt-3 pt-2.5 border-t border-base-200/80 flex items-center justify-between gap-2">
            <button
              onClick={() => {
                const isWb = (name?: string) => Boolean(name && (name.includes('whiteboard') || name.includes('mermaid')));
                const wbSteps = msg.steps?.filter(s => isWb(s.actionName)) || [];
                let payload = msg.whiteboardData;
                if (!payload && wbSteps.length > 1) {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const firstParam = (wbSteps[0]?.parameters as any) || (wbSteps[0] as any)?.args || {};
                  payload = {
                    conceptTitle: firstParam.conceptTitle || 'Whiteboard Lecture',
                    steps: wbSteps.map((s, idx) => {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const p = (s.parameters as Record<string, unknown>) || ((s as any)?.args as Record<string, unknown>) || {};
                      return {
                        stepNumber: p.stepNumber ?? (idx + 1),
                        totalSteps: wbSteps.length,
                        stepLabel: p.stepLabel ?? `Stage ${idx + 1}`,
                        notes: p.notes ?? p.bullet_points ?? p.bullets ?? [],
                        elements: p.elements ?? p.nodes ?? [],
                        connections: p.connections ?? p.links ?? [],
                        narration: p.narration ?? '',
                      };
                    }),
                  };
                } else if (!payload && wbSteps.length === 1) {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  payload = (wbSteps[0]?.parameters as Record<string, unknown>) || ((wbSteps[0] as any)?.args as Record<string, unknown>);
                }
                if (!payload) {
                  payload = { conceptTitle: 'Whiteboard Diagram' };
                }
                void ipc()?.invoke('agent:show-saved-whiteboard', payload);
              }}
              className="btn btn-sm btn-primary rounded-xl gap-2 font-bold shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all normal-case text-white"
              title="Open full interactive whiteboard diagram on screen"
            >
              <Presentation size={15} />
              <span>View Whiteboard Diagram</span>
              <span className="badge badge-xs bg-white/20 text-white font-mono text-[9px] border-0">ESC to close</span>
            </button>
            <span className="text-[11px] text-slate-400 font-medium">
              Saved in Daily Session
            </span>
          </div>
        )}



      </div>
    </div>
  );
}

