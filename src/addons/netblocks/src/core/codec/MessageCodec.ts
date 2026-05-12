/**
 * Wire message types used by netblocks. Every frame on the wire is a tagged
 * union so that transports stay completely agnostic to payload shape.
 *
 * The protocol is intentionally simple JSON-over-bytes (encoded with
 * TextEncoder). The pose channel uses a binary subprotocol (see PoseCodec)
 * and is wrapped in a `pose` envelope so transports can still treat the frame
 * as opaque bytes.
 */
import {NET_PROTOCOL_VERSION} from '../constants/NetConstants';

export type NetMessage =
  | HelloMessage
  | WelcomeMessage
  | ByeMessage
  | PingMessage
  | PongMessage
  | PoseMessage
  | NetObjectMessage
  | NetObjectClaimMessage
  | NetObjectReleaseMessage
  | RpcMessage
  | VoiceSignalMessage;

export interface BaseMessage {
  /** Sender peer id. Filled in by the session before broadcast. */
  from?: string;
  /** Optional target peer id. If undefined, the message is broadcast. */
  to?: string;
  /** Wall-clock timestamp (ms) at the sender. */
  ts?: number;
}

export interface HelloMessage extends BaseMessage {
  type: 'hello';
  protocol: number;
  displayName?: string;
  capabilities: PeerCapabilities;
}

export interface WelcomeMessage extends BaseMessage {
  type: 'welcome';
  peers: Array<{
    id: string;
    displayName?: string;
    capabilities: PeerCapabilities;
  }>;
}

export interface ByeMessage extends BaseMessage {
  type: 'bye';
}

export interface PingMessage extends BaseMessage {
  type: 'ping';
  nonce: number;
}

export interface PongMessage extends BaseMessage {
  type: 'pong';
  nonce: number;
}

export interface PoseMessage extends BaseMessage {
  type: 'pose';
  /** Base64-encoded binary pose frame (see PoseCodec). */
  data: string;
}

export interface NetObjectMessage extends BaseMessage {
  type: 'netobject';
  id: string;
  /** Compact transform: [px, py, pz, qx, qy, qz, qw, sx, sy, sz]. */
  xform: number[];
  /** Optional small JSON state payload, capped by MAX_MESSAGE_BYTES. */
  state?: unknown;
}

export interface NetObjectClaimMessage extends BaseMessage {
  type: 'netobject.claim';
  id: string;
}

export interface NetObjectReleaseMessage extends BaseMessage {
  type: 'netobject.release';
  id: string;
}

export interface RpcMessage extends BaseMessage {
  type: 'rpc';
  topic: string;
  payload: unknown;
}

/** Out-of-band signaling for WebRTC voice streams over the data channel. */
export interface VoiceSignalMessage extends BaseMessage {
  type: 'voice';
  signal:
    | {kind: 'offer'; sdp: string}
    | {kind: 'answer'; sdp: string}
    | {kind: 'ice'; candidate: RTCIceCandidateInit};
}

export interface PeerCapabilities {
  pose: boolean;
  voice: boolean;
  netobject: boolean;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Encode a NetMessage as bytes. The on-the-wire format is JSON for the
 * envelope; pose payloads are pre-encoded as base64 inside `data`.
 */
export function encodeMessage(msg: NetMessage): Uint8Array {
  return encoder.encode(JSON.stringify(msg));
}

export function decodeMessage(
  data: Uint8Array | ArrayBuffer | string
): NetMessage {
  const text =
    typeof data === 'string'
      ? data
      : decoder.decode(
          data instanceof ArrayBuffer ? new Uint8Array(data) : data
        );
  const parsed = JSON.parse(text) as NetMessage;
  return parsed;
}

export function makeHello(
  displayName: string | undefined,
  capabilities: PeerCapabilities
): HelloMessage {
  return {
    type: 'hello',
    protocol: NET_PROTOCOL_VERSION,
    displayName,
    capabilities,
  };
}
