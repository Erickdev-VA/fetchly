import { NextResponse } from "next/server";
import { getBatch, cancelBatch } from "@/lib/jobs/batchJobs";
import { AppError } from "@/lib/errors";
import { errorResponse } from "@/lib/http";

/** Stops pending/in-progress videos; ones already finished stay downloadable. */
export async function POST(_request: Request, context: { params: Promise<{ batchId: string }> }) {
  try {
    const { batchId } = await context.params;
    if (!getBatch(batchId)) throw new AppError("NOT_FOUND");
    cancelBatch(batchId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
