import * as xb from 'xrblocks';
import * as THREE from 'three';

import {
  LanguageDetectorClient,
  languageName,
} from './LanguageDetectorClient.js';
import {GeminiLiveSource} from './SpeechSources.js';

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

    this.source = null;
    this.listening = false;
    this.detectTimer = null;
    this.lastTextDetected = '';

    this._buildUi();
  }

  _buildUi() {
    const panel = new xb.SpatialPanel({backgroundColor: '#101218e6'});
    this.add(panel);

    const grid = panel.addGrid();

    const titleRow = grid.addRow({weight: 0.1});
    this.titleText = titleRow.addText({
      text: 'Live Language Detector',
      fontColor: '#ffffff',
      fontSize: 0.06,
    });

    const transcriptRow = grid.addRow({weight: 0.5});
    this.transcriptView = new xb.ScrollingTroikaTextView({
      text: TRANSCRIPT_PLACEHOLDER,
      fontSize: 0.045,
      textAlign: 'left',
      fontColor: '#e7eaf2',
    });
    transcriptRow.add(this.transcriptView);

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

    const controlRow = grid.addRow({weight: 0.17});
    const controlGrid = controlRow.addPanel({showEdge: false}).addGrid();

    controlGrid.addCol({weight: 0.25});

    this.micButton = controlGrid.addCol({weight: 0.25}).addIconButton({
      text: 'mic',
      fontSize: 0.6,
      fontColor: '#ffffff',
    });
    this.micButton.onTriggered = () => this._toggleListening();

    controlGrid.addCol({weight: 0.05});

    this.clearButton = controlGrid.addCol({weight: 0.25}).addIconButton({
      text: 'delete',
      fontSize: 0.55,
      fontColor: '#ffffff',
    });
    this.clearButton.onTriggered = () => this._clear();

    controlGrid.addCol({weight: 0.2});

    panel.updateLayouts();
  }

  async _toggleListening() {
    if (this.listening) {
      await this._stop();
      this._setStatus('Stopped');
      return;
    }
    if (!GeminiLiveSource.isAvailable()) {
      this._setStatus('Gemini not enabled — add API key to keys.json');
      return;
    }
    const source = new GeminiLiveSource();
    source.onTranscript((text, isFinal) => this._onTranscript(text, isFinal));
    source.onError((err) => {
      console.error('Speech source error:', err);
      this._setStatus('Error: ' + (err?.message || err));
    });
    try {
      await source.start();
      this.source = source;
      this.listening = true;
      this._setStatus('Listening… speak any language');
    } catch (err) {
      console.error('Failed to start:', err);
      this._setStatus('Failed to start: ' + (err?.message || err));
    }
  }

  async _stop() {
    if (this.source) {
      await this.source.stop();
      this.source = null;
    }
    this.listening = false;
  }

  _clear() {
    this.source?.reset?.();
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
