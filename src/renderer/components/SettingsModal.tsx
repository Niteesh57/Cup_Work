import React, { useState, useEffect } from 'react';
import { User, Check, ArrowLeft, Loader2, Sparkles, Volume2, Play, Server, RefreshCw, Radio } from 'lucide-react';
import { MovingColorsAvatar } from './MovingColorsAvatar';
import appIcon from '../assets/icon.png';

export const AVAILABLE_VOICES = [
  { id: 'Kore', label: 'Kore', desc: 'Firm, Confident & Direct (Default)' },
  { id: 'Puck', label: 'Puck', desc: 'Upbeat, Energetic & Dynamic' },
  { id: 'Zephyr', label: 'Zephyr', desc: 'Bright, Crisp & Clear' },
  { id: 'Fenrir', label: 'Fenrir', desc: 'Excitable & High-Energy' },
  { id: 'Aoede', label: 'Aoede', desc: 'Warm, Breezy & Natural' },
  { id: 'Sulafat', label: 'Sulafat', desc: 'Warm & Inviting' },
  { id: 'Charon', label: 'Charon', desc: 'Informative & Authoritative' },
  { id: 'Leda', label: 'Leda', desc: 'Youthful & Clear' },
  { id: 'Orus', label: 'Orus', desc: 'Steady & Grounded' },
];

export interface SettingsPageProps {
  onBack: () => void;
  userName: string;
  currentVoice?: string;
  backendUrl?: string;
  defaultBackendUrl?: string;
  backendConnected?: boolean;
  onUpdateUserName: (newName: string) => Promise<boolean>;
  onUpdateVoice?: (newVoice: string) => Promise<boolean>;
  onUpdateBackendUrl?: (newUrl: string) => Promise<{ success: boolean; connected?: boolean; error?: string }>;
  onTestBackendUrl?: (testUrl: string) => Promise<{ success: boolean; message: string }>;
  onPreviewVoice?: (voice: string) => void;
}

