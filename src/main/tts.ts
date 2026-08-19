import { ChildProcess, execFile } from 'child_process';

let activeTtsProcess: ChildProcess | null = null;

/**
 * Stops any actively running TTS speech process immediately.
 */
export function stopAllTts(): void {
  if (activeTtsProcess) {
    try {
      activeTtsProcess.kill();
    } catch (e) {
      console.error('[TTS] Error stopping TTS process:', e);
    }
    activeTtsProcess = null;
  }
}

/**
 * Speaks text using Windows SAPI SpeechSynthesizer.
 * Guarantees only one voice speaks at a time by terminating any prior voice.
 */
export function speakTextNative(text: string): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!text || !text.trim()) {
      return resolve();
    }
    const cleanText = text
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`[^`]+`/g, '')
      .replace(/#{1,6}\s+/g, '')
      .replace(/[*_~|>#\-=]/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (!cleanText) return resolve();

    // Kill any active voice first to guarantee no overlapping speech
    stopAllTts();

    const script = `Add-Type -AssemblyName System.Speech; $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer; $synth.Rate = 0; $synth.Speak(${JSON.stringify(cleanText)})`;
    const encodedScript = Buffer.from(script, 'utf16le').toString('base64');

    activeTtsProcess = execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodedScript],
      { maxBuffer: 1024 * 1024 },
      () => {
        activeTtsProcess = null;
        resolve();
      }
    );
  });
}
