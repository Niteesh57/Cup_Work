import React, { useState, useEffect } from 'react';
import { User, Lock, Laptop, Check, X, Loader2, Sparkles, ShieldCheck } from 'lucide-react';
import appIcon from '../assets/icon.png';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
  deviceId: string;
  deviceName: string;
  onUpdateUserName: (newName: string) => Promise<boolean>;
}

export function SettingsModal({
  isOpen,
  onClose,
  userId,
  userName,
  deviceId,
  deviceName,
  onUpdateUserName,
}: SettingsModalProps) {
  const [nameInput, setNameInput] = useState(userName);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    setNameInput(userName);
    setSaveSuccess(false);
    setErrorMessage('');
  }, [userName, isOpen]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setErrorMessage('User name cannot be empty.');
      return;
    }
    if (trimmed === userName) {
      onClose();
      return;
    }

    setIsSaving(true);
    setErrorMessage('');
    try {
      const ok = await onUpdateUserName(trimmed);
      if (ok) {
        setSaveSuccess(true);
        setTimeout(() => {
          setSaveSuccess(false);
          onClose();
        }, 800);
      } else {
        setErrorMessage('Failed to update user name. Please check backend connection.');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Error updating name.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn">
      {/* Backdrop click to close */}
      <div className="absolute inset-0" onClick={onClose} />

      <div
        className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden z-10 animate-scaleUp"
        style={{
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)',
        }}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-slate-900/5 flex items-center justify-center shadow-xs overflow-hidden p-1">
              <img src={appIcon} alt="Cup Work" className="w-full h-full object-contain" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 leading-tight">Settings & Profile</h2>
              <p className="text-[11px] text-slate-500 font-medium">Manage your multi-user identity</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-circle btn-xs text-slate-400 hover:text-slate-700 hover:bg-slate-200"
            aria-label="Close Settings"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          {/* Form: Change Only Name */}
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <User size={13} className="text-primary" />
                  Your Display Name
                </span>
                <span className="text-[10px] font-normal text-slate-400">Editable</span>
              </label>
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
                  className="w-full px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100/80 focus:bg-white text-sm font-semibold text-slate-900 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition-all"
                  style={{ color: '#0f172a' }}
                  autoFocus
                />
                {nameInput !== userName && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                    Modified
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                This name is recognized by the AI agent across your memory, preferences, and todo tasks.
              </p>
            </div>

            {errorMessage && (
              <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-600 flex items-center gap-2">
                <X size={14} className="shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {saveSuccess && (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700 flex items-center gap-2 animate-fadeIn">
                <Check size={14} className="shrink-0 text-emerald-600" />
                <span>Display name updated successfully!</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="btn btn-sm btn-ghost text-xs text-slate-600 font-semibold rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || !nameInput.trim() || nameInput.trim() === userName}
                className="btn btn-sm bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl px-5 border-none shadow-sm gap-1.5 disabled:opacity-40"
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
                    Save Name
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Divider */}
          <div className="border-t border-slate-100 pt-3" />

          {/* Gemini Streaming TTS Voice Configuration */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Sparkles size={12} className="text-primary" />
                Gemini TTS Streaming Voice
              </span>
              <span className="badge badge-primary badge-xs text-[10px] font-semibold text-white">
                Gemini 3.1 TTS
              </span>
            </div>

            <div className="bg-slate-50/80 rounded-2xl p-3.5 border border-slate-200/70 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-600 font-semibold">Active Model:</span>
                <span className="font-mono text-[11px] text-primary font-bold bg-primary/10 px-2 py-0.5 rounded-md">
                  gemini-3.1-flash-tts-preview
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600 font-semibold">Default Voice Talent:</span>
                <span className="font-semibold text-slate-800 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                  Kore (Firm & Confident)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600 font-semibold">Audio Output:</span>
                <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                  24kHz 16-bit PCM (Streaming)
                </span>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 italic leading-tight">
              🎙️ SAPI and device TTS have been removed. All spoken responses stream directly from Gemini TTS with rich directorial style and emotional audio tags.
            </p>
          </div>

          {/* Divider */}
          <div className="border-t border-slate-100 pt-3" />

          {/* Locked Hardware & Device Details (Read-Only) */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Laptop size={12} />
                Hardware & Device Identity
              </span>
              <span className="badge badge-ghost badge-xs text-[10px] font-medium text-slate-500 gap-1">
                <Lock size={9} /> Fixed Device
              </span>
            </div>

            <div className="bg-slate-50/80 rounded-2xl p-3.5 border border-slate-200/70 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Device Name:</span>
                <span className="font-semibold text-slate-800 flex items-center gap-1">
                  {deviceName || 'Desktop'}
                  <Lock size={10} className="text-slate-400" />
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Device ID:</span>
                <span className="font-mono text-[11px] text-slate-600 bg-white px-2 py-0.5 rounded-md border border-slate-200 flex items-center gap-1">
                  {deviceId || 'dev_local'}
                  <Lock size={9} className="text-slate-400" />
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">User ID:</span>
                <span className="font-mono text-[11px] text-slate-600 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                  {userId || 'usr_default'}
                </span>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-slate-200/50">
                <span className="text-slate-500 font-medium flex items-center gap-1">
                  <ShieldCheck size={12} className="text-emerald-600" /> Multi-User Routing:
                </span>
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  Active & Isolated
                </span>
              </div>
            </div>

            <p className="text-[10px] text-slate-400 italic leading-tight">
              🔒 Device ID and hardware routes are locked to guarantee that voice commands and desktop automation reach only this machine.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
