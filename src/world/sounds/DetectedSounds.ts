export interface Category {
  categoryName: string;
  score: number;
  displayName?: string;
}

export interface Classification {
  categories: Category[];
}

export interface AudioClassifierResultItem {
  classifications: Classification[];
}

export type AudioClassifierResult = AudioClassifierResultItem[];

export interface SoundDetectedEventDetail {
  categories: Category[] | null;
  debug: {
    rms: number;
    bufferSize: number;
    totalAccumulated: number;
    sampleRate: number;
  };
}
