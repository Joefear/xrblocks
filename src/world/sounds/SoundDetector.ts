import * as THREE from 'three';
import {Script} from '../../core/Script';
import {
  AudioClassifierResult,
  SoundDetectedEventDetail,
  Category,
} from './DetectedSounds';
import {WorldOptions} from '../WorldOptions';
import {AudioListener} from '../../sound/AudioListener';

let FilesetResolver: any;
let AudioClassifier: any;

/**
 * Detects sounds from the mic input stream using MediaPipe's Audio Classifier.
 */
export class SoundDetector extends Script {
  static dependencies = {options: WorldOptions};

  private audioClassifier: any = null;
  private audioListener?: AudioListener;
  private isListening = false;
  private accumulatedAudio: number[] = [];
  private chunkSamples = 16000;
  private totalAccumulatedSamples = 0;

  /**
   * Initializes the SoundDetector and loads the MediaPipe module.
   */
  override async init({options}: {options: WorldOptions}) {
    try {
      console.log('SoundDetector: Loading MediaPipe module...');
      const mediapipeModule = await import('@mediapipe/tasks-audio');
      FilesetResolver = mediapipeModule.FilesetResolver;
      AudioClassifier = mediapipeModule.AudioClassifier;

      const mediapipeConfig = options.sounds.backendConfig.mediapipe;
      this.chunkSamples = mediapipeConfig.chunkSamples;

      const audioTasks = await FilesetResolver.forAudioTasks(
        mediapipeConfig.wasmFilesUrl
      );
      this.audioClassifier = await AudioClassifier.createFromOptions(
        audioTasks,
        {
          baseOptions: {
            modelAssetPath: mediapipeConfig.modelAssetPath,
          },
        }
      );
      console.log('SoundDetector: AudioClassifier initialized successfully.');
    } catch (error) {
      console.error(
        'SoundDetector: Failed to load MediaPipe audio module:',
        error
      );
    }
  }

  /**
   * Starts listening to the provided or default mic input stream.
   * @param stream - Optional MediaStream from the XR device's mic.
   */
  async startListening(stream?: MediaStream) {
    if (this.isListening) return;

    if (!this.audioListener) {
      this.audioListener = new AudioListener({
        sampleRate: 44000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });
    }

    try {
      this.isListening = true;
      await this.audioListener.startCapture({
        onAudioData: (buffer: ArrayBuffer) => {
          if (!this.audioClassifier) return;

          const int16 = new Int16Array(buffer);
          this.totalAccumulatedSamples += int16.length;

          let sumSquares = 0;
          for (let i = 0; i < int16.length; i++) {
            const normalized = int16[i] / 32768.0;
            sumSquares += normalized * normalized;
            this.accumulatedAudio.push(normalized);
          }
          const rms = Math.sqrt(sumSquares / int16.length);

          const sampleRate =
            this.audioListener?.audioContext?.sampleRate || 44000;
          const debugData = {
            rms: rms,
            bufferSize: int16.length,
            totalAccumulated: this.totalAccumulatedSamples,
            sampleRate: sampleRate,
          };

          let categories: Category[] | null = null;

          // Buffer up to specified samples for meaningful classification!
          if (this.accumulatedAudio.length >= this.chunkSamples) {
            const chunk = new Float32Array(
              this.accumulatedAudio.slice(0, this.chunkSamples)
            );
            this.accumulatedAudio = this.accumulatedAudio.slice(
              this.chunkSamples
            ); // simple non-overlapping window

            // Pass sample rate as second argument to classify if MediaPipe expects it
            console.log('Sample Rate: ', sampleRate);
            const result: AudioClassifierResult = this.audioClassifier.classify(
              chunk,
              sampleRate
            );
            categories = []; // Classification happened, initialize to empty array
            if (result && result.length > 0) {
              categories = result[0].classifications?.[0]?.categories || [];
            }
          }

          const detail: SoundDetectedEventDetail = {
            categories: categories,
            debug: debugData,
          };

          this.dispatchEvent({
            type: 'soundDetected',
            detail: detail,
          } as any);
        },
      });
      console.log('SoundDetector: Started listening using AudioListener.');
    } catch (error) {
      console.error(
        'SoundDetector: Failed to start audio classification:',
        error
      );
      this.isListening = false;
    }
  }

  /**
   * Stops listening and releases resources.
   */
  stopListening() {
    if (!this.isListening) return;
    this.audioListener?.stopCapture();
    this.isListening = false;
    console.log('SoundDetector: Stopped listening.');
  }

  override update(_timestamp: number, _frame?: XRFrame) {
    // No per-frame update logic needed, audio is handled asynchronously via streams.
  }
}
