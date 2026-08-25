/**
 * Gemini TTS Bridge Controller
 *
 * Replaces legacy Windows SAPI / PowerShell SpeechSynthesizer with real-time
 * streaming Gemini TTS (24kHz 16-bit PCM).
 */

let customBackendHttp = '';

export function setTtsBackendUrl(url: string): void {
  if (url && typeof url === 'string') {
    customBackendHttp = url.trim().replace(/\/+$/, '');
  }
}

export function getTtsBackendUrl(): string {
  if (customBackendHttp) return customBackendHttp;
  const envUrl = process.env.PYTHON_BACKEND_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '');
  }
  return 'http://127.0.0.1:8765';
}

/**
 * Signals backend and frontend to stop any actively playing audio stream immediately.
 */
export function stopAllTts(taskId?: string): void {
  try {
    const url = getTtsBackendUrl();
    fetch(`${url}/api/voice/stop-tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: taskId || '' }),
    }).catch(() => {});
  } catch {}
}

/**
 * Triggers streaming Gemini TTS for a given text.
 */
export async function streamGeminiTts(
  text: string,
  voice: string = 'Kore',
  taskId: string = '',
  deviceId?: string,
  style?: string
): Promise<{ success: boolean; streamId?: string; error?: string }> {
  if (!text || !text.trim()) {
    return { success: true };
  }

  try {
    const url = getTtsBackendUrl();
    const res = await fetch(`${url}/api/voice/speak-stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voice,
        taskId,
        deviceId,
        style,
      }),
    });

    if (!res.ok) {
      throw new Error(`TTS server returned HTTP ${res.status}`);
    }

    const data = (await res.json()) as { success: boolean; streamId?: string; error?: string };
    return data;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[GeminiTTS] Speech streaming request error:', errMsg);
    return { success: false, error: errMsg };
  }
}

/**
 * Compatibility helper replacing legacy speakTextNative with Gemini TTS streaming.
 */
export async function speakTextNative(text: string, voice = 'Kore', taskId = ''): Promise<void> {
  await streamGeminiTts(text, voice, taskId);
}
