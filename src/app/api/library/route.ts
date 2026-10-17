import { NextResponse, type NextRequest } from "next/server";
import { AppError } from "@/lib/errors";
import { errorResponse } from "@/lib/http";
import { toEntry } from "@/lib/library/entries";
import { libraryRevision, listItems } from "@/lib/library/items";
import type { Category } from "@/lib/library/types";

const CATEGORIES: Category[] = ["music", "video"];

/** Every item of one category, newest first. */
export async function GET(request: NextRequest) {
  try {
    const category = request.nextUrl.searchParams.get("category") as Category | null;
    if (!category || !CATEGORIES.includes(category)) throw new AppError("NOT_FOUND", "Categoría no válida.");

    const revision = libraryRevision();
    const items = listItems(category).map(toEntry);
    return NextResponse.json({ revision, items }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
