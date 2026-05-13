import * as xb from 'xrblocks';
import {BroadcastChannelTransport} from 'netblocks';
import {NetSample} from '../../Sample';

/**
 * ChatSample.
 *
 * Plain text chat over `session.events`. Each message is one
 * `chat-message` RPC carrying `{ from, text, ts }`. Open this page in
 * two browser tabs to chat with yourself; everything is local thanks to
 * BroadcastChannelTransport.
 *
 * The chat UI is a small floating panel in the corner — kept entirely
 * in DOM so the sample reads cleanly. In a real XR app you'd likely
 * render the same data through uiblocks for in-headset display.
 */
interface ChatPayload {
  from: string;
  text: string;
  ts: number;
}

class ChatSample extends NetSample {
  private _displayName = `User-${Math.floor(Math.random() * 1000)}`;
  private _log?: HTMLDivElement;

  protected getJoinOptions() {
    return {
      roomId: 'netblocks-sample-chat',
      options: {
        transport: new BroadcastChannelTransport(),
        displayName: this._displayName,
      },
    };
  }

  protected onSession(session: NonNullable<this['net']['session']>) {
    const panel = document.createElement('div');
    Object.assign(panel.style, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      width: '320px',
      maxHeight: '60vh',
      display: 'flex',
      flexDirection: 'column',
      background: 'rgba(20, 20, 30, 0.85)',
      color: '#fff',
      borderRadius: '12px',
      padding: '10px',
      font: '13px system-ui, sans-serif',
      backdropFilter: 'blur(8px)',
      zIndex: '999',
    } as Partial<CSSStyleDeclaration>);

    const header = document.createElement('div');
    header.textContent = `💬 chat · you are ${this._displayName}`;
    Object.assign(header.style, {
      fontWeight: '600',
      marginBottom: '6px',
      color: '#bfa9ff',
    });
    panel.appendChild(header);

    const log = document.createElement('div');
    Object.assign(log.style, {
      flex: '1 1 auto',
      overflowY: 'auto',
      minHeight: '120px',
      padding: '4px 0',
    });
    panel.appendChild(log);
    this._log = log;

    const inputRow = document.createElement('form');
    Object.assign(inputRow.style, {
      display: 'flex',
      gap: '6px',
      marginTop: '6px',
    });
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Say something…';
    input.maxLength = 280;
    Object.assign(input.style, {
      flex: '1 1 auto',
      padding: '6px 10px',
      borderRadius: '6px',
      border: '1px solid #444',
      background: '#13141c',
      color: '#fff',
      font: 'inherit',
    });
    const send = document.createElement('button');
    send.type = 'submit';
    send.textContent = 'Send';
    Object.assign(send.style, {
      padding: '6px 14px',
      borderRadius: '6px',
      border: 'none',
      background: '#9177c7',
      color: '#fff',
      cursor: 'pointer',
      font: 'inherit',
    });
    inputRow.appendChild(input);
    inputRow.appendChild(send);
    panel.appendChild(inputRow);
    document.body.appendChild(panel);

    // While the chat box is focused, disable the simulator's keyboard
    // controls so typing letters like W/A/S/D doesn't move the camera.
    // Same approach as the gamepad/simulator settings panel — see PR
    // google/xrblocks#262.
    const controls = xb.core?.simulator?.controls;
    input.addEventListener('focus', () => {
      if (controls) controls.enabled = false;
    });
    input.addEventListener('blur', () => {
      if (controls) controls.enabled = true;
    });

    inputRow.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      const payload: ChatPayload = {
        from: this._displayName,
        text,
        ts: Date.now(),
      };
      session.events.emit('chat-message', payload);
      this._appendLine(payload, /* self */ true);
      input.value = '';
    });

    session.events.on<ChatPayload>('chat-message', (payload) => {
      this._appendLine(payload, false);
    });
  }

  private _appendLine(p: ChatPayload, self: boolean) {
    if (!this._log) return;
    const line = document.createElement('div');
    line.style.padding = '2px 0';
    const who = document.createElement('span');
    who.textContent = self ? 'you' : p.from;
    who.style.color = self ? '#9177c7' : '#7ac0ff';
    who.style.fontWeight = '600';
    line.appendChild(who);
    line.appendChild(document.createTextNode(`: ${p.text}`));
    this._log.appendChild(line);
    this._log.scrollTop = this._log.scrollHeight;
  }
}

NetSample.run(ChatSample);
