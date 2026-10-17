import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { errorResponse } from "@/lib/http";
import { libraryLocation } from "@/lib/library/moveJob";
import { getSettings, updateSettings, type Settings } from "@/lib/settings";

/** What Ajustes shows: the choices, where the library is and the app version. */
export async function GET() {
  try {
    return NextResponse.json(
      { settings: getSettings(), library: libraryLocation(), version: process.env.FETCHLY_VERSION ?? null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return errorResponse(err);
  }
}

/** Changes simple choices: { shareableDefault } and/or { miniAutoShow }. (The library folder moves through /api/settings/library-dir.) */
export async function PATCH(request: Request) {
  try {
    const body = ((await request.json().catch(() => null)) ?? {}) as { shareableDefault?: unknown; miniAutoShow?: unknown };
    const patch: Partial<Settings> = {};
    if (typeof body.shareableDefault === "boolean") patch.shareableDefault = body.shareableDefault;
    if (typeof body.miniAutoShow === "boolean") patch.miniAutoShow = body.miniAutoShow;
    if (Object.keys(patch).length === 0) throw new AppError("INVALID_URL", "No hay cambios.");
    return NextResponse.json({ settings: updateSettings(patch) });
  } catch (err) {
    return errorResponse(err);
  }
}
