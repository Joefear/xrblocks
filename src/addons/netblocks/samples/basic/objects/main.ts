import * as THREE from 'three';
import * as xb from 'xrblocks';
import {BroadcastChannelTransport, NetObject} from 'netblocks';
import {NetSample} from '../../Sample';

/**
 * ObjectsSample.
 *
 * Spawns a single shared cube with a deterministic id (so all peers
 * agree on which cube is which). Click-and-drag with the mouse (or pinch
 * in XR) to grab; while grabbed, the local peer broadcasts ownership and
 * transform updates. Other tabs see the cube fly around in real time.
 */
class ObjectsSample extends NetSample {
  private _cube?: NetObject;
  private _grab?: {
    controller: THREE.Object3D;
    offset: THREE.Vector3;
    quat: THREE.Quaternion;
  };

  protected getJoinOptions() {
    return {
      roomId: 'netblocks-sample-objects',
      options: {
        transport: new BroadcastChannelTransport(),
        displayName: `User-${Math.floor(Math.random() * 1000)}`,
      },
    };
  }

  protected onSession(session: NonNullable<this['net']['session']>) {
    // Deterministic id ensures every tab shares the *same* cube.
    this._cube = session.createNetObject({id: 'shared-cube'});
    this._cube.position.set(0, 1.2, -1);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.18, 0.18),
      new THREE.MeshStandardMaterial({
        color: 0x9177c7,
        roughness: 0.3,
        metalness: 0.1,
      })
    );
    this._cube.add(mesh);

    // Wire pointer events for grab/release. We use xrblocks' input layer
    // so this works in both the desktop simulator and on-device XR.
    const controllers = (xb.core?.input?.controllers ?? []) as THREE.Object3D[];
    for (const c of controllers) {
      // 'selectstart' / 'selectend' are WebXR controller events not in the
      // generic Object3DEventMap typing; the runtime fires them on the same
      // EventTarget interface so we cast to satisfy TS.
      (c as unknown as EventTarget).addEventListener('selectstart', () =>
        this._tryGrab(c)
      );
      (c as unknown as EventTarget).addEventListener('selectend', () =>
        this._tryRelease()
      );
    }
  }

  private _tryGrab(controller: THREE.Object3D) {
    const session = this.net.session;
    if (!this._cube || !session) return;
    // Naive: only grab if the controller's pointer ray is within reach of the cube.
    const cubeWorld = new THREE.Vector3();
    this._cube.getWorldPosition(cubeWorld);
    const ctrlWorld = new THREE.Vector3();
    controller.getWorldPosition(ctrlWorld);
    if (cubeWorld.distanceTo(ctrlWorld) > 0.6) return;

    session.claim(this._cube);
    const offset = cubeWorld.clone().sub(ctrlWorld);
    const quat = this._cube.quaternion.clone();
    this._grab = {controller, offset, quat};
  }

  private _tryRelease() {
    if (!this._grab || !this._cube) return;
    this.net.session?.release(this._cube);
    this._grab = undefined;
  }

  update(time?: number, frame?: XRFrame) {
    super.update(time, frame);
    if (this._grab && this._cube) {
      const cw = new THREE.Vector3();
      this._grab.controller.getWorldPosition(cw);
      this._cube.position.copy(cw).add(this._grab.offset);
    }
  }
}

NetSample.run(ObjectsSample);
