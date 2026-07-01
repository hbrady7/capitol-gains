/** Control panel writes — patch the single-row `config` table. No redeploy needed. */
import { NextResponse } from "next/server";
import { getRunConfig, saveRunConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

const NUMERIC = new Set([
  "maxPerPosition",
  "maxPerDay",
  "maxOpenPositions",
  "drawdownHaltPct",
  "freshnessCutoffDays",
  "cooldownDays",
  "lookbackDays",
  "wCong",
  "wIns",
  "kConverge",
  "minDollarVolume",
  // exit desk
  "trailingStopPct",
  "hardStopPct",
  "takeProfitPct",
  "maxHoldDays",
]);
const BOOL = new Set(["killSwitch", "paperMode", "exitsEnabled", "confidenceSizing"]);

export async function GET() {
  return NextResponse.json(await getRunConfig());
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const patch: Record<string, number | boolean> = {};
  for (const [k, v] of Object.entries(body)) {
    if (BOOL.has(k)) patch[k] = Boolean(v);
    else if (NUMERIC.has(k)) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) patch[k] = n;
    }
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no valid fields" }, { status: 400 });
  }
  const next = await saveRunConfig(patch);
  return NextResponse.json(next);
}
