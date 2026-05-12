/**
 * RemoteUserAvatar: a lightweight three.js Group that visualizes a remote
 * peer using a head sphere and two hand "stick" meshes (wrist sphere +
 * up-to-five fingertip dots). It renders nothing if no pose has arrived.
 *
 * The avatar is intentionally minimal — netblocks ships a baseline that
 * works in every sample, and apps can opt into richer avatars by hiding
 * the default mesh (`avatar.defaultMesh.visible = false`) and parenting
 * their own meshes to `avatar.headPivot` / `avatar.handPivots[h]`.
 */
import * as THREE from 'three';
import {InterpolatedPose} from './InterpolatedPose';
import {hashStringToHue} from '../utils/IdUtils';

const FINGERTIP_INDICES = [4, 9, 14, 19, 24]; // thumb-tip, index-tip, middle-tip, ring-tip, pinky-tip

export interface RemoteUserAvatarOptions {
  peerId: string;
  displayName?: string;
}

export class RemoteUserAvatar extends THREE.Group {
  readonly peerId: string;
  displayName?: string;

  /** Smoothed pose buffer fed by NetSession. */
  readonly pose = new InterpolatedPose();

  /** Per-peer color derived from peerId, used to tint the default avatar. */
  readonly color: THREE.Color;

  /**
   * Subgroups consumers can re-parent custom meshes under to follow the
   * remote head / hand pose without touching netblocks internals.
   */
  readonly headPivot = new THREE.Group();
  readonly handPivots: [THREE.Group, THREE.Group] = [
    new THREE.Group(),
    new THREE.Group(),
  ];

  /** The default ball-and-stick avatar group. Hide to use your own meshes. */
  readonly defaultMesh = new THREE.Group();

  private _headSphere: THREE.Mesh;
  private _handGroups: [THREE.Group, THREE.Group];
  private _wristSpheres: [THREE.Mesh, THREE.Mesh];
  private _fingertipDots: [THREE.Mesh[], THREE.Mesh[]];

  constructor(opts: RemoteUserAvatarOptions) {
    super();
    this.name = `RemoteUserAvatar(${opts.peerId})`;
    this.peerId = opts.peerId;
    this.displayName = opts.displayName;

    const hue = hashStringToHue(opts.peerId);
    this.color = new THREE.Color().setHSL(hue, 0.65, 0.55);

    this.add(this.headPivot, this.handPivots[0], this.handPivots[1]);

    // Build the default mesh.
    const headMat = new THREE.MeshStandardMaterial({
      color: this.color,
      roughness: 0.4,
      metalness: 0.1,
    });
    this._headSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 24, 16),
      headMat
    );
    this._headSphere.castShadow = false;

    const handMatA = new THREE.MeshStandardMaterial({
      color: this.color,
      roughness: 0.4,
    });
    const handMatB = new THREE.MeshStandardMaterial({
      color: this.color,
      roughness: 0.4,
    });
    const dotMat = new THREE.MeshBasicMaterial({color: this.color});

    this._wristSpheres = [
      new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 12), handMatA),
      new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 12), handMatB),
    ];
    this._handGroups = [new THREE.Group(), new THREE.Group()];
    this._fingertipDots = [[], []];
    for (let h = 0; h < 2; h++) {
      this._handGroups[h].add(this._wristSpheres[h]);
      for (let f = 0; f < FINGERTIP_INDICES.length; f++) {
        const dot = new THREE.Mesh(
          new THREE.SphereGeometry(0.01, 12, 8),
          dotMat
        );
        this._handGroups[h].add(dot);
        this._fingertipDots[h].push(dot);
      }
      this._handGroups[h].visible = false;
    }

    this.defaultMesh.add(
      this._headSphere,
      this._handGroups[0],
      this._handGroups[1]
    );
    this.add(this.defaultMesh);
    this._headSphere.visible = false; // until a pose arrives
  }

  /** Sample the smoothed pose at `now` and update the local meshes. */
  applyPose(nowMs: number): void {
    if (!this.pose.hasData) return;
    const snap = this.pose.sample(nowMs);

    this.headPivot.position.copy(snap.head.position);
    this.headPivot.quaternion.copy(snap.head.quaternion);
    this._headSphere.position.copy(snap.head.position);
    this._headSphere.quaternion.copy(snap.head.quaternion);
    this._headSphere.visible = true;

    for (let h = 0; h < 2; h++) {
      const hand = snap.hands[h];
      const pivot = this.handPivots[h];
      const grp = this._handGroups[h];
      if (!hand.present) {
        grp.visible = false;
        continue;
      }
      pivot.position.copy(hand.position);
      pivot.quaternion.copy(hand.quaternion);
      this._wristSpheres[h].position.copy(hand.position);
      this._wristSpheres[h].quaternion.copy(hand.quaternion);
      grp.visible = true;
      const joints = hand.joints;
      if (joints) {
        for (let f = 0; f < FINGERTIP_INDICES.length; f++) {
          const idx = FINGERTIP_INDICES[f];
          const j = joints[idx];
          if (j) this._fingertipDots[h][f].position.copy(j);
        }
      }
    }
  }

  dispose(): void {
    this._headSphere.geometry.dispose();
    (this._headSphere.material as THREE.Material).dispose();
    for (let h = 0; h < 2; h++) {
      this._wristSpheres[h].geometry.dispose();
      (this._wristSpheres[h].material as THREE.Material).dispose();
      for (const dot of this._fingertipDots[h]) {
        dot.geometry.dispose();
        (dot.material as THREE.Material).dispose();
      }
    }
  }
}
