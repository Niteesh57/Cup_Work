/**
 * Gemini TTS Web Audio API Streaming Player with Jitter Buffering
 *
 * Plays real-time 24kHz 16-bit PCM audio chunks streamed from the Gemini TTS model.
 * Eliminates audio breaking, stuttering, and boundary clicks using adaptive pre-buffering
 * and gapless AudioBuffer scheduling.
 */

export interface AudioStreamEvent {
  streamId: string;
  taskId?: string;
  audioChunk?: string; // base64 encoded 16-bit PCM (24000 Hz, mono)
  chunkIndex?: number;
  sampleRate?: number;
  channels?: number;
}

export class GeminiAudioStreamPlayer {
  private audioCtx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private nextPlayTime = 0;
  private activeSources: Set<AudioBufferSourceNode> = new Set();
  private isCurrentlyPlaying = false;
  private onPlaybackStateChange?: (playing: boolean) => void;
  private activeStreamId: string | null = null;
  private endTimeoutTimer: NodeJS.Timeout | null = null;

  // Jitter buffer queue (holds Float32Array chunks before scheduling)
  private sampleQueue: Float32Array[] = [];
  private queuedSamplesCount = 0;
  private isBuffering = true;
  private readonly PREBUFFER_SAMPLES = 4800; // ~200ms at 24kHz
  private streamFinished = false;
  private processedChunkIndexes: Set<number> = new Set();

  constructor(onPlaybackStateChange?: (playing: boolean) => void) {
    this.onPlaybackStateChange = onPlaybackStateChange;
  }

