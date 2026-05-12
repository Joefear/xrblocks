/**
 * SpatialVoice: maps each remote peer to a `THREE.PositionalAudio` node
 * parented to that peer's RemoteUserAvatar head pivot, so their voice
 * spatializes with their position. The local microphone capture and the
 * RTCPeerConnection wiring lives in VoiceChat — SpatialVoice is the
 * "render layer" that places remote audio in 3D.
 *
 * This class is mostly a thin three.js wrapper, kept separate so apps can
 * swap in custom HRTF panners or attach a UI volume slider without
 * monkey-patching VoiceChat.
 */
import * as THREE from 'three';

export interface SpatialVoiceOptions {
  /** Reference distance (m) at which volume is 1.0. */
  refDistance?: number;
  /** Distance model rolloff factor. */
  rolloffFactor?: number;
  /** Maximum distance after which audio attenuation stops decreasing. */
  maxDistance?: number;
}

export class SpatialVoice {
  readonly listener: THREE.AudioListener;
  private _byPeer = new Map<string, THREE.PositionalAudio>();
  private _opts: Required<SpatialVoiceOptions>;

  constructor(camera: THREE.Camera, opts: SpatialVoiceOptions = {}) {
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
    this._opts = {
      refDistance: opts.refDistance ?? 1,
      rolloffFactor: opts.rolloffFactor ?? 1,
      maxDistance: opts.maxDistance ?? 20,
    };
  }

  /**
   * Attach a MediaStream to a peer; (re-)creates the PositionalAudio node and
   * parents it to `parent` (typically the remote user's headPivot).
   */
  attach(peerId: string, parent: THREE.Object3D, stream: MediaStream): void {
    this.detach(peerId);
    const audio = new THREE.PositionalAudio(this.listener);
    audio.setRefDistance(this._opts.refDistance);
    audio.setRolloffFactor(this._opts.rolloffFactor);
    audio.setMaxDistance(this._opts.maxDistance);
    audio.setDistanceModel('inverse');

    // three.js doesn't have a first-class "use a MediaStream" path that works
    // across all browsers; the safest cross-browser route is to build a
    // MediaStreamAudioSourceNode and assign it via setNodeSource.
    // three.js's typings for setNodeSource want an AudioScheduledSourceNode,
    // but at runtime any AudioNode works for our purposes. Cast through any
    // to avoid pulling in a different code path on every browser.
    const ctx = THREE.AudioContext.getContext();
    const src = ctx.createMediaStreamSource(stream);
    (audio as unknown as {setNodeSource: (n: AudioNode) => void}).setNodeSource(
      src
    );

    parent.add(audio);
    this._byPeer.set(peerId, audio);
  }

  detach(peerId: string): void {
    const audio = this._byPeer.get(peerId);
    if (!audio) return;
    audio.parent?.remove(audio);
    audio.disconnect();
    this._byPeer.delete(peerId);
  }

  dispose(): void {
    for (const id of [...this._byPeer.keys()]) this.detach(id);
    this.listener.parent?.remove(this.listener);
  }
}
