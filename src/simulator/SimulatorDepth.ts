import * as THREE from 'three';

import {Depth} from '../depth/Depth';

import {SimulatorDepthMaterial} from './SimulatorDepthMaterial';
import {SimulatorScene} from './SimulatorScene';

export class SimulatorDepth {
  private renderer!: THREE.WebGLRenderer;
  private camera!: THREE.Camera;
  private depth!: Depth;
  depthWidth = 160;
  depthHeight = 160;
  depthBufferSlice = new Float32Array();
  depthMaterial!: SimulatorDepthMaterial;
  depthRenderTarget!: THREE.WebGLRenderTarget;
  depthBuffer!: Float32Array;

  depthCamera!: THREE.Camera;
  /**
   * If true, copies the rendering camera's projection matrix each frame.
   */
  autoUpdateDepthCameraProjection = true;
  /**
   * If true, copies the rendering camera's transform each frame.
   */
  autoUpdateDepthCameraTransform = true;

  private projectionMatrixArray = new Float32Array(16);

  // Throttle state. The depth pass is expensive (a full scene render to
  // a 160x160 render target + a getRenderTargetPixelsAsync readback that
  // burns several ms of main-thread time per call on desktop). We
  // therefore:
  //   1. Don't queue a new updateDepth while the previous async pass is
  //      still in flight. Without this guard simulatorUpdate fires one
  //      promise per frame and the readback fence polling stacks up.
  //   2. Skip the pass entirely (no render + no readback) when the depth
  //      camera hasn't moved or rotated meaningfully since the last
  //      completed update. A static desktop scene therefore computes
  //      depth once on first frame and again only when the user drags.
  private updateInFlight = false;
  private lastDepthPos = new THREE.Vector3(NaN, NaN, NaN);
  private lastDepthQuat = new THREE.Quaternion(NaN, NaN, NaN, NaN);
  /**
   * Translation (m) and rotation (rad) thresholds below which the depth
   * pass is skipped. Tuned for desktop sim: 1 cm and ~0.5 deg keep depth
   * crisp during a drag without firing on JS-numerical noise.
   */
  motionPositionEpsilon = 0.01;
  motionRotationEpsilon = 0.01;

  constructor(private simulatorScene: SimulatorScene) {}

  /**
   * Initialize Simulator Depth.
   */
  init(renderer: THREE.WebGLRenderer, camera: THREE.Camera, depth: Depth) {
    this.renderer = renderer;
    this.camera = camera;
    this.depth = depth;

    if (this.camera instanceof THREE.PerspectiveCamera) {
      this.depthCamera = new THREE.PerspectiveCamera();
    } else if (this.camera instanceof THREE.OrthographicCamera) {
      this.depthCamera = new THREE.OrthographicCamera();
    } else {
      throw new Error('Unknown camera type');
    }
    this.depthCamera.copy(this.camera, /*recursive=*/ false);
    this.createRenderTarget();
    this.depthMaterial = new SimulatorDepthMaterial();
  }

  createRenderTarget() {
    this.depthRenderTarget = new THREE.WebGLRenderTarget(
      this.depthWidth,
      this.depthHeight,
      {
        format: THREE.RedFormat,
        type: THREE.FloatType,
      }
    );
    this.depthBuffer = new Float32Array(this.depthWidth * this.depthHeight);
  }

  update() {
    this.updateDepthCamera();
    // Skip both the render-to-target and the readback when an earlier
    // updateDepth() is still resolving its readback fence. We'd just
    // race ourselves and stack up promises.
    if (this.updateInFlight) return;
    // Skip when the depth camera hasn't meaningfully changed since the
    // last completed update. depthHasChanged uses configurable
    // translation + rotation epsilons so JS-numerical noise on a held
    // camera doesn't force a needless pass.
    if (!this.depthHasChanged()) return;
    this.lastDepthPos.copy(this.depthCamera.position);
    this.lastDepthQuat.copy(this.depthCamera.quaternion);
    this.renderDepthScene();
    this.updateInFlight = true;
    this.updateDepth().finally(() => {
      this.updateInFlight = false;
    });
  }

