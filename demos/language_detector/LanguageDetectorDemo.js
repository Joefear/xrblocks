import * as xb from 'xrblocks';
import * as THREE from 'three';

import {
  LanguageDetectorClient,
  languageName,
} from './LanguageDetectorClient.js';
import {GeminiLiveSource, WebSpeechSource} from './SpeechSources.js';

const TRANSCRIPT_PLACEHOLDER =
  'Pinch the mic to start. Speak in any language and the detector will guess what it is.';

export class LanguageDetectorDemo extends xb.Script {
  static dependencies = {camera: THREE.Camera};

  init({camera}) {
    this.camera = camera;
    this.detector = new LanguageDetectorClient();
    this.detector
      .load()
      .catch((e) => console.error('Language detector failed to load:', e));

    this.activeSource = null;
    this.activeMode = null; // 'web' | 'gemini' | null
    this.lastDetectAt = 0;
    this.detectTimer = null;
    this.lastTextDetected = '';

    this._buildUi();
  }

  _buildUi() {
    const panel = new xb.SpatialPanel({
      backgroundColor: '#101218e6',
      width: 1.2,
      height: 0.8,
    });
    this.add(panel);

    const grid = panel.addGrid();

    // Title row.
    const titleRow = grid.addRow({weight: 0.1});
    this.titleText = titleRow.addText({
      text: 'Live Language Detector',
      fontColor: '#ffffff',
      fontSize: 0.06,
    });

    // Transcript row (large readable area).
    const transcriptRow = grid.addRow({weight: 0.45});
    this.transcriptView = new xb.ScrollingTroikaTextView({
      text: TRANSCRIPT_PLACEHOLDER,
      fontSize: 0.045,
      textAlign: 'left',
      fontColor: '#e7eaf2',
    });
    transcriptRow.add(this.transcriptView);

    // Detected language readout.
    const langRow = grid.addRow({weight: 0.18});
    this.languageText = langRow.addText({
      text: 'No detection yet',
      fontColor: '#7dd3fc',
      fontSize: 0.055,
    });

    const altRow = grid.addRow({weight: 0.1});
    this.altLanguageText = altRow.addText({
      text: '',
      fontColor: '#94a3b8',
      fontSize: 0.035,
    });

    // Controls.
    const controlRow = grid.addRow({weight: 0.17});
    const controlGrid = controlRow.addGrid();

    controlGrid.addCol({weight: 0.15});

    const micCol = controlGrid.addCol({weight: 0.2});
    this.webButton = micCol.addIconButton({
      text: 'mic',
      fontSize: 0.6,
      fontColor: '#ffffff',
    });
    this.webButton.onTriggered = () => this._toggleMode('web');

    controlGrid.addCol({weight: 0.05});

    const geminiCol = controlGrid.addCol({weight: 0.2});
    this.geminiButton = geminiCol.addIconButton({
      text: 'auto_awesome',
      fontSize: 0.6,
      fontColor: '#ffffff',
    });
    this.geminiButton.onTriggered = () => this._toggleMode('gemini');

    controlGrid.addCol({weight: 0.05});

    const clearCol = controlGrid.addCol({weight: 0.2});
    this.clearButton = clearCol.addIconButton({
      text: 'delete',
      fontSize: 0.55,
      fontColor: '#ffffff',
    });
    this.clearButton.onTriggered = () => this._clear();

    controlGrid.addCol({weight: 0.15});

    panel.updateLayouts();
  }

  async _toggleMode(mode) {
    if (this.activeMode === mode) {
      await this._stopActive();
      this._setStatus('Stopped');
      return;
    }
    if (this.activeMode) {
      await this._stopActive();
    }
    let source;
    if (mode === 'web') {
      if (!WebSpeechSource.isAvailable()) {
        this._setStatus('Web Speech API not supported in this browser');
        return;
      }
      source = new WebSpeechSource();
    } else {
      if (!GeminiLiveSource.isAvailable()) {
        this._setStatus('Gemini Live not enabled (check API key in keys.json)');
        return;
      }
      source = new GeminiLiveSource();
    }
    source.onTranscript((text, isFinal) => this._onTranscript(text, isFinal));
    source.onError((err) => {
      console.error('Speech source error:', err);
      this._setStatus('Error: ' + (err?.message || err));
    });
    try {
      await source.start();
      this.activeSource = source;
      this.activeMode = mode;
      this._setStatus(
        mode === 'web' ? 'Listening (Web Speech)…' : 'Listening (Gemini Live)…'
      );
    } catch (err) {
      console.error('Failed to start:', err);
      this._setStatus('Failed to start: ' + (err?.message || err));
    }
  }

  async _stopActive() {
    if (this.activeSource) {
      await this.activeSource.stop();
      this.activeSource = null;
    }
    this.activeMode = null;
  }

  _clear() {
    this.activeSource?.reset?.();
    this.transcriptView.setText(TRANSCRIPT_PLACEHOLDER);
    this.languageText.setText('No detection yet');
    this.altLanguageText.setText('');
    this.lastTextDetected = '';
  }

  _setStatus(message) {
    this.titleText.setText(message);
  }

  _onTranscript(text, isFinal) {
    if (!text) return;
    this.transcriptView.setText(text);
    // Debounce detection: don't run on every interim character.
    if (this.detectTimer) clearTimeout(this.detectTimer);
    const delay = isFinal ? 50 : 350;
    this.detectTimer = setTimeout(() => this._runDetection(text), delay);
  }

  _runDetection(text) {
    if (!this.detector?.detector) return;
    if (text.length < 4) {
      this.languageText.setText('Need a few more characters…');
      this.altLanguageText.setText('');
      return;
    }
    if (text === this.lastTextDetected) return;
    this.lastTextDetected = text;

    const langs = this.detector.detect(text);
    if (!langs.length) {
      this.languageText.setText('Unknown');
      this.altLanguageText.setText('');
      return;
    }
    const top = langs[0];
    this.languageText.setText(
      `${languageName(top.languageCode)} (${Math.round(top.probability * 100)}%)`
    );
    const others = langs
      .slice(1)
      .map(
        (l) =>
          `${languageName(l.languageCode)} ${Math.round(l.probability * 100)}%`
      )
      .join('   ·   ');
    this.altLanguageText.setText(others);
  }
}
