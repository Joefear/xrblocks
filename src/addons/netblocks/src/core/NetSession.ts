/**
 * NetSession: the orchestrator that lives between a Transport and the rest
 * of netblocks. Responsibilities:
 *
 *   - Wraps a Transport, owns the local peer id, and maintains a Map of
 *     active NetUsers.
 *   - Encodes every outbound NetMessage (adding `from`, `ts`) and decodes
 *     every inbound payload, dispatching to:
 *       * PresenceBroadcaster (outbound pose)  / pose buffer per NetUser (inbound)
 *       * NetEvents bus (typed RPC)
 *       * NetObjectRegistry (replicated transforms + ownership)
 *       * VoiceChat (out-of-band SDP/ICE signaling)
 *   - Per-frame `update()` drives presence broadcasting, smooth interpolation
 *     of remote avatars and net objects, and broadcasting transforms for
 *     locally-owned net objects.
 *   - Emits high-level events (`user-join`, `user-leave`) for the host app.
 *
 * The root xrblocks `Script` passed in is used purely as a scene-graph
 * mount point for remote avatars; netblocks never manipulates the host
 * script's properties.
 */
import * as THREE from 'three';
import * as xb from 'xrblocks';

import {
  decodeMessage,
  encodeMessage,
  HelloMessage,
  NetMessage,
  PeerCapabilities,
  RpcMessage,
  VoiceSignalMessage,
  WelcomeMessage,
} from './codec/MessageCodec';
import {base64ToBytes, decodePose} from './codec/PoseCodec';
import {
  DEFAULT_NETOBJECT_HZ,
  NET_PROTOCOL_VERSION,
} from './constants/NetConstants';
import {NetObject} from './objects/NetObject';
import {NetObjectRegistry} from './objects/NetObjectRegistry';
import {NetUser} from './NetUser';
import {PresenceBroadcaster} from './presence/PresenceBroadcaster';
import {NetEvents} from './rpc/NetEvents';
import {
  Transport,
  TransportMessageEventDetail,
  TransportPeerEventDetail,
} from './transport/Transport';
import {SpatialVoice} from './voice/SpatialVoice';
import {VoiceChat} from './voice/VoiceChat';

export interface NetSessionOptions {
  /** Display name announced to other peers. */
  displayName?: string;
  /** Override the presence broadcast frequency in Hz (default: 20). */
  presenceHz?: number;
  /** Override the netobject broadcast frequency in Hz (default: 20). */
  netObjectHz?: number;
  /** Whether to enable voice chat at session start. Defaults to false. */
  voice?: boolean;
}

export type NetSessionEventName =
  | 'open'
  | 'close'
  | 'user-join'
  | 'user-leave'
  | 'voice-state';

export interface UserEventDetail {
  user: NetUser;
}

const DEFAULT_CAPABILITIES: PeerCapabilities = {
  pose: true,
  voice: true,
  netobject: true,
};

export class NetSession extends EventTarget {
  readonly transport: Transport;
  readonly events: NetEvents;
  readonly netObjects = new NetObjectRegistry();
  readonly presence: PresenceBroadcaster;
  readonly voice: VoiceChat;

  private _root: THREE.Object3D;
  private _users = new Map<string, NetUser>();
  private _opts: Required<
    Pick<NetSessionOptions, 'presenceHz' | 'netObjectHz' | 'voice'>
  > &
    NetSessionOptions;
  private _spatialVoice?: SpatialVoice;
  private _isOpen = false;
  private _capabilities = {...DEFAULT_CAPABILITIES};

  constructor(
    transport: Transport,
    root: THREE.Object3D,
    opts: NetSessionOptions = {}
  ) {
    super();
    this.transport = transport;
    this._root = root;
    this._opts = {
      presenceHz: opts.presenceHz ?? 20,
      netObjectHz: opts.netObjectHz ?? DEFAULT_NETOBJECT_HZ,
      voice: opts.voice ?? false,
      displayName: opts.displayName,
    };
    this.presence = new PresenceBroadcaster(
      (msg) => this._sendNet(msg),
      this._opts.presenceHz
    );
    this.events = new NetEvents((msg) => this._sendNet(msg));
    this.voice = new VoiceChat((msg) => this._sendNet(msg));
    this.voice.onTrack((peerId, stream) => this._onVoiceTrack(peerId, stream));
    this.voice.onTrackRemoved((peerId) => this._spatialVoice?.detach(peerId));

    this.transport.addEventListener('peer-join', (e) =>
      this._onPeerJoin(
        (e as CustomEvent<TransportPeerEventDetail>).detail.peerId
      )
    );
    this.transport.addEventListener('peer-leave', (e) =>
      this._onPeerLeave(
        (e as CustomEvent<TransportPeerEventDetail>).detail.peerId
      )
    );
    this.transport.addEventListener('message', (e) =>
      this._onMessage((e as CustomEvent<TransportMessageEventDetail>).detail)
    );
  }

