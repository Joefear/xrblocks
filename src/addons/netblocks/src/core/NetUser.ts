/**
 * NetUser: per-peer state owned by a NetSession. One NetUser exists for
 * every remote peer that has joined the room. The local user is *not*
 * represented as a NetUser — it lives in NetSession itself.
 *
 * NetUser is the public surface most apps interact with: read `avatar` to
 * place children in 3D space, read `lastSeenMs` to detect stale peers,
 * subscribe to `displayName` changes, etc.
 */
import {PeerCapabilities} from './codec/MessageCodec';
import {RemoteUserAvatar} from './presence/RemoteUserAvatar';

export class NetUser {
  readonly peerId: string;
  displayName?: string;
  capabilities: PeerCapabilities;
  /** Three.js avatar — also a child of `xb.core.scene` while the peer is connected. */
  readonly avatar: RemoteUserAvatar;
  /** Wall-clock ms of the last received message from this peer. */
  lastSeenMs: number;

  constructor(
    peerId: string,
    capabilities: PeerCapabilities,
    displayName?: string
  ) {
    this.peerId = peerId;
    this.displayName = displayName;
    this.capabilities = capabilities;
    this.lastSeenMs = performance.now();
    this.avatar = new RemoteUserAvatar({peerId, displayName});
  }

  dispose(): void {
    this.avatar.dispose();
    this.avatar.parent?.remove(this.avatar);
  }
}
