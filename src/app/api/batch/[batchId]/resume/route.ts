import { NextResponse } from "next/server";
import { getBatch, resumeBatch } from "@/lib/jobs/batchJobs";
import { AppError } from "@/lib/errors";
import { errorResponse } from "@/lib/http";

/** Goes on with a batch paused because YouTube refused, without waiting out the pause. */
export async function POST(_request: Request, context: { params: Promise<{ batchId: string }> }) {
  try {
    const { batchId } = await context.params;
    if (!getBatch(batchId)) throw new AppError("NOT_FOUND");
    resumeBatch(batchId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
