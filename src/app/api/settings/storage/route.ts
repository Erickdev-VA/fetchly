import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { storageUsage } from "@/lib/library/storage";

export async function GET() {
  try {
    return NextResponse.json(await storageUsage(), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
