import * as THREE from 'three';
import {WebRTCTransport} from 'netblocks';
import {NetSample} from '../../Sample';

/**
 * VoiceSample.
 *
 * Push-to-talk spatial voice chat using `WebRTCTransport`. We use WebRTC
 * because BroadcastChannel can't carry audio, and the WebSocket relay
 * still needs WebRTC for the actual audio stream. The on-screen button
 * toggles `voice.enable() / disable()`.
 *
 * The audio is parented to each remote user's avatar head, so as you walk
 * around (or in XR, as the speaker walks around), their voice pans
 * naturally with their position via THREE.PositionalAudio.
 */
class VoiceSample extends NetSample {
  private _voiceOn = false;
  private _btn?: HTMLButtonElement;

  protected getJoinOptions() {
    return {
      roomId: 'netblocks-sample-voice',
      options: {
        transport: new WebRTCTransport(),
        displayName: `User-${Math.floor(Math.random() * 1000)}`,
      },
    };
  }

  protected onSession(session: NonNullable<this['net']['session']>) {
    this.add(new THREE.HemisphereLight(0xffffff, 0x202030, 1.0));
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(2, 48),
      new THREE.MeshStandardMaterial({color: 0x303040, roughness: 0.9})
    );
    floor.rotation.x = -Math.PI / 2;
    this.add(floor);

    this._btn = document.createElement('button');
    this._btn.textContent = '🎙️ Enable voice';
    Object.assign(this._btn.style, {
      position: 'fixed',
      bottom: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '14px 22px',
      background: '#9177c7',
      color: '#fff',
      border: 'none',
      borderRadius: '24px',
      fontSize: '16px',
      cursor: 'pointer',
      zIndex: '999',
    } as Partial<CSSStyleDeclaration>);
    document.body.appendChild(this._btn);
    this._btn.addEventListener('click', async () => {
      if (this._voiceOn) {
        session.voice.disable();
        this._voiceOn = false;
        this._btn!.textContent = '🎙️ Enable voice';
      } else {
        try {
          await session.voice.enable(session.transport.remotePeerIds);
          this._voiceOn = true;
          this._btn!.textContent = '🔇 Disable voice';
        } catch (err) {
          alert(`Could not start voice: ${(err as Error).message}`);
        }
      }
    });
  }
}

NetSample.run(VoiceSample);
