import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { updateYtDlpNow, ytDlpVersion } from "@/lib/ytdlp/updater";

/** The installed yt-dlp version. */
export async function GET() {
  try {
    return NextResponse.json({ version: await ytDlpVersion() }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}

/** "Buscar actualización ahora": runs yt-dlp's own updater, then reports the version. */
export async function POST() {
  try {
    const result = await updateYtDlpNow();
    return NextResponse.json({ result, version: await ytDlpVersion() });
  } catch (err) {
    return errorResponse(err);
  }
}
