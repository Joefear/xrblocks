/**
 * NetObject: an Object3D wrapper whose transform is replicated to all other
 * peers on a fixed cadence. The peer that *creates* the NetObject becomes
 * its initial owner; other peers may "claim" it (e.g., when grabbed) by
 * calling `claim()`. The current owner is the only peer that broadcasts
 * authoritative transform updates; non-owners interpolate.
 *
 * Ownership is cooperative — there is no central arbiter, so two peers can
 * race to claim. We resolve races deterministically by preferring the lower
 * peer id (lex sort) on conflict.
 *
 * NetObjects are normal three.js Object3Ds; you can `.add()` any meshes to
 * them. Each frame, NetSession applies remote updates to the local
 * transform if we don't currently own the object.
 */
import * as THREE from 'three';

export interface NetObjectOptions {
  /** Stable id for this object across peers. Defaults to a fresh random id. */
  id?: string;
  /** Initial owner peer id. NetSession sets this to the local peer id when the object is created locally. */
  ownerId?: string;
  /** Broadcast frequency override (Hz). */
  hz?: number;
}

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

export class NetObject extends THREE.Group {
  readonly netId: string;
  ownerId: string;
  hz?: number;

  /** Local-only state object that consumers can populate; sent alongside transforms. */
  state: Record<string, unknown> = {};

  /** Last-applied remote transform (used by NetSession for interpolation). */
  _targetPosition = new THREE.Vector3();
  _targetQuaternion = new THREE.Quaternion();
  _targetScale = new THREE.Vector3(1, 1, 1);
  _hasTarget = false;
  _lastSendMs = 0;

  constructor(opts: NetObjectOptions = {}) {
    super();
    this.netId = opts.id ?? `obj_${Math.random().toString(36).slice(2, 10)}`;
    this.ownerId = opts.ownerId ?? '';
    this.hz = opts.hz;
    this.name = `NetObject(${this.netId})`;
  }

  /** True if the local peer currently owns this object. */
  isOwnedBy(peerId: string): boolean {
    return this.ownerId === peerId;
  }

  /**
   * Snapshot the current local transform to a 10-element array suitable
   * for inclusion in a NetObjectMessage.
   */
  toXform(): number[] {
    this.matrixWorld.decompose(_v, _q, _s);
    return [_v.x, _v.y, _v.z, _q.x, _q.y, _q.z, _q.w, _s.x, _s.y, _s.z];
  }

  /** Replace the target transform from a wire xform array. */
  setTargetXform(x: number[]): void {
    this._targetPosition.set(x[0], x[1], x[2]);
    this._targetQuaternion.set(x[3], x[4], x[5], x[6]);
    this._targetScale.set(x[7], x[8], x[9]);
    this._hasTarget = true;
  }

  /**
   * Smoothly drive the local transform toward the target. Called by
   * NetSession on non-owner peers. `t` is the per-frame lerp coefficient
   * (typically dt * 12).
   */
  stepInterpolation(t: number): void {
    if (!this._hasTarget) return;
    this.position.lerp(this._targetPosition, Math.min(1, t));
    this.quaternion.slerp(this._targetQuaternion, Math.min(1, t));
    this.scale.lerp(this._targetScale, Math.min(1, t));
  }
}
