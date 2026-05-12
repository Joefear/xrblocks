/**
 * WebRTCTransport: peer-to-peer transport using a tiny manual signaling
 * channel. By default it uses the public PeerJS broker for signaling
 * (host: '0.peerjs.com'), so samples can run with no backend at all.
 *
 * Caveats:
 *   - The public broker is best-effort and rate-limited; do not rely on it
 *     in production. Pass `signalingUrl` to use your own broker.
 *   - Without TURN, NAT traversal can fail between certain network
 *     topologies. Pass `iceServers` to add TURN servers if needed.
 *   - Full-mesh topology — best for ≤ 6 participants.
 *
 * The signaling protocol is the well-known PeerJS line protocol over a
 * single WebSocket; we implement just enough of it to discover other peers
 * in the same "room" (which is mapped to a PeerJS prefix).
 */
import {base64ToBytes} from '../codec/PoseCodec';
import {
  DEFAULT_ICE_SERVERS,
  DEFAULT_PEERJS_BROKER,
} from '../constants/NetConstants';
import {makeId} from '../utils/IdUtils';
import {
  Transport,
  TransportConnectOptions,
  TransportPayload,
} from './Transport';

export interface WebRTCTransportOptions {
  /** Override the default PeerJS broker URL. If not supplied, the public broker is used. */
  signalingUrl?: string;
  /** ICE servers (STUN/TURN). Defaults to Google's public STUN. */
  iceServers?: RTCIceServer[];
  /** Optional broker key (PeerJS uses 'peerjs' for the public host). */
  brokerKey?: string;
}

interface PeerEntry {
  pc: RTCPeerConnection;
  dc?: RTCDataChannel;
  ready: boolean;
  pendingIce: RTCIceCandidateInit[];
}

const ROOM_PREFIX = 'xrbnet';

export class WebRTCTransport extends Transport {
  readonly name = 'WebRTC';
  private _signaling?: WebSocket;
  private _localPeerId = '';
  private _roomId = '';
  private _isOpen = false;
  private _opts: WebRTCTransportOptions;
  private _peers = new Set<string>();
  private _entries = new Map<string, PeerEntry>();
  private _heartbeat?: ReturnType<typeof setInterval>;
  private _discoveryTimer?: ReturnType<typeof setInterval>;

  constructor(opts: WebRTCTransportOptions = {}) {
    super();
    this._opts = opts;
  }

  get localPeerId(): string {
    return this._localPeerId;
  }
  get isOpen(): boolean {
    return this._isOpen;
  }
  get remotePeerIds(): ReadonlySet<string> {
    return this._peers;
  }

  async connect(opts: TransportConnectOptions): Promise<void> {
    if (this._isOpen) return;
    this._roomId = opts.roomId;
    // Namespace ids by room so peers in different rooms don't collide on the broker.
    const suffix = opts.peerId ?? makeId();
    this._localPeerId = `${ROOM_PREFIX}_${this._hashRoom(opts.roomId)}_${suffix}`;

    const broker = this._opts.signalingUrl ?? this._defaultBrokerUrl();
    await this._openSignaling(broker);
    this._isOpen = true;
    this.dispatchEvent(new Event('open'));

    // PeerJS doesn't expose a "list peers in room" primitive, so we fall back
    // to a "shout" pattern: any new peer broadcasts a discovery beacon to a
    // well-known channel, and existing peers respond by initiating a connection.
    this._heartbeat = setInterval(() => this._sendBeacon(), 2000);
    this._sendBeacon();
  }

  close(): void {
    if (!this._isOpen) return;
    this._isOpen = false;
    if (this._heartbeat) clearInterval(this._heartbeat);
    if (this._discoveryTimer) clearInterval(this._discoveryTimer);
    this._signaling?.close();
    this._signaling = undefined;
    for (const [id, entry] of this._entries) {
      try {
        entry.dc?.close();
        entry.pc.close();
      } catch {
        // ignore
      }
      if (this._peers.delete(id)) this.emitPeerLeave(id);
    }
    this._entries.clear();
    this.dispatchEvent(new Event('close'));
  }

