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

/** `Content-Disposition` for a download, with an ASCII fallback for old clients. */
export function contentDisposition(downloadName: string): string {
  const asciiFallback = downloadName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`;
}
