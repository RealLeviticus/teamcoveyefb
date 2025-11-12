import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const base = (searchParams.get("base") || "").trim();
  if (!base) return NextResponse.json({ ok: false, error: "Missing ?base" }, { status: 400 });
  try {
    // Try a lightweight GET; some servers might not respond to HEAD properly
    const r = await fetch(base, { method: "GET", redirect: "follow", cache: "no-store" });
    if (!r.ok) return NextResponse.json({ ok: false, error: `Host responded ${r.status}` }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

