import type { RawYtDlpFormat, RawYtDlpInfo } from "../ytdlp/rawTypes";
import type { QualityOption } from "./types";

export interface NormalizedMedia {
  title: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  author: string | null;
  isLive: boolean;
  qualities: QualityOption[];
  hasAudioOnlyStream: boolean;
  hasVideoOnlyStream: boolean;
  hasAnyAudio: boolean;
  bestAudioEstSizeBytes: number | null;
}

const hasVideo = (f: RawYtDlpFormat) => Boolean(f.vcodec) && f.vcodec !== "none";
const hasAudio = (f: RawYtDlpFormat) => Boolean(f.acodec) && f.acodec !== "none";
const bitrate = (f: RawYtDlpFormat) => f.tbr ?? 0;
const size = (f: RawYtDlpFormat) => f.filesize ?? f.filesize_approx ?? null;

export function normalizeMediaInfo(raw: RawYtDlpInfo): NormalizedMedia {
  const formats = raw.formats ?? [];

  const byHeight = new Map<number, RawYtDlpFormat>();
  for (const f of formats) {
    if (!hasVideo(f) || !f.height) continue;
    if (f.format_note && /storyboard/i.test(f.format_note)) continue;
    const existing = byHeight.get(f.height);
    if (!existing || bitrate(f) > bitrate(existing)) byHeight.set(f.height, f);
  }

  const qualities: QualityOption[] = Array.from(byHeight.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([height, f]) => ({
      height,
      label: `${height}p`,
      estSizeBytes: size(f),
    }));

  const audioOnlyFormats = formats.filter((f) => hasAudio(f) && !hasVideo(f));
  const bestAudioFormat = audioOnlyFormats.length
    ? audioOnlyFormats.reduce((a, b) => (bitrate(b) > bitrate(a) ? b : a))
    : null;

  return {
    title: raw.title?.trim() || "Untitled",
    thumbnailUrl: raw.thumbnail ?? null,
    durationSeconds: raw.duration ?? null,
    author: raw.uploader ?? raw.channel ?? null,
    isLive: Boolean(raw.is_live),
    qualities,
    hasAudioOnlyStream: audioOnlyFormats.length > 0,
    hasVideoOnlyStream: formats.some((f) => hasVideo(f) && !hasAudio(f) && f.height),
    hasAnyAudio: formats.some(hasAudio),
    bestAudioEstSizeBytes: bestAudioFormat ? size(bestAudioFormat) : null,
  };
}
