import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { errorResponse } from "@/lib/http";
import { libraryRevision } from "@/lib/library/items";
import { cleanPlaylistName, deletePlaylist, getPlaylist, renamePlaylist, setPlaylistOrder } from "@/lib/library/playlists";

const NOT_FOUND = "Esa playlist ya no existe.";

/** The playlist with its songs, in order. */
export async function GET(_request: Request, ctx: RouteContext<"/api/playlists/[id]">) {
  try {
    const { id } = await ctx.params;
    const revision = libraryRevision();
    const playlist = getPlaylist(id);
    if (!playlist) throw new AppError("NOT_FOUND", NOT_FOUND);
    return NextResponse.json({ revision, playlist }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}

/** { name } renames it; { itemIds } sets its songs' order (leaving one out removes it). */
export async function PATCH(request: Request, ctx: RouteContext<"/api/playlists/[id]">) {
  try {
    const { id } = await ctx.params;
    const body = ((await request.json().catch(() => null)) ?? {}) as { name?: unknown; itemIds?: unknown };
    if (body.name === undefined && body.itemIds === undefined) throw new AppError("INVALID_URL", "No hay cambios.");
    if (body.name !== undefined && !renamePlaylist(id, cleanPlaylistName(body.name))) {
      throw new AppError("NOT_FOUND", NOT_FOUND);
    }
    if (body.itemIds !== undefined && !setPlaylistOrder(id, body.itemIds)) throw new AppError("NOT_FOUND", NOT_FOUND);
    return new Response(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Deletes the playlist; its songs stay in the library. */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/playlists/[id]">) {
  try {
    const { id } = await ctx.params;
    if (!deletePlaylist(id)) throw new AppError("NOT_FOUND", NOT_FOUND);
    return new Response(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
