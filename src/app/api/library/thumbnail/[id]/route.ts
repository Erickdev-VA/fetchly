import { readFile } from "node:fs/promises";
import path from "node:path";
import { AppError } from "@/lib/errors";
import { errorResponse } from "@/lib/http";
import { getItem } from "@/lib/library/items";
import { thumbnailsDir } from "@/lib/library/paths";

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

/** The cover saved when the item was downloaded. */
export async function GET(_request: Request, ctx: RouteContext<"/api/library/thumbnail/[id]">) {
  try {
    const { id } = await ctx.params;
    const fileName = getItem(id)?.thumbnailFile;
    const type = fileName ? MIME_BY_EXT[path.extname(fileName).toLowerCase()] : undefined;
    // The stored value is a bare file name; anything else isn't ours to serve.
    if (!fileName || !type || path.basename(fileName) !== fileName) throw new AppError("NOT_FOUND", "No hay portada guardada.");

    const data = await readFile(path.join(thumbnailsDir(), fileName)).catch(() => null);
    if (!data) throw new AppError("NOT_FOUND", "No hay portada guardada.");
    // A given id's cover never changes.
    return new Response(data, {
      headers: { "Content-Type": type, "Cache-Control": "private, max-age=31536000, immutable" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
