import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { errorResponse } from "@/lib/http";
import { libraryLocation } from "@/lib/library/moveJob";
import { getSettings, updateSettings } from "@/lib/settings";

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

/** Changes simple choices: { shareableDefault }. (The library folder moves through /api/settings/library-dir.) */
export async function PATCH(request: Request) {
  try {
    const body = ((await request.json().catch(() => null)) ?? {}) as { shareableDefault?: unknown };
    if (typeof body.shareableDefault !== "boolean") throw new AppError("INVALID_URL", "No hay cambios.");
    return NextResponse.json({ settings: updateSettings({ shareableDefault: body.shareableDefault }) });
  } catch (err) {
    return errorResponse(err);
  }
}
