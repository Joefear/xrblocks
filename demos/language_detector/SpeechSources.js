import * as xb from 'xrblocks';

// Common shape:
//   start(): Promise<void>
//   stop(): Promise<void>
//   onTranscript(fn(text, isFinal))
//   onError(fn(err))
//   isAvailable(): boolean

export class WebSpeechSource {
  constructor() {
    this._recognition = null;
    this._handlers = {transcript: null, error: null};
    this._running = false;
    this._finalSoFar = '';
  }

  static isAvailable() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  onTranscript(fn) {
    this._handlers.transcript = fn;
  }
  onError(fn) {
    this._handlers.error = fn;
  }

  async start() {
    if (this._running) return;
    const Cls = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Cls) {
      this._handlers.error?.(new Error('Web Speech API not supported'));
      return;
    }
    const rec = new Cls();
    rec.continuous = true;
    rec.interimResults = true;
    // 'auto' is non-standard; leave language undefined to let the browser pick,
    // since the whole point is multilingual detection.
    rec.lang = navigator.language || 'en-US';
    rec.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) {
          this._finalSoFar += res[0].transcript + ' ';
        } else {
          interim += res[0].transcript;
        }
      }
      const combined = (this._finalSoFar + interim).trim();
      const wasFinal = event.results[event.results.length - 1].isFinal;
      this._handlers.transcript?.(combined, wasFinal);
    };
    rec.onerror = (e) => this._handlers.error?.(e.error || e);
    rec.onend = () => {
      // Auto-restart if user didn't ask to stop (Chrome ends after silence).
      if (this._running) {
        try {
          rec.start();
        } catch {
          /* ignore double-start */
        }
      }
    };
    this._recognition = rec;
    this._running = true;
    rec.start();
  }

  async stop() {
    this._running = false;
    if (this._recognition) {
      try {
        this._recognition.stop();
      } catch {
        /* ignore */
      }
      this._recognition = null;
    }
  }

  reset() {
    this._finalSoFar = '';
  }
}

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
      xb.core.ai
        .startLiveSession({
          inputAudioTranscription: {},
        })
        .catch(reject);
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
