import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { base?: string; action?: string };

async function tryFetch(url: string, init?: RequestInit) {
  try {
    const r = await fetch(url, { redirect: "follow", cache: "no-store", ...(init || {}) });
    return r.ok ? { ok: true as const, status: r.status } : { ok: false as const, status: r.status };
  } catch {
    return { ok: false as const, status: 0 };
  }
}

export async function POST(req: Request) {
  const j = (await req.json().catch(() => ({}))) as Body;
  const base = (j.base || "").trim();
  const action = (j.action || "").trim();
  if (!base || !action) return NextResponse.json({ ok: false, error: "Missing base or action" }, { status: 400 });

  // Heuristic attempts – GSX Remote endpoints are not public; we try a few common patterns
  const baseTrim = base.replace(/\/$/, "");
  const candidates: { url: string; init?: RequestInit }[] = [
    { url: `${baseTrim}/api/${encodeURIComponent(action)}`, init: { method: "POST" } },
    { url: `${baseTrim}/api/${encodeURIComponent(action)}`, init: { method: "GET" } },
    { url: `${baseTrim}/${encodeURIComponent(action)}`, init: { method: "POST" } },
    { url: `${baseTrim}/${encodeURIComponent(action)}`, init: { method: "GET" } },
    { url: `${baseTrim}/?action=${encodeURIComponent(action)}`, init: { method: "GET" } },
    // additional common guesses seen in various builds
    { url: `${baseTrim}/gsx/${encodeURIComponent(action)}`, init: { method: "POST" } },
    { url: `${baseTrim}/GSX/${encodeURIComponent(action)}`, init: { method: "POST" } },
  ];

  const attempted: { url: string; status: number }[] = [];
  for (const c of candidates) {
    const r = await tryFetch(c.url, c.init);
    attempted.push({ url: c.url, status: r.status });
    if (r.ok) return NextResponse.json({ ok: true, status: r.status, attempted });
  }

  return NextResponse.json({ ok: false, error: "No known endpoint accepted the command", attempted }, { status: 502 });
}
