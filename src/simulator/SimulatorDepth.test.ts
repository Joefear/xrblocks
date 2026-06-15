import * as THREE from 'three';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {SimulatorDepth} from './SimulatorDepth';

// SimulatorDepth's update() does three things:
//   1. Skip when an earlier async readback hasn't resolved yet
//      (`updateInFlight`).
//   2. Skip when the depth camera hasn't moved beyond the configured
//      epsilons (`depthHasChanged`).
//   3. Render the depth scene + start the async readback otherwise.
//
// These tests focus on the throttle logic. The actual WebGL render and
// readback pipeline is mocked away so we don't need a real renderer.

function makeMockRenderer() {
  // Async pixel readback returns a promise we can settle from the test.
  let resolveReadback: (() => void) | null = null;
  const renderer = {
    render: vi.fn(),
    setRenderTarget: vi.fn(),
    getRenderTarget: vi.fn().mockReturnValue(null),
    readRenderTargetPixelsAsync: vi.fn(() => {
      return new Promise<void>((res) => {
        resolveReadback = res;
      });
    }),
    getContext: vi.fn(() => ({
      bindBuffer: vi.fn(),
      PIXEL_PACK_BUFFER: 0x88eb,
    })),
  };
  return {
    renderer,
    settleReadback: () => {
      const r = resolveReadback;
      resolveReadback = null;
      r?.();
    },
    pendingReadback: () => resolveReadback !== null,
  };
}

function makeMockScene() {
  return {overrideMaterial: null} as never;
}

function makeMockDepth() {
  return {
    updateCPUDepthData: vi.fn(),
  } as never;
}

describe('SimulatorDepth.update throttle', () => {
  let depthSim: SimulatorDepth;
  let renderer: ReturnType<typeof makeMockRenderer>;

  beforeEach(() => {
    // jsdom doesn't ship XRRigidTransform; the readback path constructs
    // one so stub it before init.
    (globalThis as unknown as {XRRigidTransform: unknown}).XRRigidTransform =
      class {
        constructor(
          public position: unknown,
          public orientation: unknown
        ) {}
      };
    renderer = makeMockRenderer();
    const scene = makeMockScene();
    const camera = new THREE.PerspectiveCamera();
    depthSim = new SimulatorDepth(scene);
    depthSim.init(
      renderer.renderer as unknown as THREE.WebGLRenderer,
      camera,
      makeMockDepth()
    );
  });

  it('renders the depth scene on the first update so a static scene gets a depth pass', () => {
    depthSim.update();
    expect(renderer.renderer.render).toHaveBeenCalledTimes(1);
    expect(renderer.renderer.readRenderTargetPixelsAsync).toHaveBeenCalledTimes(
      1
    );
  });

  it('skips render + readback when the camera has not moved since the last completed update', async () => {
    depthSim.update();
    renderer.settleReadback();
    await Promise.resolve();
    await Promise.resolve();
    depthSim.update();
    depthSim.update();
    expect(renderer.renderer.render).toHaveBeenCalledTimes(1);
    expect(renderer.renderer.readRenderTargetPixelsAsync).toHaveBeenCalledTimes(
      1
    );
  });

  it('re-runs the depth pass when the camera translates beyond motionPositionEpsilon', async () => {
    depthSim.update();
    renderer.settleReadback();
    await Promise.resolve();
    await Promise.resolve();
    // Disable the auto-copy so our manual move sticks past
    // updateDepthCamera() inside update().
    depthSim.autoUpdateDepthCameraTransform = false;
    depthSim.depthCamera.position.x += 0.02;
    depthSim.update();
    expect(renderer.renderer.render).toHaveBeenCalledTimes(2);
  });

  it('re-runs the depth pass when the camera rotates beyond motionRotationEpsilon', async () => {
    depthSim.update();
    renderer.settleReadback();
    await Promise.resolve();
    await Promise.resolve();
    depthSim.autoUpdateDepthCameraTransform = false;
    // Rotate 5 deg about y, well above the ~0.5 deg default.
    depthSim.depthCamera.quaternion.setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      (5 * Math.PI) / 180
    );
    depthSim.update();
    expect(renderer.renderer.render).toHaveBeenCalledTimes(2);
  });

  it('does NOT queue a second readback while an earlier one is still in flight', () => {
    depthSim.update();
    expect(renderer.pendingReadback()).toBe(true);
    // Move beyond the epsilon so the motion gate would otherwise pass.
    depthSim.depthCamera.position.x += 0.05;
    depthSim.update();
    // Render + readback still at 1 because the inflight guard kicked in.
    expect(renderer.renderer.render).toHaveBeenCalledTimes(1);
    expect(renderer.renderer.readRenderTargetPixelsAsync).toHaveBeenCalledTimes(
      1
    );
  });

  it('runs a fresh pass once the inflight readback resolves and the camera has moved', async () => {
    depthSim.update();
    renderer.settleReadback();
    await Promise.resolve();
    await Promise.resolve();
    depthSim.autoUpdateDepthCameraTransform = false;
    depthSim.depthCamera.position.x += 0.05;
    depthSim.update();
    expect(renderer.renderer.render).toHaveBeenCalledTimes(2);
  });
});
