import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { getJob, finalizeJob } from "@/lib/jobs/downloadJobs";
import { sanitizeFilename } from "@/lib/security/filename";
import { AppError } from "@/lib/errors";
import { errorResponse } from "@/lib/http";

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await context.params;
    const job = getJob(jobId);
    if (!job) throw new AppError("NOT_FOUND");
    if (job.status !== "completed" || !job.filePath || !job.fileName) {
      throw new AppError("NOT_FOUND", "This download isn't ready yet.");
    }

    const stats = await stat(job.filePath);
    const ext = path.extname(job.fileName);
    const base = sanitizeFilename(job.title);
    const downloadName = `${base}${ext}`;
    const asciiFallback = downloadName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");

    const nodeStream = createReadStream(job.filePath);
    nodeStream.on("close", () => {
      finalizeJob(jobId).catch(() => {});
    });
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    return new Response(webStream, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
        "Content-Length": String(stats.size),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
