import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { approved, signals } from "@/lib/schema";

export const dynamic = "force-dynamic";

/** Approve / skip / clear a signal. Writing here is the ONLY way a signal enters
 *  the approved list Claude Code may act on. The app still never places a trade. */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const signalId = Number(body.signalId);
    const action = String(body.action); // 'approve' | 'skip' | 'clear'
    if (!signalId || !["approve", "skip", "clear"].includes(action)) {
      return NextResponse.json({ error: "bad request" }, { status: 400 });
    }

    if (action === "clear") {
      await db.delete(approved).where(eq(approved.signalId, signalId));
      return NextResponse.json({ ok: true, decided: null });
    }

    const [sig] = await db.select().from(signals).where(eq(signals.id, signalId)).limit(1);
    if (!sig) return NextResponse.json({ error: "unknown signal" }, { status: 404 });

    const sizeDollars = Number(body.sizeDollars ?? 0);
    const limitPrice = body.limitPrice != null ? Number(body.limitPrice) : null;
    const status = action === "skip" ? "skipped" : "pending";

    await db
      .insert(approved)
      .values({
        signalId,
        ticker: sig.ticker,
        side: sig.side,
        limitPrice,
        sizeDollars: sizeDollars || 0,
        status,
        approvedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: approved.signalId,
        set: { status, sizeDollars: sizeDollars || 0, limitPrice, approvedAt: new Date() },
      });

    return NextResponse.json({ ok: true, decided: action === "skip" ? "skipped" : "approved" });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
