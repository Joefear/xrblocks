import 'xrblocks/addons/simulator/SimulatorAddons.js';
import * as xb from 'xrblocks';
import {ControlPanel} from './ControlPanel.js';
import {MagicWindow} from './MagicWindow.js';
import {installWebcamFallback} from './WebcamFallback.js';

const options = new xb.Options();
// The device camera feeds the segmenter. On a headset this is the
// world-facing passthrough camera; in the simulator the webcam fallback
// (installed after init) swaps in a real getUserMedia stream so there is an
// actual person to cut out.
options.enableCamera('environment');
options.setAppTitle('Magic Window');
options.setAppDescription(
  'Segments people out of the camera feed in real time (MediaPipe ' +
    'ImageSegmenter) and composites them onto a swappable backdrop.'
);
options.xrButton.showEnterSimulatorButton = true;

function start() {
  const magicWindow = new MagicWindow();
  xb.add(magicWindow);
  xb.add(new ControlPanel(magicWindow));
  xb.init(options).then(() => {
    installWebcamFallback(xb);
  });
}

document.addEventListener('DOMContentLoaded', start);