  private initAudioContext(): AudioContext {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.value = 1.0;
      this.gainNode.connect(this.audioCtx.destination);
    }
    if (this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  /**
   * Called when a new TTS stream starts.
   */
  public handleStreamStart(streamId: string): void {
    if (this.activeStreamId && this.activeStreamId !== streamId) {
      this.stop();
    }
    this.activeStreamId = streamId;
    this.sampleQueue = [];
    this.queuedSamplesCount = 0;
    this.processedChunkIndexes.clear();
    this.isBuffering = true;
    this.streamFinished = false;
    this.initAudioContext();
    this.setPlaying(true);

    if (this.endTimeoutTimer) {
      clearTimeout(this.endTimeoutTimer);
      this.endTimeoutTimer = null;
    }
  }

  /**
   * Receives a base64 PCM 24kHz chunk.
   */
  public handleStreamChunk(event: AudioStreamEvent): void {
    if (!event.audioChunk) return;
    const streamId = event.streamId || this.activeStreamId || 'default';
    if (!this.activeStreamId) {
      this.handleStreamStart(streamId);
    } else if (event.streamId && event.streamId !== this.activeStreamId) {
      // Stale chunk from older/cancelled stream -> discard cleanly
      return;
    }

    // Chunk de-duplication: discard duplicate chunkIndex within the same stream
    if (typeof event.chunkIndex === 'number') {
      if (this.processedChunkIndexes.has(event.chunkIndex)) {
        return;
      }
      this.processedChunkIndexes.add(event.chunkIndex);
    }

    try {
      // Decode base64 to binary
      const binaryString = atob(event.audioChunk);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Convert 16-bit PCM bytes (Little Endian) to Float32 [-1.0, 1.0]
      const numSamples = Math.floor(bytes.byteLength / 2);
      if (numSamples <= 0) return;

      const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const float32Data = new Float32Array(numSamples);

      for (let i = 0; i < numSamples; i++) {
        const int16 = dataView.getInt16(i * 2, true); // true = Little Endian
        float32Data[i] = int16 / 32768.0;
      }

      this.sampleQueue.push(float32Data);
      this.queuedSamplesCount += numSamples;

      // Check if prebuffer threshold reached or if stream already finished
      if (this.isBuffering) {
        if (this.queuedSamplesCount >= this.PREBUFFER_SAMPLES || this.streamFinished) {
          this.isBuffering = false;
          this.flushQueueToAudioBuffers();
        }
      } else {
        this.flushQueueToAudioBuffers();
      }
    } catch (err) {
      console.error('[GeminiAudioStreamPlayer] Error processing audio chunk:', err);
    }
  }

  /**
   * Concatenates queued Float32 chunks and schedules contiguous AudioBuffers.
   */
  private flushQueueToAudioBuffers(): void {
    if (this.sampleQueue.length === 0) return;

    const ctx = this.initAudioContext();
    const totalSamples = this.queuedSamplesCount;
    if (totalSamples <= 0) return;

    // Merge queued float32 arrays into a single contiguous array
    const merged = new Float32Array(totalSamples);
    let offset = 0;
    for (const chunk of this.sampleQueue) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    this.sampleQueue = [];
    this.queuedSamplesCount = 0;

    const sampleRate = 24000;
    const audioBuffer = ctx.createBuffer(1, totalSamples, sampleRate);
    audioBuffer.copyToChannel(merged, 0, 0);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;

    if (this.gainNode) {
      source.connect(this.gainNode);
    } else {
      source.connect(ctx.destination);
    }

    const now = ctx.currentTime;
    // Schedule seamlessly with 30ms safety buffer if starting fresh or recovering from gap
    const scheduledTime = this.nextPlayTime < now ? now + 0.03 : this.nextPlayTime;
    source.start(scheduledTime);
    this.nextPlayTime = scheduledTime + audioBuffer.duration;

    this.activeSources.add(source);

    source.onended = () => {
      this.activeSources.delete(source);
      if (this.activeSources.size === 0 && this.sampleQueue.length === 0) {
        this.scheduleCompletionCheck();
      }
    };

    this.setPlaying(true);
  }

  /**
   * Called when stream generation finishes on backend.
   */
  public handleStreamEnd(streamId?: string): void {
    if (streamId && this.activeStreamId && this.activeStreamId !== streamId) return;
    this.streamFinished = true;

    // Flush any remaining buffered samples
    if (this.isBuffering || this.sampleQueue.length > 0) {
      this.isBuffering = false;
      this.flushQueueToAudioBuffers();
    }

    this.scheduleCompletionCheck();
  }

  private scheduleCompletionCheck(): void {
    if (this.endTimeoutTimer) {
      clearTimeout(this.endTimeoutTimer);
    }

    if (!this.audioCtx) {
      this.setPlaying(false);
      this.activeStreamId = null;
      return;
    }

    const remainingTime = Math.max(0, (this.nextPlayTime - this.audioCtx.currentTime) * 1000);
    this.endTimeoutTimer = setTimeout(() => {
      if (this.activeSources.size === 0 && this.sampleQueue.length === 0) {
        this.setPlaying(false);
        this.activeStreamId = null;
      }
    }, remainingTime + 120);
  }

  private setPlaying(playing: boolean): void {
    if (this.isCurrentlyPlaying !== playing) {
      this.isCurrentlyPlaying = playing;
      this.onPlaybackStateChange?.(playing);
    }
  }

  /**
   * Stops all active playback and discards pending buffers immediately.
   */
  public stop(): void {
    if (this.endTimeoutTimer) {
      clearTimeout(this.endTimeoutTimer);
      this.endTimeoutTimer = null;
    }

    this.sampleQueue = [];
    this.queuedSamplesCount = 0;
    this.isBuffering = true;
    this.streamFinished = false;

    for (const src of this.activeSources) {
      try {
        src.stop();
        src.disconnect();
      } catch {}
    }
    this.activeSources.clear();

    if (this.audioCtx) {
      this.nextPlayTime = this.audioCtx.currentTime;
    }
    this.activeStreamId = null;
    this.setPlaying(false);
  }

  public isPlaying(): boolean {
    return this.isCurrentlyPlaying;
  }
}
