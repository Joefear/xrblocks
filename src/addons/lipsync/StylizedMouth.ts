import * as THREE from 'three';

import type {VisemeWeights} from './BlendshapeReducer';

export interface StylizedMouthOptions {
  /**
   * Approximate radius (metres) of the host head this mouth attaches to.
   * Used to scale the mouth quad and place it at the head surface.
   * Defaults to 0.1, matching netblocks `RemoteUserAvatar`'s head sphere.
   */
  headRadius?: number;
  /** Square canvas dimension in pixels. Defaults to 256. */
  textureSize?: number;
}

export interface LipMetrics {
  /** Horizontal mouth width, normalised. Wider for /ee/, narrower for /oo/. */
  width: number;
  /** Vertical mouth opening, 0 (closed line) to ~1 (fully agape). */
  openHeight: number;
}

/**
 * StylizedMouth: a flat quad textured with a single soft-edged dark
 * ellipse that morphs from a thin "closed" line into a wider oval as
 * the host speaks. Deliberately minimal — the quad sits flush with the
 * front of the host head sphere and is anchored to the head's local
 * forward (-Z) so the mouth follows head orientation like a real face.
 *
 * The quad is positioned at local z = -headRadius * 1.001 so it lands
 * just outside the head sphere on the face side and never z-fights.
 */
export class StylizedMouth extends THREE.Object3D {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  readonly texture: THREE.CanvasTexture;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly headRadius: number;

  /** Last viseme weights applied; useful for testing and debugging. */
  visemes: VisemeWeights = {
    jawOpen: 0,
    aa: 0,
    oo: 0,
    oh: 0,
    ee: 0,
    consonant: 0,
  };

  /** Computed lip metrics from the most recent setVisemes call. */
  metrics: LipMetrics = {width: 1, openHeight: 0};

  constructor(opts: StylizedMouthOptions = {}) {
    super();
    this.headRadius = opts.headRadius ?? 0.1;
    const size = opts.textureSize ?? 256;

    this.canvas = document.createElement('canvas');
    this.canvas.width = size;
    this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d');

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;

    // Quad covers roughly the lower half of the host face.
    const planeSize = this.headRadius * 1.4;
    const geom = new THREE.PlaneGeometry(planeSize, planeSize);
    const mat = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geom, mat);
    // Flush with the head sphere on the face (-Z) side.
    this.mesh.position.z = -this.headRadius * 1.001;
    // PlaneGeometry's normal is +Z; rotate so it faces -Z (out the
    // front of the head) instead of into the sphere.
    this.mesh.rotation.y = Math.PI;
    this.add(this.mesh);

    this.setVisemes(this.visemes);
  }

  /**
   * Drive the mouth drawing from a viseme weight set. Cheap enough to
   * call every frame.
   */
  setVisemes(v: VisemeWeights): void {
    this.visemes = v;
    this.metrics = computeMetrics(v);
    this.drawMouth();
    this.texture.needsUpdate = true;
  }

  /** Free the texture, geometry, and material. */
  dispose(): void {
    this.texture.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }

  private drawMouth(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    const m = this.metrics;
    const cx = w / 2;
    const cy = h / 2;
    const halfW = w * 0.22 * m.width;
    // Small base height so the closed mouth is a thin line, growing
    // into an oval as the speaker opens up.
    const halfH = h * 0.012 + h * 0.13 * m.openHeight;

    ctx.fillStyle = '#1a0808';
    ctx.beginPath();
    ctx.ellipse(cx, cy, halfW, halfH, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function computeMetrics(v: VisemeWeights): LipMetrics {
  const openHeight = clamp(v.jawOpen * 0.9 + v.aa * 0.5 + v.oh * 0.5, 0, 1);
  const width = clamp(1 + v.ee * 0.45 - v.oo * 0.55 - v.oh * 0.2, 0.35, 1.4);
  return {width, openHeight};
}
