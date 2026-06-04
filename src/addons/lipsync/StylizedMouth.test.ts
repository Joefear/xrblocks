import {describe, it, expect} from 'vitest';

import {ZERO_VISEME} from './BlendshapeReducer';
import {StylizedMouth} from './StylizedMouth';

describe('StylizedMouth', () => {
  it('extends THREE.Object3D so it can be added under a head pivot', () => {
    const m = new StylizedMouth();
    expect(m.isObject3D).toBe(true);
  });

  it('rest pose: openHeight is ~0 and width is ~1', () => {
    const m = new StylizedMouth();
    m.setVisemes(ZERO_VISEME);
    expect(m.metrics.openHeight).toBeLessThan(0.02);
    expect(m.metrics.width).toBeGreaterThan(0.95);
    expect(m.metrics.width).toBeLessThan(1.05);
  });

  it('jawOpen drives openHeight upward', () => {
    const m = new StylizedMouth();
    m.setVisemes({...ZERO_VISEME, jawOpen: 1});
    expect(m.metrics.openHeight).toBeGreaterThan(0.6);
  });

  it('oo narrows width', () => {
    const m = new StylizedMouth();
    m.setVisemes(ZERO_VISEME);
    const restW = m.metrics.width;
    m.setVisemes({...ZERO_VISEME, oo: 1});
    expect(m.metrics.width).toBeLessThan(restW);
  });

  it('ee widens horizontal mouth', () => {
    const m = new StylizedMouth();
    m.setVisemes(ZERO_VISEME);
    const restW = m.metrics.width;
    m.setVisemes({...ZERO_VISEME, ee: 1});
    expect(m.metrics.width).toBeGreaterThan(restW);
  });

  it('quad sits flush with the head sphere surface on local -Z and faces outward', () => {
    const m = new StylizedMouth({headRadius: 0.12});
    expect(m.mesh.position.z).toBeLessThan(-0.12);
    expect(m.mesh.position.z).toBeGreaterThan(-0.13);
    // Rotated so the plane normal points along the head's -Z (face out)
    // instead of into the sphere.
    expect(m.mesh.rotation.y).toBeCloseTo(Math.PI, 5);
  });

  it('texture is marked dirty on every setVisemes call', () => {
    const m = new StylizedMouth();
    const v0 = m.texture.version;
    m.setVisemes({...ZERO_VISEME, jawOpen: 0.5});
    expect(m.texture.version).toBeGreaterThan(v0);
  });

  it('dispose() releases texture, geometry, and material', () => {
    const m = new StylizedMouth();
    const geom = m.mesh.geometry;
    const mat = m.mesh.material;
    const tex = m.texture;
    let geomDisposed = false;
    let matDisposed = false;
    let texDisposed = false;
    geom.addEventListener('dispose', () => (geomDisposed = true));
    (
      mat as {addEventListener: (e: string, cb: () => void) => void}
    ).addEventListener('dispose', () => (matDisposed = true));
    tex.addEventListener('dispose', () => (texDisposed = true));
    m.dispose();
    expect(geomDisposed).toBe(true);
    expect(matDisposed).toBe(true);
    expect(texDisposed).toBe(true);
  });
});
