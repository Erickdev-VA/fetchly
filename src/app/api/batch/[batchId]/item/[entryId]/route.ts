import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { getBatch } from "@/lib/jobs/batchJobs";
import { batchItemFileName } from "@/lib/jobs/batchFiles";
import { AppError } from "@/lib/errors";
import { contentDisposition, errorResponse } from "@/lib/http";

/** A single finished video from a batch, e.g. to send just that one to WhatsApp. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ batchId: string; entryId: string }> },
) {
  try {
    const { batchId, entryId } = await context.params;
    const batch = getBatch(batchId);
    const item = batch?.items.find((i) => i.entryId === entryId);
    if (!batch || !item) throw new AppError("NOT_FOUND");
    if (item.status !== "completed" || !item.filePath) {
      throw new AppError("NOT_FOUND", "This download isn't ready yet.");
    }

    const stats = await stat(item.filePath);
    const webStream = Readable.toWeb(createReadStream(item.filePath)) as ReadableStream;
    return new Response(webStream, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": contentDisposition(batchItemFileName(batch, item)),
        "Content-Length": String(stats.size),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
