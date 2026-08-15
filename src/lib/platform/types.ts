export type Platform = "youtube" | "tiktok" | "instagram";

export type DownloadMode = "auto" | "audio" | "mute";

export interface QualityOption {
  height: number;
  label: string;
  estSizeBytes: number | null;
}

export interface MediaInfo {
  analysisId: string;
  platform: Platform;
  title: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  author: string | null;
  qualities: QualityOption[];
  hasAudioTrack: boolean;
  bestAudioEstSizeBytes: number | null;
}
