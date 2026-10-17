import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { AppError } from "@/lib/errors";
import { errorResponse } from "@/lib/http";
import { getItem } from "@/lib/library/items";
import { isInsideLibrary } from "@/lib/library/paths";
import type { Category } from "@/lib/library/types";

const MIME_BY_EXT: Record<string, string> = {
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".aac": "audio/aac",
  ".opus": "audio/ogg",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mkv": "video/x-matroska",
  ".mov": "video/quicktime",
};

function mimeFor(filePath: string, category: Category): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".webm") return category === "music" ? "audio/webm" : "video/webm";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

/**
 * Parses a single "bytes=start-end" range (all the media element sends).
 * Returns null when there is no usable Range header, "invalid" when it
 * can't be satisfied.
 */
function parseRange(header: string | null, size: number): { start: number; end: number } | "invalid" | null {
  const match = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;
  const [, from, to] = match;
  if (from === "" && to === "") return "invalid";
  let start: number;
  let end: number;
  if (from === "") {
    // "bytes=-500": the last 500 bytes.
    start = Math.max(0, size - Number(to));
    end = size - 1;
  } else {
    start = Number(from);
    end = to === "" ? size - 1 : Math.min(Number(to), size - 1);
  }
  if (start > end || start >= size) return "invalid";
  return { start, end };
}

/**
 * Streams a library file to the app's <audio>/<video>. Files are only ever
 * looked up by their registered id, never by a path from the request.
 * Range support is what lets the player seek.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/library/media/[id]">) {
  try {
    const { id } = await ctx.params;
    const item = getItem(id);
    if (!item || !isInsideLibrary(item.filePath)) throw new AppError("NOT_FOUND", "Eso no está en la biblioteca.");

    const info = await stat(item.filePath).catch(() => null);
    if (!info?.isFile()) throw new AppError("NOT_FOUND", "No se encontró el archivo. Puede que se haya movido o borrado.");

    const size = info.size;
    const headers = new Headers({
      "Content-Type": mimeFor(item.filePath, item.category),
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
    });

    const range = parseRange(request.headers.get("range"), size);
    if (range === "invalid") {
      headers.set("Content-Range", `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }

    const { start, end } = range ?? { start: 0, end: size - 1 };
    headers.set("Content-Length", String(size === 0 ? 0 : end - start + 1));
    if (range) headers.set("Content-Range", `bytes ${start}-${end}/${size}`);

    const body =
      size === 0 ? null : (Readable.toWeb(createReadStream(item.filePath, { start, end })) as ReadableStream<Uint8Array>);
    return new Response(body, { status: range ? 206 : 200, headers });
  } catch (err) {
    return errorResponse(err);
  }
}
