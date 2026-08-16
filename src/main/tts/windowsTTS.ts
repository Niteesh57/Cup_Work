/**
 * Windows TTS — uses the built-in Web Speech API available in Electron renderer.
 * No Azure key, no npm package needed. Uses Microsoft voices pre-installed on Windows.
 *
 * Available Microsoft voices (vary by Windows version):
 *   - "Microsoft David Desktop"
 *   - "Microsoft Zira Desktop"
 *   - "Microsoft Mark Desktop"
 *
 * Usage:
 *   import { windowsTTS } from './windowsTTS';
 *   windowsTTS.speak("Boss, your timer is done.");
 *
 * This module is intended to be called from the RENDERER process (or via IPC).
 * The Electron main process emits TTS_SPEAK events; the renderer listens and calls speak().
 */
export const windowsTTS = {
  /**
   * Speak text aloud using the Windows built-in TTS engine.
   * @param text       The text to speak
   * @param voiceName  Preferred voice name substring (default: "David")
   * @param rate       Speech rate (0.1 – 10, default: 0.95)
   */
  speak(text: string, voiceName = 'David', rate = 0.95): void {
    if (typeof speechSynthesis === 'undefined') {
      console.warn('[TTS] speechSynthesis not available in this context');
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate  = rate;
    utterance.pitch = 1.0;

    const setVoice = () => {
      const voices   = speechSynthesis.getVoices();
      // Prefer Microsoft voices; fall back to first available
      const msVoice  = voices.find(v =>
        v.name.toLowerCase().includes('microsoft') &&
        v.name.toLowerCase().includes(voiceName.toLowerCase())
      );
      utterance.voice = msVoice ?? voices.find(v => v.lang.startsWith('en')) ?? voices[0] ?? null;
      speechSynthesis.cancel();
      speechSynthesis.speak(utterance);
    };

    // Voices may not be loaded yet — wait for them
    if (speechSynthesis.getVoices().length > 0) {
      setVoice();
    } else {
      speechSynthesis.addEventListener('voiceschanged', setVoice, { once: true });
    }
  },

  cancel(): void {
    if (typeof speechSynthesis !== 'undefined') {
      speechSynthesis.cancel();
    }
  }
};