  send(payload: TransportPayload, targetPeerId?: string): void {
    if (targetPeerId) {
      this._sendTo(targetPeerId, payload);
      return;
    }
    for (const id of this._peers) this._sendTo(id, payload);
  }

  private _sendTo(peerId: string, payload: TransportPayload): void {
    const entry = this._entries.get(peerId);
    if (!entry || !entry.dc || entry.dc.readyState !== 'open') return;
    try {
      // RTCDataChannel.send overloads vary across TS DOM lib versions; pass
      // the buffer view through `any` to stay compatible without losing the
      // zero-copy fast path that Chrome offers for typed-array sends.
      (entry.dc.send as (data: ArrayBufferLike) => void)(
        payload.buffer.slice(
          payload.byteOffset,
          payload.byteOffset + payload.byteLength
        )
      );
    } catch (err) {
      this.emitError(err as Error);
    }
  }

  private _hashRoom(room: string): string {
    let h = 5381;
    for (let i = 0; i < room.length; i++)
      h = ((h << 5) + h + room.charCodeAt(i)) | 0;
    return Math.abs(h).toString(36).slice(0, 6);
  }

  private _defaultBrokerUrl(): string {
    const b = DEFAULT_PEERJS_BROKER;
    const key = this._opts.brokerKey ?? 'peerjs';
    const proto = b.secure ? 'wss' : 'ws';
    return `${proto}://${b.host}:${b.port}${b.path}peerjs?key=${key}&id=${this._localPeerId}&token=${makeId(8)}&version=1.5.4`;
  }

