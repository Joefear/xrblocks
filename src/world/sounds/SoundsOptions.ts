import {deepMerge} from '../../utils/OptionsUtils';
import {DeepPartial} from '../../utils/Types';

export class SoundsOptions {
  enabled = false;
  showDebugInfo = false;

  backendConfig = {
    activeBackend: 'mediapipe',
    mediapipe: {
      wasmFilesUrl:
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio@0.10.35/wasm',
      modelAssetPath:
        'https://tfhub.dev/google/lite-model/yamnet/classification/tflite/1?lite-format=tflite',
      chunkSamples: 16000,
    },
  };

  constructor(options?: DeepPartial<SoundsOptions>) {
    if (options) {
      deepMerge(this, options);
    }
  }

  /**
   * Enables sound detection.
   */
  enable() {
    this.enabled = true;
    return this;
  }
}