  get isOpen(): boolean {
    return this._isOpen;
  }

  get localPeerId(): string {
    return this.transport.localPeerId;
  }

  get users(): ReadonlyMap<string, NetUser> {
    return this._users;
  }

  /** Connect the underlying transport and announce ourselves. */
  async open(roomId: string): Promise<void> {
    await this.transport.connect({roomId});
    this._isOpen = true;
    this.voice.setLocalPeerId(this.transport.localPeerId);

    // Lazy-init spatial voice (needs a camera; safe to skip if none yet).
    const cam = xb.core?.camera;
    if (cam && !this._spatialVoice) this._spatialVoice = new SpatialVoice(cam);

    // Greet every peer already known.
    const hello: HelloMessage = {
      type: 'hello',
      protocol: NET_PROTOCOL_VERSION,
      displayName: this._opts.displayName,
      capabilities: this._capabilities,
    };
    this._sendNet(hello);

    if (this._opts.voice) {
      try {
        await this.voice.enable(this.transport.remotePeerIds);
      } catch (err) {
        console.warn('[netblocks] voice.enable() failed:', err);
      }
    }
    this.dispatchEvent(new Event('open'));
  }

  close(): void {
    if (!this._isOpen) return;
    this._isOpen = false;
    this._sendNet({type: 'bye'});
    this.voice.disable();
    this.transport.close();
    for (const [, user] of this._users) {
      this.netObjects.releaseOwnedBy(user.peerId);
      user.dispose();
    }
    this._users.clear();
    this.dispatchEvent(new Event('close'));
  }

  /** Register an existing NetObject so its transform is replicated. */
  addNetObject(obj: NetObject): void {
    if (!obj.ownerId) obj.ownerId = this.localPeerId;
    this.netObjects.add(obj);
  }

  /** Convenience: create + auto-add a NetObject parented to `root`. */
  createNetObject(
    opts?: ConstructorParameters<typeof NetObject>[0]
  ): NetObject {
    const obj = new NetObject(opts);
    obj.ownerId = obj.ownerId || this.localPeerId;
    this.netObjects.add(obj);
    this._root.add(obj);
    return obj;
  }

  removeNetObject(obj: NetObject): void {
    this.netObjects.remove(obj);
    obj.parent?.remove(obj);
  }

  /** Claim ownership of an object (e.g., on grab). */
  claim(obj: NetObject): void {
    if (this.netObjects.applyClaim(obj.netId, this.localPeerId)) {
      this._sendNet({type: 'netobject.claim', id: obj.netId});
    }
  }

  /** Release ownership of an object (e.g., on release). */
  release(obj: NetObject): void {
    if (this.netObjects.applyRelease(obj.netId, this.localPeerId)) {
      this._sendNet({type: 'netobject.release', id: obj.netId});
    }
  }

