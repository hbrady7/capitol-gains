import { NextResponse } from "next/server";
import { runSync } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** "Sync now" — pull latest disclosures. Never throws to the client. */
export async function POST() {
  const result = await runSync();
  const status = result.error ? 502 : 200;
  return NextResponse.json(result, { status });
}