export function SettingsPage({
  onBack,
  userName,
  currentVoice = 'Kore',
  backendUrl = 'http://127.0.0.1:8765',
  defaultBackendUrl = 'http://127.0.0.1:8765',
  backendConnected = false,
  onUpdateUserName,
  onUpdateVoice,
  onUpdateBackendUrl,
  onTestBackendUrl,
  onPreviewVoice,
}: SettingsPageProps) {
  const [nameInput, setNameInput] = useState(userName);
  const [selectedVoice, setSelectedVoice] = useState(currentVoice);
  const [urlInput, setUrlInput] = useState(backendUrl);
  const [isTestingUrl, setIsTestingUrl] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    setNameInput(userName);
    setSelectedVoice(currentVoice);
    setUrlInput(backendUrl);
    setSaveSuccess(false);
    setErrorMessage('');
    setTestResult(null);
  }, [userName, currentVoice, backendUrl]);

  const handleTestConnection = async () => {
    const trimmed = urlInput.trim();
    if (!trimmed) {
      setTestResult({ success: false, message: 'Please enter a valid backend URL.' });
      return;
    }

    setIsTestingUrl(true);
    setTestResult(null);
    try {
      if (onTestBackendUrl) {
        const res = await onTestBackendUrl(trimmed);
        setTestResult(res);
      } else {
        const norm = trimmed.startsWith('http') ? trimmed : `http://${trimmed}`;
        const res = await fetch(`${norm.replace(/\/+$/, '')}/api/config`, { signal: AbortSignal.timeout(3500) });
        if (res.ok) {
          setTestResult({ success: true, message: 'Connected to Python backend successfully!' });
        } else {
          setTestResult({ success: false, message: `Server replied with HTTP ${res.status}` });
        }
      }
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Could not reach backend server at this URL.',
      });
    } finally {
      setIsTestingUrl(false);
    }
  };

  const handleResetUrlToDefault = () => {
    const def = defaultBackendUrl || 'http://127.0.0.1:8765';
    setUrlInput(def);
    setTestResult(null);
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmedName = nameInput.trim();
    const trimmedUrl = urlInput.trim();

    if (!trimmedName) {
      setErrorMessage('User name cannot be empty.');
      return;
    }
    if (!trimmedUrl) {
      setErrorMessage('Backend URL cannot be empty.');
      return;
    }

    setIsSaving(true);
    setErrorMessage('');
    try {
      let nameOk = true;
      if (trimmedName !== userName) {
        nameOk = await onUpdateUserName(trimmedName);
      }

      let voiceOk = true;
      if (selectedVoice !== currentVoice && onUpdateVoice) {
        voiceOk = await onUpdateVoice(selectedVoice);
      }

      let urlOk = true;
      if (trimmedUrl !== backendUrl && onUpdateBackendUrl) {
        const urlRes = await onUpdateBackendUrl(trimmedUrl);
        urlOk = Boolean(urlRes && urlRes.success);
        if (!urlOk && urlRes?.error) {
          setErrorMessage(urlRes.error);
        }
      }

      if (nameOk && voiceOk && urlOk) {
        setSaveSuccess(true);
        setTimeout(() => {
          setSaveSuccess(false);
        }, 1500);
      } else if (!errorMessage) {
        setErrorMessage('Failed to save settings. Please check server URL and connection.');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Error saving settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleVoiceChange = async (voiceId: string) => {
    setSelectedVoice(voiceId);
    if (onUpdateVoice) {
      await onUpdateVoice(voiceId);
    }
  };

  const isChanged =
    nameInput.trim() !== userName ||
    selectedVoice !== currentVoice ||
    urlInput.trim() !== backendUrl;

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-white text-zinc-900 animate-fadeIn">
      {/* Sticky Header with Back Navigation */}
      <div className="sticky top-0 z-20 px-6 py-3.5 bg-white/95 backdrop-blur-md border-b border-zinc-200 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="btn btn-sm btn-ghost gap-1.5 rounded-xl text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 border border-zinc-300 text-xs font-semibold transition-all shadow-2xs"
            aria-label="Back to Chat"
          >
            <ArrowLeft size={14} />
            <span>Back to Chat</span>
          </button>
          <div className="h-4 w-px bg-zinc-200" />
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-zinc-100 flex items-center justify-center shadow-2xs border border-zinc-200 overflow-hidden p-0.5">
              <img src={appIcon} alt="Cup Work" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-xs font-bold text-zinc-900 leading-tight">Settings &amp; Server Connection</h1>
              <p className="text-[10px] text-zinc-500 font-medium">Configure identity, agent voice, and Python backend URL</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {saveSuccess && (
            <span className="text-xs font-semibold text-zinc-800 flex items-center gap-1.5 animate-fadeIn">
              <Check size={14} /> Saved!
            </span>
          )}
          <button
            onClick={() => handleSave()}
            disabled={isSaving || !nameInput.trim() || !urlInput.trim() || !isChanged}
            className="btn btn-sm bg-zinc-900 hover:bg-black text-white text-xs font-semibold rounded-xl px-5 border-none shadow-sm gap-1.5 disabled:opacity-40"
          >
            {isSaving ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Sparkles size={13} />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Settings Page Content */}
      <div className="max-w-2xl w-full mx-auto p-6 space-y-5">
        <form onSubmit={handleSave} className="space-y-5">
          {/* User Profile Avatar Card with Animated Coffee Drinking Avatar */}
          <div className="bg-zinc-900 text-white rounded-3xl p-5 shadow-lg border border-zinc-800 flex items-center gap-4 relative overflow-hidden">
            <div className="relative z-10">
              <MovingColorsAvatar name={nameInput || userName} size="lg" showGlow={false} />
            </div>
            <div className="relative z-10 flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white truncate">
                  {nameInput.trim() || userName || 'User'}
                </h3>
                <span className="badge badge-xs bg-zinc-800 text-zinc-300 border border-zinc-700 text-[9px] font-semibold">
                  Active Profile
                </span>
              </div>
            </div>
          </div>

          {/* Backend Server Connection URL Section */}
          <div className="bg-white rounded-2xl p-5 border border-zinc-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                  <Server size={14} className="text-zinc-700" />
                  Python Backend Server URL
                </label>
                <p className="text-[11px] text-zinc-500 font-medium">
                  Connect to local or remote Python engine. Default from .env is <code className="font-mono text-zinc-700 font-semibold bg-zinc-100 px-1 py-0.5 rounded">{defaultBackendUrl}</code>
                </p>
              </div>

              {backendConnected ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  Offline
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={urlInput}
                  onChange={(e) => {
                    setUrlInput(e.target.value);
                    setErrorMessage('');
                    setTestResult(null);
                  }}
                  placeholder={defaultBackendUrl || 'http://127.0.0.1:8765'}
                  className="w-full px-3.5 py-2.5 bg-white hover:bg-zinc-50 focus:bg-white text-xs font-mono font-semibold text-zinc-900 border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all shadow-2xs"
                />
              </div>

              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTestingUrl || !urlInput.trim()}
                className="btn btn-sm bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border border-zinc-300 rounded-xl text-xs font-semibold gap-1.5 shadow-2xs"
                title="Test backend connection ping"
              >
                {isTestingUrl ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    Testing…
                  </>
                ) : (
                  <>
                    <Radio size={12} />
                    Test Ping
                  </>
                )}
              </button>

              {urlInput.trim() !== defaultBackendUrl && (
                <button
                  type="button"
                  onClick={handleResetUrlToDefault}
                  className="btn btn-sm btn-ghost text-zinc-600 hover:bg-zinc-100 border border-zinc-200 rounded-xl text-xs font-medium gap-1"
                  title="Reset to .env default URL"
                >
                  <RefreshCw size={12} />
                  Reset
                </button>
              )}
            </div>

            {testResult && (
              <div
                className={`p-2.5 rounded-xl border text-xs font-medium flex items-center gap-2 animate-fadeIn ${
                  testResult.success
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}
              >
                {testResult.success ? (
                  <Check size={14} className="text-emerald-600 shrink-0" />
                ) : (
                  <span className="text-rose-600 font-bold shrink-0">✕</span>
                )}
                <span>{testResult.message}</span>
              </div>
            )}
          </div>

          {/* Display Name Section */}
          <div className="bg-white rounded-2xl p-5 border border-zinc-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                <User size={14} className="text-zinc-700" />
                Your Display Name
              </label>
              <span className="text-[10px] font-medium text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-md border border-zinc-200">Editable</span>
            </div>
            <div className="relative">
              <input
                type="text"
                value={nameInput}
                onChange={(e) => {
                  setNameInput(e.target.value);
                  setErrorMessage('');
                }}
                maxLength={36}
                placeholder="Enter your name…"
                className="w-full px-3.5 py-2.5 bg-white hover:bg-zinc-50 focus:bg-white text-sm font-semibold text-zinc-900 border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all shadow-2xs"
              />
            </div>
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              This name is recognized by the AI agent across your memory, preferences, and todo tasks.
            </p>
          </div>

          {/* Voice Talent Section */}
          <div className="bg-white rounded-2xl p-5 border border-zinc-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                  <Volume2 size={14} className="text-zinc-700" />
                  Gemini Voice Talent
                </label>
                <p className="text-[11px] text-zinc-500 font-medium">Select your preferred voice for real-time streaming audio responses</p>
              </div>
              <span className="badge bg-zinc-100 text-zinc-800 border border-zinc-300 badge-xs text-[9px] font-semibold">
                Gemini TTS
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              {AVAILABLE_VOICES.map((v) => {
                const isSelected = selectedVoice === v.id;
                return (
                  <div
                    key={v.id}
                    onClick={() => handleVoiceChange(v.id)}
                    className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-zinc-50 border-zinc-900 shadow-2xs'
                        : 'bg-white border-zinc-200 hover:bg-zinc-50 text-zinc-800'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                        isSelected ? 'border-zinc-900 bg-zinc-900' : 'border-zinc-300 bg-white'
                      }`}>
                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-zinc-900">{v.label}</div>
                        <div className="text-[10px] text-zinc-500">{v.desc}</div>
                      </div>
                    </div>

                    {onPreviewVoice && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onPreviewVoice(v.id);
                        }}
                        className="btn btn-ghost btn-circle btn-xs text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100"
                        title={`Preview ${v.label}'s voice`}
                      >
                        <Play size={11} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {errorMessage && (
            <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-300 text-xs font-medium text-zinc-800 flex items-center gap-2">
              <span className="text-zinc-600 font-bold">!</span>
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Bottom Back Button */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={onBack}
              className="btn btn-sm btn-ghost text-xs text-zinc-700 hover:bg-zinc-100 font-semibold rounded-xl gap-1.5 border border-zinc-300"
            >
              <ArrowLeft size={13} />
              <span>Back to Chat</span>
            </button>

            <button
              type="submit"
              disabled={isSaving || !nameInput.trim() || !urlInput.trim() || !isChanged}
              className="btn btn-sm bg-zinc-900 hover:bg-black text-white text-xs font-semibold rounded-xl px-6 border-none shadow-sm gap-1.5 disabled:opacity-40"
            >
              {isSaving ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  Saving…
                </>
              ) : saveSuccess ? (
                <>
                  <Check size={13} />
                  Saved!
                </>
              ) : (
                <>
                  <Sparkles size={13} />
                  Save Settings
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Backward-compatibility alias
export { SettingsPage as SettingsModal };



