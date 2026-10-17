import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { startImport } from "@/lib/library/importJob";

/** Starts importing { folder }; returns the import's id (an import already running is returned instead). */
export async function POST(request: Request) {
  try {
    const body = ((await request.json().catch(() => null)) ?? {}) as { folder?: unknown };
    return NextResponse.json({ id: await startImport(body.folder) }, { status: 202 });
  } catch (err) {
    return errorResponse(err);
  }
}
