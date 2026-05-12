/**
 * NetCore: the public entry point for the netblocks addon. It mirrors the
 * shape of `UICore` from uiblocks: a single object you instantiate from
 * your root xrblocks Script, then call `joinRoom()` on to connect.
 *
 * Typical usage:
 *
 * ```ts
 * class App extends xb.Script {
 *   net = new NetCore(this);
 *   async init() {
 *     await this.net.joinRoom('demo', {
 *       transport: new BroadcastChannelTransport(),
 *       displayName: 'Alice',
 *     });
 *     this.net.session?.events.on('chat', (text) => console.log(text));
 *   }
 *   update(time, frame) {
 *     this.net.update(time, frame);
 *   }
 * }
 * ```
 *
 * NetCore is intentionally a single-room facade — you can hold multiple
 * sessions at once if you really need to, but in practice an XR app
 * almost always belongs to exactly one room at a time.
 */
import * as THREE from 'three';
import {NetSession, NetSessionOptions} from './NetSession';
import {Transport} from './transport/Transport';

export interface JoinRoomOptions extends NetSessionOptions {
  /** Required: the transport to use. */
  transport: Transport;
}

export class NetCore {
  /** The currently active session, or undefined when not joined. */
  session?: NetSession;

  private _root: THREE.Object3D;

  constructor(root: THREE.Object3D) {
    this._root = root;
  }

  /** Connect to a room with the given transport. Disposes any prior session. */
  async joinRoom(roomId: string, opts: JoinRoomOptions): Promise<NetSession> {
    if (this.session) this.leaveRoom();
    const {transport, ...sessionOpts} = opts;
    this.session = new NetSession(transport, this._root, sessionOpts);
    await this.session.open(roomId);
    return this.session;
  }

  /** Disconnect and clean up. */
  leaveRoom(): void {
    this.session?.close();
    this.session = undefined;
  }

  /** Per-frame tick. Call from your xb.Script's `update()`. */
  update(time?: number, frame?: XRFrame): void {
    this.session?.update(time, frame);
  }

  dispose(): void {
    this.leaveRoom();
  }
}
