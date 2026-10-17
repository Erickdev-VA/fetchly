import { NextResponse } from "next/server";
import { getAnalysis } from "@/lib/jobs/analysisCache";
import { startDownloadJob } from "@/lib/jobs/downloadJobs";
import { AppError } from "@/lib/errors";
import { errorResponse } from "@/lib/http";
import type { DownloadMode } from "@/lib/platform/types";
import { youtubeVideoIdFromLink } from "@/lib/platform/playlist";
import { findSongByVideoId } from "@/lib/library/items";
import { resolveSaveTarget } from "@/lib/library/saveTarget";

const VALID_MODES: DownloadMode[] = ["auto", "audio", "mute"];

interface StartBody {
  analysisId?: unknown;
  mode?: unknown;
  height?: unknown;
  shareable?: unknown;
  /** "Guardar en" (audio only): see resolveSaveTarget. */
  target?: unknown;
}

export async function POST(request: Request) {
  try {
    const body = ((await request.json().catch(() => null)) ?? {}) as StartBody;

    if (typeof body.analysisId !== "string") {
      throw new AppError("INVALID_URL", "Falta la referencia del análisis.");
    }
    if (typeof body.mode !== "string" || !VALID_MODES.includes(body.mode as DownloadMode)) {
      throw new AppError("INVALID_URL", "Modo no válido.");
    }
    const mode = body.mode as DownloadMode;

    const analysis = getAnalysis(body.analysisId);
    if (!analysis || analysis.kind !== "media") throw new AppError("NOT_FOUND");

    let height: number | "best" = "best";
    if (body.height !== undefined && body.height !== null && body.height !== "best") {
      const n = Number(body.height);
      if (!Number.isInteger(n) || !analysis.availableHeights.includes(n)) {
        throw new AppError("INVALID_URL", "Calidad no válida.");
      }
      height = n;
    }

    if (mode === "audio" && !analysis.hasAnyAudio) {
      throw new AppError("PROCESSING_FAILED", "Este contenido no tiene audio disponible.");
    }
    if (mode !== "audio" && analysis.availableHeights.length === 0) {
      throw new AppError("PROCESSING_FAILED", "Este contenido no tiene video disponible.");
    }

    // A song already downloaded from this YouTube video is reused, not downloaded twice.
    const videoId = mode === "audio" && analysis.platform === "youtube" ? youtubeVideoIdFromLink(analysis.url) : null;
    const target = resolveSaveTarget(body.target, mode);
    const jobId = await startDownloadJob({
      url: analysis.url,
      title: analysis.title,
      author: analysis.author,
      thumbnailUrl: analysis.thumbnailUrl,
      durationSeconds: analysis.durationSeconds,
      platform: analysis.platform,
      mode,
      height,
      hasAudioOnlyStream: analysis.hasAudioOnlyStream,
      hasVideoOnlyStream: analysis.hasVideoOnlyStream,
      // On unless the client explicitly opts out.
      shareable: body.shareable !== false,
      target,
      existing: videoId ? findSongByVideoId(videoId) : null,
    });

    return NextResponse.json({ jobId, playlistId: target.playlistId }, { status: 202 });
  } catch (err) {
    return errorResponse(err);
  }
}
