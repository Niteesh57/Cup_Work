/**
 * Native voice engine — high performance microphone capture + VAD state machine.
 *
 * Lifecycle:
 *   IDLE       — ready
 *   LISTENING  — listening for speech
 *   SPEAKING   — speech detected
 *   → emits utterance immediately upon end of speech
 */

export interface UtteranceResult {
  wavBase64: string;
  mimeType: string;
  durationMs: number;
}

export type VoiceState = 'IDLE' | 'LISTENING' | 'SPEAKING' | 'COUNTDOWN';

export interface VoiceEngineOptions {
  onUtterance: (utterance: UtteranceResult) => void;
  onStateChange?: (state: VoiceState) => void;
  onCountdown?: (seconds: number) => void;
  onIdleTimeout?: () => void;

  silenceThreshold?: number; // RMS below this = silence (0..1)
  minSpeechMs?: number;      // minimum speech duration before treating as speech
  endSilenceMs?: number;     // silence after speech before emitting
  countdownMs?: number;      // optional countdown (0 = immediate emit)
  idleTimeoutMs?: number;    // auto-deactivate after this much silence (0 = continuous)
}

export class VoiceEngine {
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private analyser: AnalyserNode | null = null;

  private active = false;
  private isMuted = false;
  private state: VoiceState = 'IDLE';


  private chunks: Float32Array[] = [];
  private speechStarted = false;
  private speechMs = 0;
  private silenceMs = 0;

  private countdownStarted = false;
  private countdownRemainingMs = 0;
  private countdownTick = 0;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;

  private idleMs = 0;
  private idleTimer: ReturnType<typeof setInterval> | null = null;

  private readonly sampleRate = 16000;
  private readonly silenceThreshold: number;
  private readonly minSpeechMs: number;
  private readonly endSilenceMs: number;
  private readonly countdownMs: number;
  private readonly idleTimeoutMs: number;

  constructor(private options: VoiceEngineOptions) {
    this.silenceThreshold = options.silenceThreshold ?? 0.01;
    this.minSpeechMs = options.minSpeechMs ?? 250;
    this.endSilenceMs = options.endSilenceMs ?? 750;       // 750ms silence triggers instant completion
    this.countdownMs = options.countdownMs ?? 0;          // 0 = immediate emit without countdown delay
    this.idleTimeoutMs = options.idleTimeoutMs ?? 0;      // 0 = continuous listen
  }

  async start(): Promise<void> {
    if (this.stream) return;

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: this.sampleRate,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    const ctx = new AudioContext({ sampleRate: this.sampleRate });
    this.audioContext = ctx;

    const source = ctx.createMediaStreamSource(this.stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;

    this.processor = ctx.createScriptProcessor(2048, 1, 1);
    source.connect(this.analyser);
    source.connect(this.processor);
    this.processor.connect(ctx.destination);

    this.processor.onaudioprocess = (e) => this.handleAudio(e.inputBuffer.getChannelData(0));

    this.setState('LISTENING');
  }

  activate(): void {
    if (this.active) return;
    this.active = true;
    this.setState('LISTENING');
    this.startIdleTimer();
  }

  deactivate(): void {
    this.active = false;
    this.stopCountdown();
    this.stopIdleTimer();
    this.reset();
    this.setState('IDLE');
  }

  setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (muted) {
      this.stopCountdown();
      this.reset();
      this.setState('IDLE');
    } else if (this.active) {
      this.setState('LISTENING');
    }
  }

  async stop(): Promise<void> {
    this.stopCountdown();
    this.stopIdleTimer();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.processor?.disconnect();
    this.analyser?.disconnect();
    await this.audioContext?.close();
    this.stream = null;
    this.processor = null;
    this.analyser = null;
    this.audioContext = null;
    this.active = false;
    this.setState('IDLE');
    this.reset();
  }

