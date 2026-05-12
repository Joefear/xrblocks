import * as xb from 'xrblocks';
import 'xrblocks/addons/simulator/SimulatorAddons.js';
import {NetCore, JoinRoomOptions} from 'netblocks';

/**
 * Base class for netblocks samples. Wires up an xrblocks app, exposes a
 * NetCore on `this.net`, and forwards `update()` so sample subclasses
 * never have to remember to drive the network tick.
 *
 * Subclasses implement `getJoinOptions()` to choose a transport and
 * `onSession(session)` to attach app-level listeners.
 */
export abstract class NetSample extends xb.Script {
  net: NetCore;

  constructor() {
    super();
    this.net = new NetCore(this);
  }

  /** Return the room name + transport. Called once during `init`. */
  protected abstract getJoinOptions(): {
    roomId: string;
    options: JoinRoomOptions;
  };

  /** Called after `joinRoom` resolves. Override to attach handlers. */
  protected onSession(_session: NonNullable<NetCore['session']>): void {}

  async init() {
    const {roomId, options} = this.getJoinOptions();
    try {
      const session = await this.net.joinRoom(roomId, options);
      this.onSession(session);
    } catch (err) {
      console.error('[netblocks/sample] failed to join room:', err);
    }
  }

  update(time?: number, frame?: XRFrame) {
    this.net.update(time, frame);
  }

  static run<T extends NetSample>(ctor: new () => T) {
    document.addEventListener('DOMContentLoaded', async () => {
      const options = new xb.Options();
      options.enableUI();
      options.reticles.enabled = true;
      options.controllers.visualizeRays = false;
      options.simulator.instructions.enabled = false;
      const app = new ctor();
      xb.add(app);
      await xb.init(options);
    });
  }
}