  /** Per-frame tick. Call from the host xb.Script's `update()`. */
  update(_time?: number, _frame?: XRFrame): void {
    if (!this._isOpen) return;
    const now = performance.now();

    // Outbound presence.
    this.presence.update(now);

    // Smooth remote avatars.
    for (const [, user] of this._users) {
      user.avatar.applyPose(now);
    }

    // Replicated objects.
    const period = 1000 / this._opts.netObjectHz;
    for (const obj of this.netObjects.values()) {
      if (obj.ownerId === this.localPeerId) {
        if (now - obj._lastSendMs >= period) {
          obj._lastSendMs = now;
          this._sendNet({
            type: 'netobject',
            id: obj.netId,
            xform: obj.toXform(),
            state: Object.keys(obj.state).length ? obj.state : undefined,
          });
        }
      } else if (obj._hasTarget) {
        // ~12 Hz convergence per second of dt; we don't have dt here so use a
        // fixed fraction tuned for 60+ fps host applications.
        obj.stepInterpolation(0.2);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Internal: send / dispatch / lifecycle
  // -----------------------------------------------------------------------

  private _sendNet(msg: NetMessage): void {
    if (!this.transport.isOpen) return;
    msg.from = this.localPeerId;
    msg.ts = msg.ts ?? performance.now();
    const bytes = encodeMessage(msg);
    if (msg.to) {
      this.transport.send(bytes, msg.to);
    } else {
      this.transport.send(bytes);
    }
  }

  private _onPeerJoin(peerId: string): void {
    // Pre-create a NetUser entry; we'll fill display name when their HELLO arrives.
    if (!this._users.has(peerId)) {
      const user = new NetUser(peerId, {...DEFAULT_CAPABILITIES});
      this._users.set(peerId, user);
      this._root.add(user.avatar);
      this.dispatchEvent(
        new CustomEvent<UserEventDetail>('user-join', {detail: {user}})
      );
    }
    // Re-introduce ourselves so the new peer learns our capabilities.
    this._sendNet({
      type: 'hello',
      protocol: NET_PROTOCOL_VERSION,
      displayName: this._opts.displayName,
      capabilities: this._capabilities,
      to: peerId,
    } as HelloMessage);
    this.voice.notifyPeerJoined(peerId);
  }

  private _onPeerLeave(peerId: string): void {
    const user = this._users.get(peerId);
    if (!user) return;
    this.netObjects.releaseOwnedBy(peerId);
    this.voice.notifyPeerLeft(peerId);
    this._spatialVoice?.detach(peerId);
    user.dispose();
    this._users.delete(peerId);
    this.dispatchEvent(
      new CustomEvent<UserEventDetail>('user-leave', {detail: {user}})
    );
  }

  private _onMessage(detail: TransportMessageEventDetail): void {
    let msg: NetMessage;
    try {
      msg = decodeMessage(detail.data);
    } catch (err) {
      console.warn('[netblocks] failed to decode message:', err);
      return;
    }
    msg.from = msg.from ?? detail.peerId;
    if (msg.from === this.localPeerId) return; // ignore loopback
    let user = this._users.get(msg.from);
    if (!user) {
      user = new NetUser(msg.from, {...DEFAULT_CAPABILITIES});
      this._users.set(msg.from, user);
      this._root.add(user.avatar);
      this.dispatchEvent(
        new CustomEvent<UserEventDetail>('user-join', {detail: {user}})
      );
    }
    user.lastSeenMs = performance.now();

    switch (msg.type) {
      case 'hello':
        user.displayName = msg.displayName ?? user.displayName;
        user.capabilities = msg.capabilities;
        user.avatar.displayName = user.displayName;
        // Reply with a welcome containing the rooms's known peer list.
        this._sendNet({
          type: 'welcome',
          to: msg.from,
          peers: [...this._users.values()].map((u) => ({
            id: u.peerId,
            displayName: u.displayName,
            capabilities: u.capabilities,
          })),
        } as WelcomeMessage);
        break;
      case 'welcome':
        for (const p of msg.peers) {
          if (p.id === this.localPeerId) continue;
          let other = this._users.get(p.id);
          if (!other) {
            other = new NetUser(p.id, p.capabilities, p.displayName);
            this._users.set(p.id, other);
            this._root.add(other.avatar);
            this.dispatchEvent(
              new CustomEvent<UserEventDetail>('user-join', {
                detail: {user: other},
              })
            );
          } else {
            other.displayName = p.displayName ?? other.displayName;
            other.capabilities = p.capabilities;
            other.avatar.displayName = other.displayName;
          }
        }
        break;
      case 'bye':
        this._onPeerLeave(msg.from);
        break;
      case 'pose':
        try {
          const snap = decodePose(base64ToBytes(msg.data));
          user.avatar.pose.push(snap, msg.ts ?? performance.now());
        } catch (err) {
          console.warn('[netblocks] failed to decode pose:', err);
        }
        break;
      case 'netobject': {
        const obj = this.netObjects.get(msg.id);
        if (obj && obj.ownerId !== this.localPeerId) {
          obj.setTargetXform(msg.xform);
          if (msg.state) Object.assign(obj.state, msg.state);
        }
        break;
      }
      case 'netobject.claim':
        this.netObjects.applyClaim(msg.id, msg.from);
        break;
      case 'netobject.release':
        this.netObjects.applyRelease(msg.id, msg.from);
        break;
      case 'rpc':
        this.events._dispatch(msg as RpcMessage);
        break;
      case 'voice':
        void this.voice.handleSignal(msg.from, msg as VoiceSignalMessage);
        break;
      case 'ping':
      case 'pong':
        // Reserved for future keepalive use.
        break;
    }
  }

  private _onVoiceTrack(peerId: string, stream: MediaStream): void {
    if (!this._spatialVoice) {
      const cam = xb.core?.camera;
      if (cam) this._spatialVoice = new SpatialVoice(cam);
    }
    const user = this._users.get(peerId);
    if (!this._spatialVoice || !user) return;
    this._spatialVoice.attach(peerId, user.avatar.headPivot, stream);
    this.dispatchEvent(
      new CustomEvent('voice-state', {detail: {peerId, on: true}})
    );
  }
}
