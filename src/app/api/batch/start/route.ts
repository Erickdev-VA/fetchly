import { NextResponse } from "next/server";
import { getAnalysis } from "@/lib/jobs/analysisCache";
import { startBatchJob } from "@/lib/jobs/batchJobs";
import { AppError } from "@/lib/errors";
import { errorResponse } from "@/lib/http";
import { PLAYLIST_HEIGHTS, type DownloadMode } from "@/lib/platform/types";
import { MAX_PLAYLIST_ENTRIES } from "@/lib/ytdlp/info";

const VALID_MODES: DownloadMode[] = ["auto", "audio", "mute"];
// Items wait in the batch's own queue, so a whole listed playlist can go at once.
const MAX_BATCH_ITEMS = MAX_PLAYLIST_ENTRIES;

interface StartBody {
  analysisId?: unknown;
  entryIds?: unknown;
  mode?: unknown;
  height?: unknown;
  shareable?: unknown;
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
    if (!analysis || analysis.kind !== "playlist") throw new AppError("NOT_FOUND");

    if (!Array.isArray(body.entryIds) || body.entryIds.length === 0) {
      throw new AppError("INVALID_URL", "Selecciona al menos un video.");
    }
    const ids = [...new Set(body.entryIds)];
    if (ids.length > MAX_BATCH_ITEMS) {
      throw new AppError("INVALID_URL", `Puedes descargar hasta ${MAX_BATCH_ITEMS} videos a la vez.`);
    }
    const entries = ids.map((id) => {
      const entry = typeof id === "string" ? analysis.entries.get(id) : undefined;
      if (!entry) throw new AppError("INVALID_URL", "Uno de los videos seleccionados no pertenece a esta playlist.");
      return { entryId: id as string, ...entry };
    });

    let height: number | "best" = "best";
    if (body.height !== undefined && body.height !== null && body.height !== "best") {
      const n = Number(body.height);
      if (!(PLAYLIST_HEIGHTS as readonly number[]).includes(n)) {
        throw new AppError("INVALID_URL", "Calidad no válida.");
      }
      height = n;
    }

    const batchId = await startBatchJob({
      title: analysis.title,
      platform: analysis.platform,
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
