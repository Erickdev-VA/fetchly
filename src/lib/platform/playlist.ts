import type { RawYtDlpPlaylist } from "../ytdlp/rawTypes";
import type { PlaylistEntry } from "./types";

const PLAYLIST_ID_RE = /^[A-Za-z0-9_-]{2,64}$/;
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const UNAVAILABLE_TITLE_RE = /^\[(private|deleted|unavailable) video\]$/i;

/** The `list=` id of a YouTube URL, if it carries a well-formed one. */
export function getYouTubePlaylistId(url: URL): string | null {
  const list = url.searchParams.get("list");
  return list && PLAYLIST_ID_RE.test(list) ? list : null;
}

/** A link to the playlist itself (as opposed to one video opened inside it). */
export function isYouTubePlaylistPage(url: URL): boolean {
  return url.pathname.replace(/\/+$/, "") === "/playlist" && getYouTubePlaylistId(url) !== null;
}

export function youtubePlaylistUrl(listId: string): string {
  return `https://www.youtube.com/playlist?list=${encodeURIComponent(listId)}`;
}

export function youtubeVideoUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export interface NormalizedPlaylist {
  title: string;
  author: string | null;
  entries: PlaylistEntry[];
  totalCount: number;
}

export function normalizePlaylist(raw: RawYtDlpPlaylist): NormalizedPlaylist {
  const seen = new Set<string>();
  const entries: PlaylistEntry[] = [];

  for (const e of raw.entries ?? []) {
    if (!e?.id || !VIDEO_ID_RE.test(e.id) || seen.has(e.id)) continue;
    const title = e.title?.trim() || "Untitled";
    if (UNAVAILABLE_TITLE_RE.test(title)) continue;
    if (e.live_status === "is_live" || e.live_status === "is_upcoming") continue;
    seen.add(e.id);

    const thumbs = (e.thumbnails ?? []).filter((t) => t?.url);
    const largest = thumbs.reduce<(typeof thumbs)[number] | null>(
      (best, t) => (!best || (t.width ?? 0) > (best.width ?? 0) ? t : best),
      null,
    );

    entries.push({
      id: e.id,
      title,
      durationSeconds: e.duration ?? null,
      thumbnailUrl: largest?.url ?? `https://i.ytimg.com/vi/${e.id}/mqdefault.jpg`,
      author: e.channel ?? e.uploader ?? null,
    });
  }

  return {
    title: raw.title?.trim() || "Playlist",
    author: raw.channel ?? raw.uploader ?? null,
    entries,
    totalCount: raw.playlist_count ?? entries.length,
  };
}
