import * as xb from 'xrblocks';

// Gemini Live: streams mic audio to Gemini and returns multilingual transcripts.
// Common shape:
//   start(): Promise<void>
//   stop(): Promise<void>
//   onTranscript(fn(text, isFinal))
//   onError(fn(err))
//   isAvailable(): boolean

export class GeminiLiveSource {
  constructor() {
    this._handlers = {transcript: null, error: null};
    this._running = false;
    this._buffer = '';
  }

  static isAvailable() {
    return !!xb.core?.ai;
  }

  onTranscript(fn) {
    this._handlers.transcript = fn;
  }
  onError(fn) {
    this._handlers.error = fn;
  }

  async start() {
    if (this._running) return;
    if (!xb.core?.ai) {
      this._handlers.error?.(new Error('xb.core.ai not available'));
      return;
    }
    this._running = true;
    await xb.core.sound?.enableAudio?.();
    await new Promise((resolve, reject) => {
      xb.core.ai.setLiveCallbacks({
        onopen: resolve,
        onmessage: (msg) => this._handleMessage(msg),
        onerror: (e) => {
          this._handlers.error?.(e);
          reject(e);
        },
        onclose: () => {
          this._running = false;
        },
      });
      xb.core.ai.startLiveSession({inputAudioTranscription: {}}).catch(reject);
    });
  }

  async stop() {
    this._running = false;
    try {
      await xb.core.ai?.stopLiveSession?.();
    } catch {
      /* ignore */
    }
  }

  reset() {
    this._buffer = '';
  }

  _handleMessage(message) {
    const content = message.serverContent;
    if (!content) return;
    if (content.inputTranscription?.text) {
      this._buffer += content.inputTranscription.text;
      this._handlers.transcript?.(this._buffer.trim(), false);
    }
    if (content.turnComplete) {
      this._handlers.transcript?.(this._buffer.trim(), true);
    }
  }
}
