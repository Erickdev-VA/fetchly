import { existsSync } from "node:fs";
import { NextResponse, type NextRequest } from "next/server";
import { AppError } from "@/lib/errors";
import { errorResponse } from "@/lib/http";
import { libraryRevision, listItems } from "@/lib/library/items";
import type { Category, LibraryEntry } from "@/lib/library/types";

const CATEGORIES: Category[] = ["music", "video"];

/** Every item of one category, newest first. */
export async function GET(request: NextRequest) {
  try {
    const category = request.nextUrl.searchParams.get("category") as Category | null;
    if (!category || !CATEGORIES.includes(category)) throw new AppError("NOT_FOUND", "Categoría no válida.");

    const revision = libraryRevision();
    const items: LibraryEntry[] = listItems(category).map((item) => ({
      id: item.id,
      title: item.title,
      artist: item.artist,
      durationSeconds: item.durationSeconds,
      platform: item.platform,
      filePath: item.filePath,
      fileSize: item.fileSize,
      createdAt: item.createdAt,
      hasThumbnail: item.thumbnailFile !== null,
      missing: !existsSync(item.filePath),
    }));
    return NextResponse.json({ revision, items }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
