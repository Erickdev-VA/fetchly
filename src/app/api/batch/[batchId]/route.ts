import { NextResponse } from "next/server";
import { getBatch, discardBatch, isBatchRunning } from "@/lib/jobs/batchJobs";
import { AppError } from "@/lib/errors";
import { errorResponse } from "@/lib/http";

export async function GET(_request: Request, context: { params: Promise<{ batchId: string }> }) {
  try {
    const { batchId } = await context.params;
    const batch = getBatch(batchId);
    if (!batch) throw new AppError("NOT_FOUND");

    return NextResponse.json({
      running: isBatchRunning(batch),
      cancelled: batch.cancelled,
      items: batch.items.map((item) => ({
        entryId: item.entryId,
        title: item.title,
        status: item.status,
        percent: Math.round(item.percent),
        errorMessage: item.errorMessage ?? null,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Cancels whatever is still running and deletes the batch's files. */
export async function DELETE(_request: Request, context: { params: Promise<{ batchId: string }> }) {
  try {
    const { batchId } = await context.params;
    await discardBatch(batchId);
    return new Response(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
