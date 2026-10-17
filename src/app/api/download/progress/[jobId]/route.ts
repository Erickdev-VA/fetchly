import { NextResponse } from "next/server";
import { getJob } from "@/lib/jobs/downloadJobs";
import { AppError } from "@/lib/errors";
import { errorResponse } from "@/lib/http";

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await context.params;
    const job = getJob(jobId);
    if (!job) throw new AppError("NOT_FOUND");

    return NextResponse.json({
      status: job.status,
      percent: Math.round(job.percent),
      converting: job.status === "processing" && job.converting,
      errorMessage: job.errorMessage ?? null,
      item: job.item ? { id: job.item.id, category: job.item.category, filePath: job.item.filePath } : null,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
