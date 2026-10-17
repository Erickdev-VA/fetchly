import { rm } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { errorResponse } from "@/lib/http";
import { deleteItem, getItem } from "@/lib/library/items";
import { thumbnailsDir } from "@/lib/library/paths";
import { toEntry } from "@/lib/library/entries";

/** One item, as the page sees it. */
export async function GET(_request: Request, ctx: RouteContext<"/api/library/[id]">) {
  try {
    const { id } = await ctx.params;
    const item = getItem(id);
    if (!item) throw new AppError("NOT_FOUND", "Eso no está en la biblioteca.");
    return NextResponse.json({ category: item.category, entry: toEntry(item) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * Forgets an item and its saved cover. The media file itself is sent to the
 * Recycle Bin by Electron before this is called (the server can't reach
 * the Windows shell), or was already gone.
 */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/library/[id]">) {
  try {
    const { id } = await ctx.params;
    const item = getItem(id);
    if (!item || !deleteItem(id)) throw new AppError("NOT_FOUND", "Eso no está en la biblioteca.");
    if (item.thumbnailFile) {
      await rm(path.join(thumbnailsDir(), path.basename(item.thumbnailFile)), { force: true }).catch(() => {});
    }
    return new Response(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
