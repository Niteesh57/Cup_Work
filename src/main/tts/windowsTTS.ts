/**
 * @deprecated Legacy Web Speech API TTS has been removed.
 * All voice synthesis is now powered exclusively by real-time streaming Gemini TTS.
 */
export const windowsTTS = {
  speak(_text: string, _voiceName?: string, _rate?: number): void {
    console.warn('[TTS] windowsTTS is deprecated and removed. Using Gemini TTS streaming.');
  },
  cancel(): void {},
};
