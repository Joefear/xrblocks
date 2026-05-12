/**
 * NetObjectRegistry: stores NetObjects by their id and resolves ownership
 * conflicts. Operations are intentionally O(1) and synchronous — netblocks
 * runs this in the per-frame update loop.
 */
import {NetObject} from './NetObject';

export class NetObjectRegistry {
  private _byId = new Map<string, NetObject>();

  add(obj: NetObject): void {
    this._byId.set(obj.netId, obj);
  }

  remove(obj: NetObject): void {
    this._byId.delete(obj.netId);
  }

  get(id: string): NetObject | undefined {
    return this._byId.get(id);
  }

  has(id: string): boolean {
    return this._byId.has(id);
  }

  values(): IterableIterator<NetObject> {
    return this._byId.values();
  }

  /**
   * Apply a "claim" message: peer wants ownership. Returns true if the
   * registry granted the claim. Tie-breaks by preferring the
   * lexicographically smaller peer id when multiple peers race.
   */
  applyClaim(id: string, peerId: string): boolean {
    const obj = this._byId.get(id);
    if (!obj) return false;
    if (!obj.ownerId) {
      obj.ownerId = peerId;
      return true;
    }
    if (obj.ownerId === peerId) return true;
    if (peerId < obj.ownerId) {
      obj.ownerId = peerId;
      return true;
    }
    return false;
  }

  /** Apply a "release" — only the current owner may release. */
  applyRelease(id: string, peerId: string): boolean {
    const obj = this._byId.get(id);
    if (!obj) return false;
    if (obj.ownerId !== peerId) return false;
    obj.ownerId = '';
    return true;
  }

  /** When a peer leaves, drop their ownership claims so others can take over. */
  releaseOwnedBy(peerId: string): void {
    for (const obj of this._byId.values()) {
      if (obj.ownerId === peerId) obj.ownerId = '';
    }
  }
}
