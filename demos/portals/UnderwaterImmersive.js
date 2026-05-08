import * as THREE from 'three';

const SPHERE_RADIUS = 50;

/**
 * Full-surround deep ocean for "walk-in" mode.
 * Inverted sphere: surface caustics + sunbeams up top, marine snow + abyss
 * below, drifting jellyfish and a passing whale shark in mid-water,
 * rising bubble columns.
 */
export class UnderwaterImmersive extends THREE.Object3D {
  constructor() {
    super();
    this._time = 0;
    this._buildSphere();
  }

  show(portalWorldMatrix) {
    this._entryMatrix = portalWorldMatrix.clone();
    this._entryMatrixInv = portalWorldMatrix.clone().invert();
    this.visible = true;
  }

  hide() {
    this.visible = false;
  }

  update(dt, camera) {
    if (!this.visible) return;
    this._time += dt;

    const mat = this._sphere.material;
    mat.uniforms.uTime.value = this._time;

    if (camera) {
      const camWorld = camera.getWorldPosition(new THREE.Vector3());
      const camLocal = camWorld.clone().applyMatrix4(this._entryMatrixInv);
      mat.uniforms.uCamLocal.value.copy(camLocal);

      const portalQuat = new THREE.Quaternion().setFromRotationMatrix(
        this._entryMatrix
      );
      const portalQuatInv = portalQuat.clone().invert();
      const rotMat4 = new THREE.Matrix4().makeRotationFromQuaternion(
        portalQuatInv
      );
      mat.uniforms.uViewRotation.value.setFromMatrix4(rotMat4);
    }

    if (camera) {
      camera.getWorldPosition(this.position);
    }
  }

