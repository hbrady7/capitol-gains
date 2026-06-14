import { NextResponse } from "next/server";
import { setMeta } from "@/lib/meta";

export const dynamic = "force-dynamic";

/** Persist onboarding acknowledgements (manual steps we can't auto-detect). */
export async function POST(req: Request) {
  try {
    const { key, value } = await req.json();
    if (typeof key !== "string" || !key.startsWith("ack_")) {
      return NextResponse.json({ error: "bad key" }, { status: 400 });
    }
    await setMeta(key, value ? "1" : "0");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
