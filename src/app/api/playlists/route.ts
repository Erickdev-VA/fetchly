import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { libraryRevision } from "@/lib/library/items";
import { cleanPlaylistName, createPlaylist, listPlaylists } from "@/lib/library/playlists";

/** The playlists of songs (?kind=video: of videos), most recently changed first. */
export async function GET(request: Request) {
  try {
    const revision = libraryRevision();
    const kind = new URL(request.url).searchParams.get("kind") === "video" ? "video" : "music";
    return NextResponse.json({ revision, playlists: listPlaylists(kind) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Creates a playlist: { name, itemIds?, kind? ("video" for videos) }. Unknown ids and the other kind are skipped. */
export async function POST(request: Request) {
  try {
    const body = ((await request.json().catch(() => null)) ?? {}) as { name?: unknown; itemIds?: unknown; kind?: unknown };
    const id = createPlaylist(cleanPlaylistName(body.name), body.itemIds, body.kind === "video" ? "video" : "music");
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
