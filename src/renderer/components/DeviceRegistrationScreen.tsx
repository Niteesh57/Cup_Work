import React, { useState, useEffect } from 'react';
import { Sparkles, Laptop, Lock, User, ArrowRight, Loader2, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { MovingColorsAvatar } from './MovingColorsAvatar';
import appIcon from '../assets/icon.png';

interface DeviceRegistrationScreenProps {
  deviceId: string;
  deviceName: string;
  suggestedUserName: string;
  onRegister: (customName: string) => Promise<boolean>;
  onOpenSettings?: () => void;
}

const ROTATING_WORDS = [
  { text: 'Desktop Automation', emoji: '⚡', color: 'from-amber-500 to-orange-500', bg: 'bg-amber-50 border-amber-200 text-amber-700' },
  { text: 'Voice Navigation', emoji: '🎤', color: 'from-blue-500 to-cyan-500', bg: 'bg-blue-50 border-blue-200 text-blue-700' },
  { text: 'Smart Planning', emoji: '🧠', color: 'from-purple-500 to-indigo-500', bg: 'bg-purple-50 border-purple-200 text-purple-700' },
  { text: 'Task Execution', emoji: '🛠️', color: 'from-emerald-500 to-teal-500', bg: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
  { text: 'Memory Retention', emoji: '💾', color: 'from-rose-500 to-pink-500', bg: 'bg-rose-50 border-rose-200 text-rose-700' },
  { text: 'Agent Pairing', emoji: '🤝', color: 'from-violet-500 to-fuchsia-500', bg: 'bg-violet-50 border-violet-200 text-violet-700' },
];

export function DeviceRegistrationScreen({
  deviceId,
  deviceName,
  suggestedUserName,
  onRegister,
  onOpenSettings,
}: DeviceRegistrationScreenProps) {
  const [currentWordIdx, setCurrentWordIdx] = useState(0);
  const [userNameInput, setUserNameInput] = useState(suggestedUserName || 'CosmicPilot_42');
  const [isRegistering, setIsRegistering] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // ── DaisyUI Rotating 6 Words Cycler (every 2.4s) ───────────────────────────
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentWordIdx((prev) => (prev + 1) % ROTATING_WORDS.length);
    }, 2400);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (suggestedUserName) {
      setUserNameInput(suggestedUserName);
    }
  }, [suggestedUserName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = userNameInput.trim();
    if (!finalName) {
      setErrorMsg('Please enter a display name for this user profile.');
      return;
    }

    setIsRegistering(true);
    setErrorMsg('');
    try {
      const ok = await onRegister(finalName);
      if (!ok) {
        setErrorMsg('Could not register device. Ensure Python backend is online.');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setIsRegistering(false);
    }
  };

  const currentWord = ROTATING_WORDS[currentWordIdx];

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 p-6 select-none relative overflow-hidden">
      {/* Background Decorative Glow Orbs */}
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-primary/20 rounded-full blur-3xl pointer-events-none animate-pulse" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-amber-500/15 rounded-full blur-3xl pointer-events-none animate-pulse" style={{ animationDelay: '1.2s' }} />

      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100/90 overflow-hidden relative z-10 animate-scaleUp">
        {/* Top Header Card */}
        <div className="bg-gradient-to-b from-slate-50 to-white px-8 pt-8 pb-6 border-b border-slate-100 text-center">
          <div className="inline-flex items-center justify-center p-2.5 bg-slate-900/5 rounded-3xl mb-3 shadow-inner">
            <img
              src={appIcon}
              alt="Cup Work Icon"
              className="w-14 h-14 object-contain rounded-2xl shadow-md animate-pulse"
              style={{ animationDuration: '3s' }}
            />
          </div>

          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Welcome to Cup Work
          </h1>

          {/* ── DaisyUI Rotating 6 Words Engaging Section ── */}
          <div className="mt-3 flex items-center justify-center gap-2 h-9">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Experience
            </span>
            <div className="relative inline-flex items-center overflow-hidden h-8 px-3 py-1 rounded-full border shadow-2xs transition-all duration-300 transform">
              <span
                key={currentWord.text}
                className={`inline-flex items-center gap-1.5 text-xs font-bold ${currentWord.bg} px-2.5 py-0.5 rounded-full animate-fadeIn`}
              >
                <span>{currentWord.emoji}</span>
                <span>{currentWord.text}</span>
              </span>
            </div>
          </div>

          <p className="text-xs text-slate-500 mt-2.5 max-w-sm mx-auto leading-relaxed">
            New device detected. Let&apos;s set up your isolated multi-user identity and register this machine for Cup Work.
          </p>
        </div>

        {/* Form & Device Info */}
        <form onSubmit={handleSubmit} className="p-8 space-y-5">
          {/* Display Name Input */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <User size={14} className="text-primary" />
                Your Display Name
              </span>
              <span className="badge badge-primary badge-xs text-[10px] font-semibold text-white px-2 py-0.5">
                Auto-Generated
              </span>
            </label>
            <div className="flex items-center gap-3">
              <MovingColorsAvatar name={userNameInput} size="md" showGlow={false} />
              <div className="relative flex-1">
                <input
                  type="text"
                  value={userNameInput}
                  onChange={(e) => {
                    setUserNameInput(e.target.value);
                    setErrorMsg('');
                  }}
                  maxLength={36}
                  placeholder="Enter your name…"
                  className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100/70 focus:bg-white text-sm font-semibold text-slate-900 border border-slate-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition-all shadow-inner"
                  style={{ color: '#0f172a' }}
                  autoFocus
                />
              </div>
            </div>
          </div>

          {/* Locked Hardware & Device Card */}
          <div className="bg-slate-50/90 rounded-2xl p-4 border border-slate-200/80 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium flex items-center gap-1.5">
                <Laptop size={13} className="text-slate-700" />
                Detected Machine:
              </span>
              <span className="font-bold text-slate-800 flex items-center gap-1">
                {deviceName || 'Desktop Workstation'}
                <Lock size={10} className="text-slate-400" />
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium flex items-center gap-1.5">
                <ShieldCheck size={13} className="text-emerald-600" />
                Device ID:
              </span>
              <span className="font-mono text-[11px] text-slate-600 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                {deviceId || 'dev_local'}
              </span>
            </div>

            <div className="pt-2 border-t border-slate-200/60 flex items-center gap-1.5 text-[11px] text-slate-500">
              <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />
              <span>Multi-device memory, short-term turns, and tasks will be isolated to this machine.</span>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-xs font-medium text-red-600 animate-fadeIn">
              {errorMsg}
            </div>
          )}

          {/* Submit Action */}
          <button
            type="submit"
            disabled={isRegistering || !userNameInput.trim()}
            className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 active:scale-[0.99] text-white font-bold text-sm rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 border-none disabled:opacity-50 cursor-pointer"
          >
            {isRegistering ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Registering Device & Launching…
              </>
            ) : (
              <>
                <Sparkles size={16} className="text-amber-300" />
                Register Device & Get Started
                <ArrowRight size={16} />
              </>
            )}
          </button>

          {onOpenSettings && (
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={onOpenSettings}
                className="text-xs text-zinc-500 hover:text-zinc-800 underline font-medium transition-colors cursor-pointer"
              >
                Change Backend Server URL
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
