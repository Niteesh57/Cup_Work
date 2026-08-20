import React, { useState, useEffect } from 'react';
import { User, Check, ArrowLeft, Loader2, Sparkles, Volume2, Play } from 'lucide-react';
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
  onUpdateUserName: (newName: string) => Promise<boolean>;
  onUpdateVoice?: (newVoice: string) => Promise<boolean>;
  onPreviewVoice?: (voice: string) => void;
}

export function SettingsPage({
  onBack,
  userName,
  currentVoice = 'Kore',
  onUpdateUserName,
  onUpdateVoice,
  onPreviewVoice,
}: SettingsPageProps) {
  const [nameInput, setNameInput] = useState(userName);
  const [selectedVoice, setSelectedVoice] = useState(currentVoice);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    setNameInput(userName);
    setSelectedVoice(currentVoice);
    setSaveSuccess(false);
    setErrorMessage('');
  }, [userName, currentVoice]);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmedName = nameInput.trim();
    if (!trimmedName) {
      setErrorMessage('User name cannot be empty.');
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

      if (nameOk && voiceOk) {
        setSaveSuccess(true);
        setTimeout(() => {
          setSaveSuccess(false);
        }, 1200);
      } else {
        setErrorMessage('Failed to save settings. Please check backend connection.');
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

  const isChanged = nameInput.trim() !== userName || selectedVoice !== currentVoice;

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
              <h1 className="text-xs font-bold text-zinc-900 leading-tight">Settings & Voice Profile</h1>
              <p className="text-[10px] text-zinc-500 font-medium">Personalize your identity and agent voice</p>
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
            disabled={isSaving || !nameInput.trim() || !isChanged}
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
                autoFocus
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
              disabled={isSaving || !nameInput.trim() || !isChanged}
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


