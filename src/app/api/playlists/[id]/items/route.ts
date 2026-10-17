import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { errorResponse } from "@/lib/http";
import { addToPlaylist } from "@/lib/library/playlists";

/** Adds songs at the end: { itemIds }. Songs already in it are skipped; returns how many were added. */
export async function POST(request: Request, ctx: RouteContext<"/api/playlists/[id]/items">) {
  try {
    const { id } = await ctx.params;
    const body = ((await request.json().catch(() => null)) ?? {}) as { itemIds?: unknown };
    const added = addToPlaylist(id, body.itemIds);
    if (added === null) throw new AppError("NOT_FOUND", "Esa playlist ya no existe.");
    return NextResponse.json({ added });
  } catch (err) {
    return errorResponse(err);
  }
}
