import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { libraryRevision } from "@/lib/library/items";
import { cleanPlaylistName, createPlaylist, listPlaylists } from "@/lib/library/playlists";

/** Every playlist, most recently changed first. */
export async function GET() {
  try {
    const revision = libraryRevision();
    return NextResponse.json({ revision, playlists: listPlaylists() }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Creates a playlist: { name, itemIds? }. Unknown ids and videos are skipped. */
export async function POST(request: Request) {
  try {
    const body = ((await request.json().catch(() => null)) ?? {}) as { name?: unknown; itemIds?: unknown };
    const id = createPlaylist(cleanPlaylistName(body.name), body.itemIds);
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
