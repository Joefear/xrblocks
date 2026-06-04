import {describe, it, expect, vi, beforeEach} from 'vitest';
import * as THREE from 'three';

// Mock xrblocks so importing `Script` doesn't trigger the Core singleton,
// which constructs a real AudioContext (jsdom can't provide one).
vi.mock('xrblocks', async () => {
  const T = await import('three');
  return {Script: T.Object3D, core: {camera: undefined}};
});

import {LipsyncMouth} from './LipsyncMouth';

// Minimal in-memory Web Audio mock: only what LipsyncMouth touches.
// AnalyserNode emits fixed-shape (silent) buffers; tests stub
// freqData/timeData via `(node as any).__setSpectrum()` to drive the mapper.
class MockAnalyserNode {
  fftSize = 1024;
  frequencyBinCount = 512;
  smoothingTimeConstant = 0.4;
  private _freq = new Uint8Array(this.frequencyBinCount);
  private _freqDb = new Float32Array(this.frequencyBinCount).fill(-120);
  private _time = new Uint8Array(this.fftSize).fill(128);
  connect = vi.fn();
  disconnect = vi.fn();
  getByteFrequencyData(out: Uint8Array) {
    out.set(this._freq);
  }
  getFloatFrequencyData(out: Float32Array) {
    out.set(this._freqDb);
  }
  getByteTimeDomainData(out: Uint8Array) {
    out.set(this._time);
  }
  __setLoudVoiced() {
    // Strong low-band + a F1/F2-shaped pair, plus non-silent time domain.
    for (let i = 0; i < 30; i++) this._freq[i] = 200;
    this._freq[20] = 255;
    this._freq[48] = 230;
    for (let i = 0; i < this._time.length; i++) {
      this._time[i] = 128 + Math.round(64 * Math.sin((i / 8) * Math.PI));
    }
  }
}

class MockMediaStreamSource {
  connect = vi.fn();
  disconnect = vi.fn();
}

class MockAudioContext {
  sampleRate = 48000;
  state = 'running';
  createAnalyser = vi.fn(() => new MockAnalyserNode());
  createMediaStreamSource = vi.fn(() => new MockMediaStreamSource());
  resume = vi.fn(() => Promise.resolve());
  close = vi.fn(() => Promise.resolve());
}

function makeStream(): MediaStream {
  // jsdom provides a MediaStream shim sufficient for our needs.
  return new (globalThis.MediaStream ??
    (class {} as unknown as typeof MediaStream))();
}

let ctx: MockAudioContext;

beforeEach(() => {
  ctx = new MockAudioContext();
});

describe('LipsyncMouth', () => {
  it('is a THREE.Object3D suitable for parenting to a head pivot', () => {
    const m = new LipsyncMouth(makeStream(), {
      audioContext: ctx as unknown as AudioContext,
    });
    expect(m.isObject3D).toBe(true);
  });

  it('constructor + init() builds the audio graph from the injected AudioContext', async () => {
    const m = new LipsyncMouth(makeStream(), {
      audioContext: ctx as unknown as AudioContext,
    });
    await m.init();
    expect(ctx.createMediaStreamSource).toHaveBeenCalled();
    expect(ctx.createAnalyser).toHaveBeenCalled();
  });

  it('mouth child is added under the LipsyncMouth and follows it', async () => {
    const m = new LipsyncMouth(makeStream(), {
      audioContext: ctx as unknown as AudioContext,
    });
    await m.init();
    expect(m.children.length).toBeGreaterThan(0);
    expect(m.children.some((c) => c instanceof THREE.Object3D)).toBe(true);
  });

  it('update() drives the mouth visemes when audio is loud / voiced', async () => {
    const m = new LipsyncMouth(makeStream(), {
      audioContext: ctx as unknown as AudioContext,
    });
    await m.init();
    // Drive enough frames to overcome the smoothing time constant.
    const analyser = ctx.createAnalyser.mock.results[0]
      .value as MockAnalyserNode;
    analyser.__setLoudVoiced();
    for (let i = 0; i < 50; i++) m.update(i * 0.016);
    expect(m.mouth.visemes.jawOpen).toBeGreaterThan(0.05);
  });

  it('silent input → mouth stays at rest', async () => {
    const m = new LipsyncMouth(makeStream(), {
      audioContext: ctx as unknown as AudioContext,
    });
    await m.init();
    for (let i = 0; i < 50; i++) m.update(i * 0.016);
    expect(m.mouth.visemes.jawOpen).toBeLessThan(0.05);
  });

  it('dispose() disconnects analyser + source and removes the mouth child', async () => {
    const m = new LipsyncMouth(makeStream(), {
      audioContext: ctx as unknown as AudioContext,
    });
    await m.init();
    const source = ctx.createMediaStreamSource.mock.results[0]
      .value as MockMediaStreamSource;
    const analyser = ctx.createAnalyser.mock.results[0]
      .value as MockAnalyserNode;
    m.dispose();
    expect(source.disconnect).toHaveBeenCalled();
    expect(analyser.disconnect).toHaveBeenCalled();
    expect(m.children.length).toBe(0);
  });

  it('dispose() does NOT close the injected AudioContext (caller owns it)', async () => {
    const m = new LipsyncMouth(makeStream(), {
      audioContext: ctx as unknown as AudioContext,
    });
    await m.init();
    m.dispose();
    expect(ctx.close).not.toHaveBeenCalled();
  });

  it('dispose() does NOT stop MediaStream tracks (caller owns the stream)', async () => {
    const stream = makeStream();
    const track = {
      stop: vi.fn(),
      kind: 'audio',
      enabled: true,
    } as unknown as MediaStreamTrack;
    // jsdom MediaStream doesn't expose addTrack consistently; monkey-patch
    // getTracks instead since that's what consumers iterate.
    (stream as unknown as {getTracks: () => MediaStreamTrack[]}).getTracks =
      () => [track];
    const m = new LipsyncMouth(stream, {
      audioContext: ctx as unknown as AudioContext,
    });
    await m.init();
    m.dispose();
    expect(track.stop).not.toHaveBeenCalled();
  });

  it('two LipsyncMouths can share one AudioContext', async () => {
    const m1 = new LipsyncMouth(makeStream(), {
      audioContext: ctx as unknown as AudioContext,
    });
    const m2 = new LipsyncMouth(makeStream(), {
      audioContext: ctx as unknown as AudioContext,
    });
    await m1.init();
    await m2.init();
    expect(ctx.createMediaStreamSource).toHaveBeenCalledTimes(2);
    // Disposing one leaves the other working.
    m1.dispose();
    expect(ctx.close).not.toHaveBeenCalled();
    expect(m2.children.length).toBeGreaterThan(0);
    m2.dispose();
  });
});
