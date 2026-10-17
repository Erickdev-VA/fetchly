import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { errorResponse } from "@/lib/http";
import { setInLibrary } from "@/lib/library/playlists";

/**
 * { itemIds, inLibrary }: shows these songs in Música, or keeps them only
 * in their playlists (a song in no playlist always stays in Música).
 */
export async function POST(request: Request) {
  try {
    const body = ((await request.json().catch(() => null)) ?? {}) as { itemIds?: unknown; inLibrary?: unknown };
    if (typeof body.inLibrary !== "boolean") throw new AppError("INVALID_URL", "Falta inLibrary.");
    return NextResponse.json({ changed: setInLibrary(body.itemIds, body.inLibrary) });
  } catch (err) {
    return errorResponse(err);
  }
}
