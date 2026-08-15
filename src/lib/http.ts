import { NextResponse } from "next/server";
import { AppError, ERROR_MESSAGES } from "./errors";
import { logger } from "./logger";

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof AppError) {
    return NextResponse.json(err.toResponseBody(), { status: err.status });
  }
  logger.error("unhandled error", { err: err instanceof Error ? (err.stack ?? err.message) : String(err) });
  return NextResponse.json({ error: { code: "INTERNAL", message: ERROR_MESSAGES.INTERNAL } }, { status: 500 });
}
