import * as THREE from 'three';
import * as xb from 'xrblocks';
import 'xrblocks/addons/simulator/SimulatorAddons.js';
import {BroadcastChannelTransport} from 'netblocks';

import {LipsyncMouth} from 'lipsync';

import {NetSample} from '../../../netblocks/samples/Sample';

/**
 * NetblocksLipsyncSample.
 *
 * Multiplayer demo: every remote peer's voice stream drives a stylised
 * mouth attached to their avatar's head. Opens this page in two browser
 * tabs and the avatars visibly speak with each other's voices.
 *
 * Uses `BroadcastChannelTransport` for zero-broker two-tab demos. Click
 * the room-code "Start new room" button in the top-left to switch to
 * the WebRTC transport for cross-machine multiplayer.
 *
 * One shared `AudioContext` is reused across all peer mouths so the
 * browser doesn't run out of context slots when more than a handful of
 * peers join.
 */
class NetblocksLipsyncSample extends NetSample {
  private sharedCtx = THREE.AudioContext.getContext() as AudioContext;
  private mouths = new Map<string, LipsyncMouth>();
  private domBtn?: HTMLButtonElement;
  private spatialBtn?: xb.TextButton;
  private spatialStatus?: xb.TextView;
  private voiceOn = false;

  protected override getJoinOptions() {
    return {
      roomId: 'lipsync-netblocks',
      options: {
        transport: new BroadcastChannelTransport(),
        displayName: `User-${Math.floor(Math.random() * 1000)}`,
      },
    };
  }

  protected override onSession(session: NonNullable<this['net']['session']>) {
    // Per remote peer: when their voice MediaStream arrives, attach a
    // LipsyncMouth to their avatar's headPivot. Reuses the shared
    // AudioContext so 8 peers don't exhaust the browser's context quota.
    session.voice.onTrack((peerId, stream) => {
      const user = session.users.get(peerId);
      if (!user) return;
      this.detachMouth(peerId);
      const mouth = new LipsyncMouth(stream, {audioContext: this.sharedCtx});
      user.avatar.headPivot.add(mouth);
      this.mouths.set(peerId, mouth);
    });
    session.voice.onTrackRemoved((peerId) => this.detachMouth(peerId));

    this.buildDomButton(session);
    this.buildSpatialPanel(session);
  }

  private detachMouth(peerId: string) {
    const m = this.mouths.get(peerId);
    if (!m) return;
    m.parent?.remove(m);
    // `dispose` is auto-called by xrblocks ScriptsManager when removed
    // from the scene graph; no manual cleanup needed beyond removal.
    this.mouths.delete(peerId);
  }

  private buildDomButton(session: NonNullable<this['net']['session']>) {
    const btn = document.createElement('button');
    btn.textContent = '🎙️ Enable voice';
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
    btn.addEventListener('click', () => this.toggleVoice(session));
    this.domBtn = btn;
  }

  private buildSpatialPanel(session: NonNullable<this['net']['session']>) {
    const panel = new xb.SpatialPanel({
      width: 1.0,
      height: 0.5,
      backgroundColor: '#1a1a2add',
    });
    const grid = panel.addGrid();
    grid.addRow({weight: 0.25}).addText({
      text: '🎙️ Lipsync · netblocks',
      fontSize: 0.06,
      fontColor: '#bfa9ff',
      textAlign: 'center',
    });
    this.spatialStatus = grid.addRow({weight: 0.25}).addText({
      text: 'voice: off',
      fontSize: 0.05,
      fontColor: '#7ac0ff',
      textAlign: 'center',
    });
    this.spatialBtn = grid.addRow({weight: 0.5}).addTextButton({
      text: '🎙️ Enable voice',
      fontColor: '#ffffff',
      backgroundColor: '#9177c7',
      fontSize: 0.18,
    });
    this.spatialBtn.onTriggered = () => this.toggleVoice(session);
    panel.position.set(-1.0, 1.5, -1.4);
    panel.rotation.y = Math.PI / 8;
    this.add(panel);
  }

  private async toggleVoice(
    session: NonNullable<this['net']['session']>
  ): Promise<void> {
    if (this.voiceOn) {
      session.voice.disable();
      this.voiceOn = false;
      if (this.domBtn) this.domBtn.textContent = '🎙️ Enable voice';
      this.spatialBtn?.setText('🎙️ Enable voice');
      this.spatialStatus?.setText('voice: off');
    } else {
      try {
        await session.voice.enable(session.transport.remotePeerIds);
        this.voiceOn = true;
        if (this.domBtn) this.domBtn.textContent = '🔇 Disable voice';
        this.spatialBtn?.setText('🔇 Disable voice');
        this.spatialStatus?.setText(
          'voice: on — other tabs will see your mouth'
        );
      } catch (err) {
        const msg = (err as Error).message;
        this.spatialStatus?.setText(`voice error: ${msg}`);
      }
    }
  }
}

NetSample.run(NetblocksLipsyncSample);
