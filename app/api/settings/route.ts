import { NextResponse } from "next/server";
import { saveConfig } from "@/lib/settings";
import type { StrategyConfig } from "@/strategy.config";

export const dynamic = "force-dynamic";

/** Persist a settings patch. The merged result is the single live config. */
export async function POST(req: Request) {
  try {
    const patch = (await req.json()) as Partial<StrategyConfig>;
    const next = await saveConfig(patch);
    return NextResponse.json({ ok: true, config: next });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
