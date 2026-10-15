import { Readable } from "node:stream";
import { ZipFile } from "yazl";
import { getBatch, isBatchRunning } from "@/lib/jobs/batchJobs";
import { batchItemFileName } from "@/lib/jobs/batchFiles";
import { sanitizeFilename } from "@/lib/security/filename";
import { AppError } from "@/lib/errors";
import { contentDisposition, errorResponse } from "@/lib/http";

/**
 * Streams every finished video of a batch as one ZIP. Entries are stored
 * uncompressed: video/audio is already compressed, so deflate would only
 * burn CPU for a ~0% gain.
 */
export async function GET(_request: Request, context: { params: Promise<{ batchId: string }> }) {
  try {
    const { batchId } = await context.params;
    const batch = getBatch(batchId);
    if (!batch) throw new AppError("NOT_FOUND");
    if (isBatchRunning(batch)) throw new AppError("NOT_FOUND", "This download isn't ready yet.");

    const done = batch.items.filter((i) => i.status === "completed" && i.filePath);
    if (done.length === 0) throw new AppError("NOT_FOUND", "None of the videos finished downloading.");

    const zip = new ZipFile();
    for (const item of done) {
      zip.addFile(item.filePath!, batchItemFileName(batch, item), { compress: false });
    }
    zip.end();

    const webStream = Readable.toWeb(Readable.from(zip.outputStream)) as ReadableStream;
    return new Response(webStream, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": contentDisposition(`${sanitizeFilename(batch.title, "playlist")}.zip`),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
