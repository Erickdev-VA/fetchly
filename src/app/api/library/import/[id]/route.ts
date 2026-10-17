import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { errorResponse } from "@/lib/http";
import { getImport } from "@/lib/library/importJob";

export async function GET(_request: Request, ctx: RouteContext<"/api/library/import/[id]">) {
  try {
    const { id } = await ctx.params;
    const progress = getImport(id);
    if (!progress) throw new AppError("NOT_FOUND");
    return NextResponse.json(progress, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
