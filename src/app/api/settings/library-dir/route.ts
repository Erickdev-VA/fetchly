import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { getLibraryMove, startLibraryMove } from "@/lib/library/moveJob";

/** How the last (or current) library move is going; null if there was none. */
export async function GET() {
  return NextResponse.json({ move: getLibraryMove() }, { headers: { "Cache-Control": "no-store" } });
}

/** Moves the library under { folder } (into a "Fetchly" folder there, unless it's already one). */
export async function POST(request: Request) {
  try {
    const body = ((await request.json().catch(() => null)) ?? {}) as { folder?: unknown };
    return NextResponse.json({ move: await startLibraryMove(body.folder) }, { status: 202 });
  } catch (err) {
    return errorResponse(err);
  }
}