  private handleAudio(samples: Float32Array): void {
    if (this.isMuted) return;

    const rms = this.rms(samples);
    const isSpeech = rms > this.silenceThreshold;


    if (isSpeech) {
      if (this.countdownStarted) {
        this.stopCountdown();
      }
      this.speechStarted = true;
      this.speechMs += (samples.length / this.sampleRate) * 1000;
      this.silenceMs = 0;
      this.chunks.push(new Float32Array(samples));
      if (this.state !== 'SPEAKING') this.setState('SPEAKING');
      return;
    }

    // Silence
    this.silenceMs += (samples.length / this.sampleRate) * 1000;

    if (this.speechStarted) {
      this.chunks.push(new Float32Array(samples));

      // Silence threshold reached
      if (this.silenceMs >= this.endSilenceMs) {
        if (this.countdownMs > 0 && !this.countdownStarted) {
          this.countdownStarted = true;
          this.countdownRemainingMs = this.countdownMs;
          this.countdownTick = Math.ceil(this.countdownRemainingMs / 1000);
          this.setState('COUNTDOWN');
          this.emitCountdown(this.countdownTick);
          this.startCountdownTimer();
        } else if (this.countdownMs <= 0) {
          this.finishUtterance();
        }
      }
    }
  }

  private startCountdownTimer(): void {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.countdownTimer = setInterval(() => {
      this.countdownRemainingMs -= 200;
      if (this.countdownRemainingMs <= 0) {
        this.stopCountdown();
        this.finishUtterance();
        return;
      }
      const tick = Math.ceil(this.countdownRemainingMs / 1000);
      if (tick !== this.countdownTick && tick > 0) {
        this.countdownTick = tick;
        this.emitCountdown(tick);
      }
    }, 200);
  }

  private stopCountdown(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.countdownStarted = false;
    this.countdownRemainingMs = 0;
    this.countdownTick = 0;
  }

  private finishUtterance(): void {
    if (this.speechMs >= this.minSpeechMs) {
      const wavBase64 = this.encodeWav(this.chunks);
      const durationMs = Math.round(this.speechMs);
      this.options.onUtterance({
        wavBase64,
        mimeType: 'audio/wav',
        durationMs,
      });
    }
    this.reset();
    this.setState('LISTENING');
    if (this.active) this.startIdleTimer();
  }

  private startIdleTimer(): void {
    this.stopIdleTimer();
    if (this.idleTimeoutMs <= 0) return;
    this.idleMs = 0;
    this.idleTimer = setInterval(() => {
      this.idleMs += 250;
      if (this.idleMs >= this.idleTimeoutMs) {
        this.stopIdleTimer();
        this.options.onIdleTimeout?.();
        this.deactivate();
      }
    }, 250);
  }

  private stopIdleTimer(): void {
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private reset(): void {
    this.chunks = [];
    this.speechStarted = false;
    this.silenceMs = 0;
    this.speechMs = 0;
    this.countdownStarted = false;
    this.countdownRemainingMs = 0;
    this.countdownTick = 0;
  }

  private setState(state: VoiceState): void {
    if (this.state === state) return;
    this.state = state;
    this.options.onStateChange?.(state);
  }

  private emitCountdown(seconds: number): void {
    this.options.onCountdown?.(seconds);
  }

  private rms(samples: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
    return Math.sqrt(sum / samples.length);
  }

  private encodeWav(chunks: Float32Array[]): string {
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const buffer = new ArrayBuffer(44 + total * 2);
    const view = new DataView(buffer);

    const writeString = (offset: number, s: string) => {
      for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + total * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);       // PCM
    view.setUint16(22, 1, true);       // mono
    view.setUint32(24, this.sampleRate, true);
    view.setUint32(28, this.sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, total * 2, true);

    let offset = 44;
    for (const chunk of chunks) {
      for (let i = 0; i < chunk.length; i++) {
        const s = Math.max(-1, Math.min(1, chunk[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        offset += 2;
      }
    }

    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
}
