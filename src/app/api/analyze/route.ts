import { NextResponse } from "next/server";
import { validateAndDetectPlatform } from "@/lib/security/url";
import { fetchMediaInfo } from "@/lib/ytdlp/info";
import { assertBinariesPresent } from "@/lib/ytdlp/binary";
import { normalizeMediaInfo } from "@/lib/platform/normalize";
import { saveAnalysis } from "@/lib/jobs/analysisCache";
import { checkRateLimit, getClientKey } from "@/lib/ratelimit";
import { AppError } from "@/lib/errors";
import { errorResponse } from "@/lib/http";
import type { MediaInfo } from "@/lib/platform/types";

const MAX_DURATION_SECONDS = 3 * 60 * 60;

export async function POST(request: Request) {
  try {
    const clientKey = getClientKey(request.headers);
    if (!checkRateLimit(`analyze:${clientKey}`, 15, 5 * 60 * 1000)) {
      throw new AppError("RATE_LIMITED");
    }

    assertBinariesPresent();

    const body = await request.json().catch(() => null);
    const { url, platform } = await validateAndDetectPlatform((body as { url?: unknown } | null)?.url);

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
      url: url.href,
      platform,
      title: normalized.title,
      availableHeights: normalized.qualities.map((q) => q.height),
      hasAudioOnlyStream: normalized.hasAudioOnlyStream,
      hasVideoOnlyStream: normalized.hasVideoOnlyStream,
      hasAnyAudio: normalized.hasAnyAudio,
    });

    const mediaInfo: MediaInfo = {
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

    return NextResponse.json(mediaInfo);
  } catch (err) {
    return errorResponse(err);
  }
}
