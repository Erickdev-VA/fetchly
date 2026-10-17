import { NextResponse } from "next/server";
import { libraryRevision } from "@/lib/library/items";

/** Cheap check pages poll to know when to reload their list. */
export async function GET() {
  return NextResponse.json({ revision: libraryRevision() }, { headers: { "Cache-Control": "no-store" } });
}