  _buildSphere() {
    const geom = new THREE.SphereGeometry(SPHERE_RADIUS, 64, 32);

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: {value: 0},
        uCamLocal: {value: new THREE.Vector3(0, 0, 1.6)},
        uViewRotation: {value: new THREE.Matrix3()},
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldDir;
        void main() {
          vWorldDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uTime;
        uniform vec3 uCamLocal;
        uniform mat3 uViewRotation;
        varying vec3 vWorldDir;

        float hash(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }
        float hash3(vec3 p) {
          p = fract(p * vec3(123.34, 456.21, 789.53));
          p += dot(p, p.yzx + 45.32);
          return fract(p.x * p.y * p.z);
        }
        float noise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p);
          float a = hash(i); float b = hash(i + vec2(1,0));
          float c = hash(i + vec2(0,1)); float d = hash(i + vec2(1,1));
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x)
                                + (d - b) * u.x * u.y;
        }
        float noise3(vec3 p) {
          vec3 i = floor(p); vec3 f = fract(p);
          vec3 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(mix(hash3(i), hash3(i + vec3(1,0,0)), u.x),
                mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), u.x), u.y),
            mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), u.x),
                mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), u.x), u.y),
            u.z);
        }
        float fbm(vec2 p) {
          float v = 0.0; float a = 0.5;
          for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.07; a *= 0.5; }
          return v;
        }
        float fbm3(vec3 p) {
          float v = 0.0; float a = 0.5;
          for (int i = 0; i < 4; i++) { v += a * noise3(p); p *= 2.07; a *= 0.5; }
          return v;
        }

        // Voronoi-ish caustic pattern at world position xz.
        float caustic(vec2 uv, float t) {
          vec2 p = uv * 0.6;
          float v = 0.0;
          for (int i = 0; i < 3; i++) {
            float fi = float(i);
            v += sin(p.x * (1.0 + fi * 0.4) + t * (0.7 + fi * 0.2))
               * sin(p.y * (1.3 + fi * 0.3) + t * (0.9 - fi * 0.15));
          }
          return pow(max(v * 0.33 + 0.5, 0.0), 2.5);
        }

        float raySphere(vec3 ro, vec3 rd, vec3 c, float rad) {
          vec3 oc = ro - c;
          float b = dot(oc, rd);
          float d = b * b - (dot(oc, oc) - rad * rad);
          if (d < 0.0) return -1.0;
          return -b - sqrt(d);
        }

        // Drifting jellyfish: ellipsoidal bell + faint trailing tendrils.
        // Returns additive color contribution along the ray.
        vec3 jellyfish(vec3 ro, vec3 rd, vec3 pos, float t, float seed) {
          vec3 oc = pos - ro;
          float along = dot(oc, rd);
          if (along < 0.5 || along > 25.0) return vec3(0.0);
          vec3 proj = ro + rd * along;
          float d = length(pos - proj);
          float bellR = 0.5 + 0.1 * sin(t * 1.2 + seed * 7.0);
          float bell = smoothstep(bellR, 0.0, d) * 0.55;
          // Glow halo
          float halo = smoothstep(bellR * 3.0, bellR, d) * 0.18;
          float fade = 1.0 / (1.0 + along * 0.08);
          vec3 color = mix(vec3(0.4, 0.85, 1.0), vec3(0.85, 0.55, 1.0),
                           sin(t + seed) * 0.5 + 0.5);
          return color * (bell + halo) * fade;
        }

        // Whale shark silhouette swimming past: oriented body, falls dim.
        vec3 whaleShark(vec3 ro, vec3 rd, float t) {
          // Position: slow horizontal arc across the user's view.
          float phase = t * 0.04;
          vec3 pos = vec3(sin(phase) * 18.0, -3.0 + sin(t * 0.1) * 0.5,
                          cos(phase) * 18.0 - 4.0);
          vec3 oc = pos - ro;
          float along = dot(oc, rd);
          if (along < 1.0 || along > 40.0) return vec3(0.0);
          vec3 proj = ro + rd * along;
          vec3 d = pos - proj;
          // Stretched ellipsoid: longer along forward of motion.
          vec3 fwd = vec3(cos(phase), 0.0, -sin(phase));
          float along2 = dot(d, fwd);
          vec3 perp = d - fwd * along2;
          // Body shape
          float body = smoothstep(0.6, 0.0, length(vec2(along2 / 4.0, length(perp))));
          // Tail wedge
          float tail = smoothstep(0.6, 0.0, length(vec2((along2 - 4.0) / 1.5, length(perp) * 2.0)));
          float silhouette = max(body, tail * 0.7);
          float fade = 1.0 / (1.0 + along * 0.05);
          // Dark grey with subtle white spots.
          vec3 spot = vec3(noise(perp.xy * 6.0 + along2));
          vec3 bodyCol = mix(vec3(0.06, 0.10, 0.14), vec3(0.18, 0.25, 0.30), spot.r);
          return bodyCol * silhouette * fade;
        }

        // Rising bubble columns: vertical streams at hashed xz positions.
        vec3 bubbles(vec3 ro, vec3 rd, float t) {
          vec3 col = vec3(0.0);
          for (int i = 0; i < 8; i++) {
            float fi = float(i);
            float seed = fi * 13.7;
            // Column base at fixed xz.
            vec2 base = vec2(sin(seed) * 8.0 + cos(seed * 1.3) * 4.0,
                             cos(seed * 0.7) * 8.0 + sin(seed * 1.1) * 4.0);
            // Bubble height: cycles upward over time.
            float bh = mod(t * 1.5 + seed * 3.0, 6.0) - 1.0;
            vec3 pos = vec3(base.x + sin(bh + seed) * 0.15,
                            -2.5 + bh,
                            base.y + cos(bh + seed) * 0.15);
            vec3 oc = pos - ro;
            float along = dot(oc, rd);
            if (along < 0.3 || along > 20.0) continue;
            vec3 proj = ro + rd * along;
            float d = length(pos - proj);
            float r = 0.05 + 0.02 * sin(bh * 4.0 + seed);
            float bubble = smoothstep(r, 0.0, d) * 0.4;
            float fade = 1.0 / (1.0 + along * 0.15);
            col += vec3(0.85, 0.95, 1.00) * bubble * fade;
          }
          return col;
        }

        // Marine snow: fine particles drifting downward.
        float marineSnow(vec3 ro, vec3 rd, float t) {
          float v = 0.0;
          for (int i = 0; i < 16; i++) {
            float fi = float(i);
            float seed = fi * 7.13;
            float along = mix(2.0, 18.0, fract(seed * 0.37));
            vec3 sample_p = ro + rd * along;
            // Slow drift downward.
            sample_p.y += t * 0.3 + seed;
            vec3 cell = floor(sample_p * 1.5);
            vec3 fc = fract(sample_p * 1.5);
            float h = hash3(cell);
            if (h > 0.985) {
              float d = length(fc - 0.5);
              v += smoothstep(0.05, 0.0, d) * 0.4 / (1.0 + along * 0.3);
            }
          }
          return v;
        }

        // Sunbeam shafts from above: density along ray scales by surface
        // brightness at sample points.
        float sunbeams(vec3 ro, vec3 rd, float t) {
          if (rd.y < 0.05) return 0.0;
          // Step along ray from the user up toward the surface (y=8).
          float density = 0.0;
          float surfaceY = 8.0;
          for (int i = 1; i <= 12; i++) {
            float fi = float(i);
            float along = fi * 0.7;
            vec3 sample_p = ro + rd * along;
            // Closer to surface = brighter.
            float depthFactor = clamp(sample_p.y / surfaceY, 0.0, 1.0);
            // Caustic-modulated brightness.
            float c = caustic(sample_p.xz, t);
            density += c * depthFactor * 0.05;
          }
          // Vertical bias: stronger when looking up.
          density *= pow(max(rd.y, 0.0), 0.6);
          return density;
        }

        void main() {
          vec3 rd = normalize(uViewRotation * vWorldDir);
          vec3 ro = uCamLocal;

          // ---- Vertical depth gradient ----
          // Above eye = brighter (toward surface), below = abyss.
          float t = uTime;
          vec3 surfaceCol = vec3(0.20, 0.65, 0.85);
          vec3 midCol = vec3(0.05, 0.30, 0.55);
          vec3 abyssCol = vec3(0.005, 0.020, 0.075);
          float depthT = clamp(rd.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 col = mix(abyssCol, midCol, smoothstep(0.25, 0.55, depthT));
          col = mix(col, surfaceCol, smoothstep(0.55, 0.95, depthT));

          // ---- Surface caustics when looking up ----
          if (rd.y > 0.3) {
            // Project ray to a plane at y = surface.
            float surfaceY = 8.0;
            float kt = (surfaceY - ro.y) / rd.y;
            if (kt > 0.0) {
              vec3 sp = ro + rd * kt;
              float c = caustic(sp.xz, t);
              col = mix(col, vec3(0.95, 1.00, 0.75),
                        c * smoothstep(0.3, 0.95, rd.y) * 0.55);
              // Sun disc through surface.
              vec3 sunDir = normalize(vec3(0.2, 1.0, -0.3));
              float sa = max(dot(rd, sunDir), 0.0);
              col += vec3(1.00, 0.95, 0.75)
                   * smoothstep(0.965, 0.995, sa) * 0.9;
              col += vec3(1.00, 0.95, 0.75)
                   * smoothstep(0.85, 1.0, sa) * 0.25;
            }
          }

          // ---- Sunbeam shafts (volumetric) ----
          float beams = sunbeams(ro, rd, t);
          col += vec3(0.80, 0.95, 1.00) * beams * 1.4;

          // ---- Distant ground (ocean floor) ----
          if (rd.y < -0.1) {
            float gt = -ro.y - 6.0;
            float t2 = gt / rd.y;
            if (t2 > 0.0 && t2 < 80.0) {
              vec3 gp = ro + rd * t2;
              float gn = fbm(gp.xz * 0.15);
              vec3 ground = mix(vec3(0.05, 0.10, 0.12),
                                vec3(0.10, 0.18, 0.20), gn);
              float fog = smoothstep(0.0, 35.0, t2);
              col = mix(ground, col, fog);
            }
          }

          // ---- Drifting jellyfish (animated 3D positions) ----
          for (int i = 0; i < 5; i++) {
            float fi = float(i);
            float seed = fi * 11.3;
            vec3 jp = vec3(
              sin(t * 0.2 + seed) * 5.0 + cos(seed * 1.7) * 3.0,
              0.5 + sin(t * 0.3 + seed * 0.7) * 2.0,
              cos(t * 0.25 + seed) * 5.0 + sin(seed * 0.9) * 3.0);
            col += jellyfish(ro, rd, jp, t, seed);
          }

          // ---- Whale shark passing ----
          col += whaleShark(ro, rd, t);

          // ---- Rising bubble columns ----
          col += bubbles(ro, rd, t);

          // ---- Marine snow ----
          col += vec3(0.95, 0.98, 1.00) * marineSnow(ro, rd, t);

          // ---- Distance haze (blue scattering) ----
          // Simulate water absorption by mixing toward the depth color
          // based on view-distance estimate (use ray length to 50m).
          float haze = 0.55;
          col = mix(col, midCol, haze * 0.25);

          // Tone-map.
          col = col / (col + vec3(1.0));
          col = pow(col, vec3(0.85));

          gl_FragColor = vec4(col, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
    });

    this._sphere = new THREE.Mesh(geom, mat);
    this._sphere.renderOrder = -100;
    this._sphere.frustumCulled = false;
    this._sphere.raycast = () => {};
    this.add(this._sphere);
    this.visible = false;
  }
}
