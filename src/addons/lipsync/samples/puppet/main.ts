import * as THREE from 'three';
import * as xb from 'xrblocks';
import 'xrblocks/addons/simulator/SimulatorAddons.js';

import {LipsyncMouth} from 'lipsync';

/**
 * Puppet sample. Floats a stylised head about a metre in front of the
 * user and drives its mouth from the local mic. The puppet acts as a
 * stand-in for what a remote peer would see, since in immersive XR you
 * can't see your own face. Works in both the desktop simulator and an
 * immersive WebXR session.
 *
 * Tap the on-screen / in-scene mic button to grant audio permission,
 * then talk to the puppet. Vowels open the mouth, /oo/ rounds it, /ee/
 * widens it.
 */
class LipsyncPuppetSample extends xb.Script {
  private puppetHead?: THREE.Group;
  private mouth?: LipsyncMouth;
  private domBtn?: HTMLButtonElement;
  private spatialBtn?: xb.TextButton;
  private spatialStatus?: xb.TextView;
  private started = false;

  override init() {
    // Stylised puppet head: a sphere face, two eye dots, no body. Uses
    // a 0.1 m face radius to match netblocks `RemoteUserAvatar` so the
    // default LipsyncMouth fits naturally.
    const head = new THREE.Group();
    head.position.set(0, xb.user.height, -1);
    const faceR = 0.1;
    const faceGeom = new THREE.SphereGeometry(faceR, 32, 24);
    const faceMat = new THREE.MeshStandardMaterial({
      color: 0xf2d4b3,
      roughness: 0.6,
      metalness: 0.05,
    });
    const face = new THREE.Mesh(faceGeom, faceMat);
    head.add(face);
    const eyeGeom = new THREE.SphereGeometry(faceR * 0.1, 12, 8);
    const eyeMat = new THREE.MeshBasicMaterial({color: 0x111111});
    for (const dx of [-faceR * 0.3, faceR * 0.3]) {
      const eye = new THREE.Mesh(eyeGeom, eyeMat);
      // Eyes on the front of the head (local -Z) to match three.js /
      // WebXR head-forward convention.
      eye.position.set(dx, faceR * 0.2, -faceR * 0.92);
      head.add(eye);
    }
    this.puppetHead = head;
    this.add(head);

    this.add(new THREE.AmbientLight(0xffffff, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(1, 2, 1);
    this.add(key);

    this.buildDomButton();
    this.buildSpatialPanel();
  }

  private buildDomButton() {
    const btn = document.createElement('button');
    btn.textContent = '🎙️ Start mic';
    Object.assign(btn.style, {
      position: 'fixed',
      top: '12px',
      right: '12px',
      padding: '10px 18px',
      background: '#9177c7',
      color: '#fff',
      border: 'none',
      borderRadius: '24px',
      fontSize: '14px',
      cursor: 'pointer',
      zIndex: '999',
    } as Partial<CSSStyleDeclaration>);
    document.body.appendChild(btn);
    btn.addEventListener('click', () => this.startMic());
    this.domBtn = btn;
  }

  private buildSpatialPanel() {
    const panel = new xb.SpatialPanel({
      width: 0.8,
      height: 0.4,
      backgroundColor: '#1a1a2add',
    });
    const grid = panel.addGrid();
    grid.addRow({weight: 0.3}).addText({
      text: '🎙️ Lipsync puppet',
      fontSize: 0.06,
      fontColor: '#bfa9ff',
      textAlign: 'center',
    });
    this.spatialStatus = grid.addRow({weight: 0.25}).addText({
      text: 'mic: off',
      fontSize: 0.05,
      fontColor: '#7ac0ff',
      textAlign: 'center',
    });
    this.spatialBtn = grid.addRow({weight: 0.45}).addTextButton({
      text: '🎙️ Start mic',
      fontColor: '#ffffff',
      backgroundColor: '#9177c7',
      fontSize: 0.18,
    });
    this.spatialBtn.onTriggered = () => this.startMic();
    panel.position.set(-0.9, xb.user.height + 0.2, -1.0);
    panel.rotation.y = Math.PI / 8;
    this.add(panel);
  }

  private async startMic() {
    if (this.started) return;
    this.started = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {echoCancellation: true, noiseSuppression: true},
        video: false,
      });
      this.mouth = new LipsyncMouth(stream, {showEyes: false});
      this.puppetHead?.add(this.mouth);
      if (this.domBtn) this.domBtn.textContent = '🎙️ Live';
      this.spatialBtn?.setText('🎙️ Live');
      this.spatialStatus?.setText('mic: on. talk to the puppet');
    } catch (err) {
      this.started = false;
      const msg = (err as Error).message;
      if (this.domBtn) this.domBtn.textContent = `mic failed: ${msg}`;
      this.spatialStatus?.setText(`mic failed: ${msg}`);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const options = new xb.Options();
  options.reticles.enabled = true;
  options.controllers.visualizeRays = true;
  options.setAppTitle('Lipsync · Puppet');
  xb.add(new LipsyncPuppetSample());
  xb.init(options);
});