  private depthHasChanged(): boolean {
    // Force the first update through (lastDepthPos seeded with NaN).
    if (Number.isNaN(this.lastDepthPos.x)) return true;
    const dpos = this.depthCamera.position.distanceTo(this.lastDepthPos);
    if (dpos > this.motionPositionEpsilon) return true;
    // Quaternion angleTo gives radians between two orientations.
    const dquat = this.depthCamera.quaternion.angleTo(this.lastDepthQuat);
    return dquat > this.motionRotationEpsilon;
  }

  private updateDepthCamera() {
    const renderingCamera = this.camera;
    const depthCamera = this.depthCamera;
    if (this.autoUpdateDepthCameraProjection) {
      depthCamera.projectionMatrix.copy(renderingCamera.projectionMatrix);
      depthCamera.projectionMatrixInverse.copy(
        renderingCamera.projectionMatrixInverse
      );
    }
    if (this.autoUpdateDepthCameraTransform) {
      depthCamera.position.copy(renderingCamera.position);
      depthCamera.rotation.order = renderingCamera.rotation.order;
      depthCamera.quaternion.copy(renderingCamera.quaternion);
      depthCamera.scale.copy(renderingCamera.scale);
      depthCamera.matrix.copy(renderingCamera.matrix);
      depthCamera.matrixWorld.copy(renderingCamera.matrixWorld);
      depthCamera.matrixWorldInverse.copy(renderingCamera.matrixWorldInverse);
    }
  }

  private renderDepthScene() {
    const originalRenderTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.depthRenderTarget);
    this.simulatorScene.overrideMaterial = this.depthMaterial;
    this.renderer.render(this.simulatorScene, this.depthCamera);
    this.simulatorScene.overrideMaterial = null;
    this.renderer.setRenderTarget(originalRenderTarget);
  }

  private async updateDepth() {
    // We preventively unbind the PIXEL_PACK_BUFFER before reading from the
    // render target in case external libraries (Spark.js) left it bound.
    const context = this.renderer.getContext() as WebGL2RenderingContext;
    context.bindBuffer(context.PIXEL_PACK_BUFFER, null);

    // Cache the projection matrix and transform of the rendered depth.
    const projectionMatrix = this.depthCamera.projectionMatrix.clone();
    const transform = new XRRigidTransform(
      this.depthCamera.position,
      this.depthCamera.quaternion
    );
    await this.renderer.readRenderTargetPixelsAsync(
      this.depthRenderTarget,
      0,
      0,
      this.depthWidth,
      this.depthHeight,
      this.depthBuffer
    );

    // Flip the depth buffer.
    if (this.depthBufferSlice.length != this.depthWidth) {
      this.depthBufferSlice = new Float32Array(this.depthWidth);
    }
    for (let i = 0; i < this.depthHeight / 2; ++i) {
      const j = this.depthHeight - 1 - i;
      const i_offset = i * this.depthWidth;
      const j_offset = j * this.depthWidth;

      // Copy row i to a temp slice
      this.depthBufferSlice.set(
        this.depthBuffer.subarray(i_offset, i_offset + this.depthWidth)
      );
      // Copy row j to row i
      this.depthBuffer.copyWithin(
        i_offset,
        j_offset,
        j_offset + this.depthWidth
      );
      // Copy the temp slice (original row i) to row j
      this.depthBuffer.set(this.depthBufferSlice, j_offset);
    }

    projectionMatrix.toArray(this.projectionMatrixArray);
    const depthData = {
      width: this.depthWidth,
      height: this.depthHeight,
      data: this.depthBuffer.buffer,
      rawValueToMeters: 1.0,
      projectionMatrix: this.projectionMatrixArray,
      transform: transform,
    };

    this.depth.updateCPUDepthData(
      depthData as XRCPUDepthInformation,
      0,
      'float32'
    );
  }
}
