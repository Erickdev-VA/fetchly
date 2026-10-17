import { NextResponse } from "next/server";
import { validateAndDetectPlatform } from "@/lib/security/url";
import { fetchMediaInfo, fetchPlaylistInfo, MAX_PLAYLIST_ENTRIES } from "@/lib/ytdlp/info";
import { assertBinariesPresent } from "@/lib/ytdlp/binary";
import { normalizeMediaInfo } from "@/lib/platform/normalize";
import {
  getYouTubePlaylistId,
  getYouTubeVideoId,
  isYouTubeMix,
  normalizePlaylist,
  youtubeVideoUrl,
} from "@/lib/platform/playlist";
import { saveAnalysis } from "@/lib/jobs/analysisCache";
import { findOwnedVideos } from "@/lib/library/items";
import { AppError } from "@/lib/errors";
import { errorResponse } from "@/lib/http";
import { logger } from "@/lib/logger";
import type { MediaInfo, Platform, PlaylistInfo } from "@/lib/platform/types";

const MAX_DURATION_SECONDS = 3 * 60 * 60;
const MAX_MIX_ENTRIES = 50;

async function analyzePlaylist(url: URL, platform: Platform, listId: string): Promise<PlaylistInfo> {
  const isMix = isYouTubeMix(listId);
  const maxEntries = isMix ? MAX_MIX_ENTRIES : MAX_PLAYLIST_ENTRIES;
  // The original link is passed as-is (not rewritten to /playlist?list=):
  // Mixes only resolve from a watch URL, and yt-dlp handles every form.
  const raw = await fetchPlaylistInfo(url.href, maxEntries);
  const playlist = normalizePlaylist(raw);
  if (playlist.entries.length === 0) throw new AppError("CONTENT_UNAVAILABLE", "Esta playlist no tiene videos que se puedan descargar.");

  const analysisId = saveAnalysis({
    kind: "playlist",
    platform,
    title: playlist.title,
    entries: new Map(
      playlist.entries.map((e, index) => [
        e.id,
        {
          url: youtubeVideoUrl(e.id),
          title: e.title,
          author: e.author,
          thumbnailUrl: e.thumbnailUrl,
          durationSeconds: e.durationSeconds,
          index,
        },
      ]),
    ),
  });

  const videoId = getYouTubeVideoId(url);
  return {
    kind: "playlist",
    analysisId,
    platform,
    title: playlist.title,
    author: playlist.author,
    entries: playlist.entries,
    focusEntryId: videoId && playlist.entries.some((e) => e.id === videoId) ? videoId : null,
    truncated: isMix || playlist.totalCount > maxEntries,
    // Entry ids are YouTube video ids.
    inLibrary: Object.fromEntries(findOwnedVideos(playlist.entries.map((e) => e.id))),
  };
}

async function analyzeMedia(url: URL, platform: Platform): Promise<MediaInfo> {
  const raw = await fetchMediaInfo(url.href);
  const normalized = normalizeMediaInfo(raw);

  if (normalized.isLive) throw new AppError("LIVE_UNSUPPORTED");
  if (normalized.durationSeconds && normalized.durationSeconds > MAX_DURATION_SECONDS) {
    throw new AppError("TOO_LONG");
  }
  if (normalized.qualities.length === 0 && !normalized.hasAnyAudio) {
    throw new AppError("CONTENT_UNAVAILABLE");
  }

  const analysisId = saveAnalysis({
    kind: "media",
    url: url.href,
    platform,
    title: normalized.title,
    author: normalized.author,
    thumbnailUrl: normalized.thumbnailUrl,
    durationSeconds: normalized.durationSeconds,
    availableHeights: normalized.qualities.map((q) => q.height),
    hasAudioOnlyStream: normalized.hasAudioOnlyStream,
    hasVideoOnlyStream: normalized.hasVideoOnlyStream,
    hasAnyAudio: normalized.hasAnyAudio,
  });

  return {
    kind: "media",
    analysisId,
    platform,
    title: normalized.title,
    thumbnailUrl: normalized.thumbnailUrl,
    durationSeconds: normalized.durationSeconds,
    author: normalized.author,
    qualities: normalized.qualities,
    hasAudioTrack: normalized.hasAnyAudio,
    bestAudioEstSizeBytes: normalized.bestAudioEstSizeBytes,
  };
}

export async function POST(request: Request) {
  try {

    assertBinariesPresent();

    const body = await request.json().catch(() => null);
    const { url, platform } = await validateAndDetectPlatform((body as { url?: unknown } | null)?.url);

    // Any YouTube link carrying a list — the playlist page itself, a video
    // opened inside it, a share link, a Mix — opens the playlist picker.
    const listId = platform === "youtube" ? getYouTubePlaylistId(url) : null;
    if (listId) {
      try {
        return NextResponse.json(await analyzePlaylist(url, platform, listId));
      } catch (err) {
        // Lists that need a login (Watch later, Liked videos…) can't be read;
        // if the link also names a video, fall back to just that video.
        if (!getYouTubeVideoId(url)) throw err;
        logger.warn("playlist analysis failed, falling back to the single video", { listId });
      }
    }

    return NextResponse.json(await analyzeMedia(url, platform));
  } catch (err) {
    return errorResponse(err);
  }
}
