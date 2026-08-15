import { NextResponse } from "next/server";
import { getAnalysis } from "@/lib/jobs/analysisCache";
import { startDownloadJob, isServerBusy } from "@/lib/jobs/downloadJobs";
import { checkRateLimit, getClientKey } from "@/lib/ratelimit";
import { AppError } from "@/lib/errors";
import { errorResponse } from "@/lib/http";
import type { DownloadMode } from "@/lib/platform/types";

const VALID_MODES: DownloadMode[] = ["auto", "audio", "mute"];

interface StartBody {
  analysisId?: unknown;
  mode?: unknown;
  height?: unknown;
}

export async function POST(request: Request) {
  try {
    const clientKey = getClientKey(request.headers);
    if (!checkRateLimit(`download:${clientKey}`, 10, 5 * 60 * 1000)) {
      throw new AppError("RATE_LIMITED");
    }
    if (isServerBusy()) {
      throw new AppError("SERVER_BUSY");
    }

    const body = ((await request.json().catch(() => null)) ?? {}) as StartBody;

    if (typeof body.analysisId !== "string") {
      throw new AppError("INVALID_URL", "Missing analysis reference.");
    }
    if (typeof body.mode !== "string" || !VALID_MODES.includes(body.mode as DownloadMode)) {
      throw new AppError("INVALID_URL", "Invalid mode.");
    }
    const mode = body.mode as DownloadMode;

    const analysis = getAnalysis(body.analysisId);
    if (!analysis) throw new AppError("NOT_FOUND");

    let height: number | "best" = "best";
    if (body.height !== undefined && body.height !== null && body.height !== "best") {
      const n = Number(body.height);
      if (!Number.isInteger(n) || !analysis.availableHeights.includes(n)) {
        throw new AppError("INVALID_URL", "Invalid quality.");
      }
      height = n;
    }

    if (mode === "audio" && !analysis.hasAnyAudio) {
      throw new AppError("PROCESSING_FAILED", "No audio track is available for this content.");
    }
    if (mode !== "audio" && analysis.availableHeights.length === 0) {
      throw new AppError("PROCESSING_FAILED", "No video stream is available for this content.");
    }

    const jobId = await startDownloadJob({
      url: analysis.url,
      title: analysis.title,
      mode,
      height,
      hasAudioOnlyStream: analysis.hasAudioOnlyStream,
      hasVideoOnlyStream: analysis.hasVideoOnlyStream,
    });

    return NextResponse.json({ jobId }, { status: 202 });
  } catch (err) {
    return errorResponse(err);
  }
}
