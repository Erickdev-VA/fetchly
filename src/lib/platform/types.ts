export type Platform = "youtube" | "tiktok" | "instagram";

export type DownloadMode = "auto" | "audio" | "mute";

export interface QualityOption {
  height: number;
  label: string;
  estSizeBytes: number | null;
}

export interface MediaInfo {
  kind: "media";
  analysisId: string;
  platform: Platform;
  title: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  author: string | null;
  qualities: QualityOption[];
  hasAudioTrack: boolean;
  bestAudioEstSizeBytes: number | null;
  /** Set when the link was a video opened from inside a playlist. */
  playlistUrl: string | null;
}

export interface PlaylistEntry {
  id: string;
  title: string;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  author: string | null;
}

export interface PlaylistInfo {
  kind: "playlist";
  analysisId: string;
  platform: Platform;
  title: string;
  author: string | null;
  entries: PlaylistEntry[];
  /** True when the playlist has more videos than we list. */
  truncated: boolean;
}

export type AnalyzeResult = MediaInfo | PlaylistInfo;

/** Height caps offered for playlist downloads, where per-video formats aren't known up front. */
export const PLAYLIST_HEIGHTS = [1080, 720, 480, 360] as const;
