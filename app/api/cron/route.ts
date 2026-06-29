/**
 * Protected HTTP trigger for the full brain (ingest → score → decide → execute).
 *
 * This is the documented Vercel-Pro alternative to the GitHub Actions cron. We
 * SHIP the Actions path (a deep Opus+thinking call can exceed Vercel's function
 * timeout); this route exists so the same pipeline can be fired over HTTP if you
 * move to the all-in-one Vercel setup. It is bearer-protected with CRON_SECRET.
 *
 * NOTE: the analysis stage (Opus + extended thinking) can run long; on Vercel keep
 * it under the function ceiling, or call the stages separately.
 */
import { NextResponse } from "next/server";
import { runIngest } from "@/lib/ingest";
import { runScore } from "@/lib/score-run";
import { runDecide } from "@/lib/decide";
import { runExecute } from "@/lib/execute";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed if not configured
  const auth = req.headers.get("authorization") || "";
  return auth === `Bearer ${secret}`;
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const ingest = await runIngest();
    const score = await runScore();
    const decide = await runDecide();
    const execute = await runExecute();
    return NextResponse.json({
      ok: true,
      ingest: { congress: ingest.congress.inserted, insider: ingest.insider.inserted },
      score: { candidates: score.candidates, top: score.topTicker },
      decide: { action: decide.decision.action, ticker: decide.decision.ticker },
      execute,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// Vercel Cron uses GET; mirror POST so a vercel.json cron entry can hit this path.
export const GET = POST;
