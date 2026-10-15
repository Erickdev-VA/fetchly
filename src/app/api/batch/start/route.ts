import { NextResponse } from "next/server";
import { getAnalysis } from "@/lib/jobs/analysisCache";
import { startBatchJob } from "@/lib/jobs/batchJobs";
import { isServerBusy } from "@/lib/jobs/capacity";
import { checkRateLimit, getClientKey } from "@/lib/ratelimit";
import { AppError } from "@/lib/errors";
import { errorResponse } from "@/lib/http";
import { PLAYLIST_HEIGHTS, type DownloadMode } from "@/lib/platform/types";

const VALID_MODES: DownloadMode[] = ["auto", "audio", "mute"];
const MAX_BATCH_ITEMS = 100;

interface StartBody {
  analysisId?: unknown;
  entryIds?: unknown;
  mode?: unknown;
  height?: unknown;
  shareable?: unknown;
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
    if (!analysis || analysis.kind !== "playlist") throw new AppError("NOT_FOUND");

    if (!Array.isArray(body.entryIds) || body.entryIds.length === 0) {
      throw new AppError("INVALID_URL", "Select at least one video.");
    }
    const ids = [...new Set(body.entryIds)];
    if (ids.length > MAX_BATCH_ITEMS) {
      throw new AppError("INVALID_URL", `You can download up to ${MAX_BATCH_ITEMS} videos at once.`);
    }
    const entries = ids.map((id) => {
      const entry = typeof id === "string" ? analysis.entries.get(id) : undefined;
      if (!entry) throw new AppError("INVALID_URL", "One of the selected videos isn't part of this playlist.");
      return { entryId: id as string, ...entry };
    });

    let height: number | "best" = "best";
    if (body.height !== undefined && body.height !== null && body.height !== "best") {
      const n = Number(body.height);
      if (!(PLAYLIST_HEIGHTS as readonly number[]).includes(n)) {
        throw new AppError("INVALID_URL", "Invalid quality.");
      }
      height = n;
    }

    const batchId = await startBatchJob({
      title: analysis.title,
      mode,
      height,
      shareable: body.shareable !== false,
      entries,
    });

    return NextResponse.json({ batchId }, { status: 202 });
  } catch (err) {
    return errorResponse(err);
  }
}
