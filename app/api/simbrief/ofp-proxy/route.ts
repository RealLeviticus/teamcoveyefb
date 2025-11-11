import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStoreHeaders() {
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
    "CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store",
    "Surrogate-Control": "no-store",
  };
}

function isAllowedHost(h: string) {
  const host = h.toLowerCase();
  return host === "simbrief.com" || host === "www.simbrief.com" || host === "dispatch.simbrief.com";
}

export async function GET(req: NextRequest) {
  const src = req.nextUrl.searchParams.get("url");
  const cv = req.nextUrl.searchParams.get("cv") || ""; // cache-buster token (unused server-side, but part of URL)

  if (!src) {
    return NextResponse.json({ ok: false, error: "Missing url" }, { status: 400, headers: noStoreHeaders() });
  }

  let target: URL;
  try {
    target = new URL(src);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid url" }, { status: 400, headers: noStoreHeaders() });
  }
  if (!/^https?:$/i.test(target.protocol) || !isAllowedHost(target.hostname)) {
    return NextResponse.json({ ok: false, error: "URL host must be simbrief.com" }, { status: 400, headers: noStoreHeaders() });
  }
  if (!/\.pdf(?:$|[?#])/i.test(target.pathname)) {
    return NextResponse.json({ ok: false, error: "URL must point to a .pdf" }, { status: 400, headers: noStoreHeaders() });
  }

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      cache: "no-store",
      redirect: "follow",
      headers: { "User-Agent": "CoveyEFB/1.0 (+ofp-proxy)" },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "Upstream fetch failed" }, { status: 502, headers: noStoreHeaders() });
  }

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ ok: false, error: `Upstream ${upstream.status}` }, { status: 502, headers: noStoreHeaders() });
  }

  const ct = upstream.headers.get("content-type") || "application/pdf";
  const disp = upstream.headers.get("content-disposition") || "inline";

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      ...noStoreHeaders(),
      "Content-Type": ct,
      "Content-Disposition": disp,
      // Ensure Next streams without buffering
      "X-Accel-Buffering": "no",
    },
  });
}