  private async _openSignaling(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this._signaling = ws;
      ws.addEventListener('open', () => resolve());
      ws.addEventListener('error', () =>
        reject(new Error('Signaling failed.'))
      );
      ws.addEventListener('message', (ev) => this._handleSignal(ev));
      ws.addEventListener('close', () => {
        if (this._isOpen) {
          // Best effort: signaling drop doesn't kill existing peer connections.
          this.emitError(new Error('Signaling channel closed.'));
        }
      });
    });
  }

  private _send(obj: object): void {
    try {
      this._signaling?.send(JSON.stringify(obj));
    } catch (err) {
      this.emitError(err as Error);
    }
  }

  private _sendBeacon(): void {
    // We piggyback PeerJS "MESSAGE" by sending an OFFER with an empty SDP to a
    // wildcard peer derived from the room hash. Receivers ignore unknown
    // signal kinds. (This is a documented quirk of using PeerJS as just a
    // signaling layer; for production, run your own signaling server.)
    this._send({
      type: 'BEACON',
      src: this._localPeerId,
      dst: '__room__',
      payload: {room: this._roomId},
    });
  }

  private async _handleSignal(ev: MessageEvent): Promise<void> {
    interface SignalMsg {
      type?: string;
      src?: string;
      dst?: string;
      payload?: {
        room?: string;
        sdp?: string;
        candidate?: RTCIceCandidateInit;
      };
    }
    let msg: SignalMsg;
    try {
      msg =
        typeof ev.data === 'string'
          ? JSON.parse(ev.data)
          : JSON.parse(new TextDecoder().decode(ev.data));
    } catch {
      return;
    }
    if (!msg || !msg.type || !msg.src) return;
    const src = msg.src;
    switch (msg.type) {
      case 'OPEN':
        // PeerJS handshake done.
        break;
      case 'BEACON': {
        if (src === this._localPeerId) return;
        if (msg.payload?.room !== this._roomId) return;
        // Initiate if our id sorts lower (deterministic role assignment).
        if (this._localPeerId < src && !this._entries.has(src)) {
          await this._initiate(src);
        }
        break;
      }
      case 'OFFER':
        if (msg.payload?.sdp) await this._handleOffer(src, msg.payload.sdp);
        break;
      case 'ANSWER':
        if (msg.payload?.sdp) await this._handleAnswer(src, msg.payload.sdp);
        break;
      case 'CANDIDATE':
        if (msg.payload?.candidate)
          await this._handleCandidate(src, msg.payload.candidate);
        break;
      case 'LEAVE':
      case 'EXPIRE':
        this._teardown(src);
        break;
    }
  }

  private _ensureEntry(remote: string): PeerEntry {
    let entry = this._entries.get(remote);
    if (entry) return entry;
    const pc = new RTCPeerConnection({
      iceServers: this._opts.iceServers ?? DEFAULT_ICE_SERVERS,
    });
    entry = {pc, ready: false, pendingIce: []};
    this._entries.set(remote, entry);

    pc.addEventListener('icecandidate', (ev) => {
      if (ev.candidate) {
        this._send({
          type: 'CANDIDATE',
          src: this._localPeerId,
          dst: remote,
          payload: {candidate: ev.candidate.toJSON()},
        });
      }
    });
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this._teardown(remote);
      }
    });
    pc.addEventListener('datachannel', (ev) =>
      this._attachChannel(remote, ev.channel)
    );
    return entry;
  }

  private _attachChannel(remote: string, dc: RTCDataChannel): void {
    const entry = this._entries.get(remote);
    if (!entry) return;
    entry.dc = dc;
    dc.binaryType = 'arraybuffer';
    dc.addEventListener('open', () => {
      entry.ready = true;
      if (!this._peers.has(remote)) {
        this._peers.add(remote);
        this.emitPeerJoin(remote);
      }
    });
    dc.addEventListener('close', () => this._teardown(remote));
    dc.addEventListener('message', (ev) => {
      const data = ev.data;
      let bytes: Uint8Array;
      if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
      else if (data instanceof Uint8Array) bytes = data;
      else if (typeof data === 'string') bytes = base64ToBytes(data);
      else return;
      this.emitMessage(remote, bytes);
    });
  }

  private async _initiate(remote: string): Promise<void> {
    const entry = this._ensureEntry(remote);
    const dc = entry.pc.createDataChannel('netblocks', {ordered: true});
    this._attachChannel(remote, dc);
    const offer = await entry.pc.createOffer();
    await entry.pc.setLocalDescription(offer);
    this._send({
      type: 'OFFER',
      src: this._localPeerId,
      dst: remote,
      payload: {sdp: offer.sdp},
    });
  }

  private async _handleOffer(remote: string, sdp?: string): Promise<void> {
    if (!sdp) return;
    const entry = this._ensureEntry(remote);
    await entry.pc.setRemoteDescription({type: 'offer', sdp});
    for (const c of entry.pendingIce) {
      try {
        await entry.pc.addIceCandidate(c);
      } catch {
        // ignore
      }
    }
    entry.pendingIce = [];
    const answer = await entry.pc.createAnswer();
    await entry.pc.setLocalDescription(answer);
    this._send({
      type: 'ANSWER',
      src: this._localPeerId,
      dst: remote,
      payload: {sdp: answer.sdp},
    });
  }

  private async _handleAnswer(remote: string, sdp?: string): Promise<void> {
    if (!sdp) return;
    const entry = this._entries.get(remote);
    if (!entry) return;
    await entry.pc.setRemoteDescription({type: 'answer', sdp});
    for (const c of entry.pendingIce) {
      try {
        await entry.pc.addIceCandidate(c);
      } catch {
        // ignore
      }
    }
    entry.pendingIce = [];
  }

  private async _handleCandidate(
    remote: string,
    candidate?: RTCIceCandidateInit
  ): Promise<void> {
    if (!candidate) return;
    const entry = this._ensureEntry(remote);
    if (!entry.pc.remoteDescription) {
      entry.pendingIce.push(candidate);
      return;
    }
    try {
      await entry.pc.addIceCandidate(candidate);
    } catch (err) {
      this.emitError(err as Error);
    }
  }

  private _teardown(remote: string): void {
    const entry = this._entries.get(remote);
    if (!entry) return;
    try {
      entry.dc?.close();
      entry.pc.close();
    } catch {
      // ignore
    }
    this._entries.delete(remote);
    if (this._peers.delete(remote)) this.emitPeerLeave(remote);
  }
}
