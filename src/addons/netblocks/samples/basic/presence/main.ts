import * as THREE from 'three';
import {BroadcastChannelTransport} from 'netblocks';
import {NetSample} from '../../Sample';

/**
 * PresenceSample.
 *
 * The simplest possible netblocks demo: join a room and watch other peers'
 * heads + hands appear as default avatars. Open this page in two tabs to
 * see yourself across both — the head spheres render the simulator camera
 * pose, and any hand joints reported by WebXR appear as fingertip dots.
 */
class PresenceSample extends NetSample {
  protected getJoinOptions() {
    return {
      roomId: 'netblocks-sample-presence',
      options: {
        transport: new BroadcastChannelTransport(),
        displayName: `User-${Math.floor(Math.random() * 1000)}`,
      },
    };
  }

  protected onSession(session: NonNullable<this['net']['session']>) {
    // Add a simple ambient hemisphere light + a floor disc so remote avatars
    // are visible without needing the simulator's debug visualizations.
    this.add(new THREE.HemisphereLight(0xffffff, 0x202030, 1.0));

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(2, 48),
      new THREE.MeshStandardMaterial({color: 0x303040, roughness: 0.9})
    );
    floor.rotation.x = -Math.PI / 2;
    this.add(floor);

    session.addEventListener('user-join', (e) => {
      const user = (e as CustomEvent).detail.user;
      console.log(
        `[presence] user joined: ${user.peerId} (${user.displayName ?? '?'})`
      );
    });
    session.addEventListener('user-leave', (e) => {
      const user = (e as CustomEvent).detail.user;
      console.log(`[presence] user left: ${user.peerId}`);
    });
  }
}

NetSample.run(PresenceSample);
