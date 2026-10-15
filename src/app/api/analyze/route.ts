import { NextResponse } from "next/server";
import { validateAndDetectPlatform } from "@/lib/security/url";
import { fetchMediaInfo, fetchPlaylistInfo, MAX_PLAYLIST_ENTRIES } from "@/lib/ytdlp/info";
import { assertBinariesPresent } from "@/lib/ytdlp/binary";
import { normalizeMediaInfo } from "@/lib/platform/normalize";
import {
  getYouTubePlaylistId,
  isYouTubePlaylistPage,
  normalizePlaylist,
  youtubePlaylistUrl,
  youtubeVideoUrl,
} from "@/lib/platform/playlist";
import { saveAnalysis } from "@/lib/jobs/analysisCache";
import { checkRateLimit, getClientKey } from "@/lib/ratelimit";
import { AppError } from "@/lib/errors";
import { errorResponse } from "@/lib/http";
import type { MediaInfo, Platform, PlaylistInfo } from "@/lib/platform/types";

const MAX_DURATION_SECONDS = 3 * 60 * 60;

async function analyzePlaylist(url: URL, platform: Platform): Promise<PlaylistInfo> {
  const raw = await fetchPlaylistInfo(url.href);
  const playlist = normalizePlaylist(raw);
  if (playlist.entries.length === 0) throw new AppError("CONTENT_UNAVAILABLE", "This playlist has no downloadable videos.");

  const analysisId = saveAnalysis({
    kind: "playlist",
    platform,
    title: playlist.title,
    entries: new Map(
      playlist.entries.map((e, index) => [e.id, { url: youtubeVideoUrl(e.id), title: e.title, index }]),
    ),
  });

  return {
    kind: "playlist",
    analysisId,
    platform,
    title: playlist.title,
    author: playlist.author,
    entries: playlist.entries,
    truncated: playlist.totalCount > MAX_PLAYLIST_ENTRIES,
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
    availableHeights: normalized.qualities.map((q) => q.height),
    hasAudioOnlyStream: normalized.hasAudioOnlyStream,
    hasVideoOnlyStream: normalized.hasVideoOnlyStream,
    hasAnyAudio: normalized.hasAnyAudio,
  });

  const listId = platform === "youtube" ? getYouTubePlaylistId(url) : null;

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
    playlistUrl: listId ? youtubePlaylistUrl(listId) : null,
  };
}

export async function POST(request: Request) {
  try {
    const clientKey = getClientKey(request.headers);
    if (!checkRateLimit(`analyze:${clientKey}`, 15, 5 * 60 * 1000)) {
      throw new AppError("RATE_LIMITED");
    }

    assertBinariesPresent();

    const body = await request.json().catch(() => null);
    const { url, platform } = await validateAndDetectPlatform((body as { url?: unknown } | null)?.url);

    const result =
      platform === "youtube" && isYouTubePlaylistPage(url)
        ? await analyzePlaylist(url, platform)
        : await analyzeMedia(url, platform);

    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
