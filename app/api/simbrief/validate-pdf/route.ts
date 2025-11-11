// app/api/simbrief/validate-pdf/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAllowedHost(hostname: string) {
  const h = hostname.toLowerCase();
  return h === "simbrief.com" || h === "www.simbrief.com" || h === "dispatch.simbrief.com";
}

function isPdfFilename(s: string) {
  return /^[A-Za-z0-9._-]+\.pdf$/i.test(s);
}

// Build a set of candidate URLs to try, correcting common mistakes
function candidateUrlsFrom(raw: string): string[] {
  const s = raw.trim();
  const out: string[] = [];

  // 1) Absolute URL?
  let abs: URL | null = null;
  try {
    abs = new URL(s);
  } catch {
    abs = null;
  }

  if (abs) {
    if (!/^https?:$/i.test(abs.protocol)) return out;

    // If /<file>.pdf at site root, try canonical folder
    if (isPdfFilename(abs.pathname.replace(/^\/+/, "")) && !/\/ofp\/flightplans\//i.test(abs.pathname)) {
      const file = abs.pathname.split("/").pop()!;
      out.push(`https://www.simbrief.com/ofp/flightplans/${encodeURIComponent(file)}`);
    }

    // Push the original absolute URL too
    out.push(abs.toString());
  } else {
    // 2) Site-relative?
    if (s.startsWith("/")) {
      out.push(`https://www.simbrief.com${s}`);
      if (isPdfFilename(s.replace(/^\/+/, "")) && !/\/ofp\/flightplans\//i.test(s)) {
        const file = s.split("/").pop()!;
        out.push(`https://www.simbrief.com/ofp/flightplans/${encodeURIComponent(file)}`);
      }
    }

    // 3) Bare filename
    if (isPdfFilename(s)) {
      out.push(`https://www.simbrief.com/ofp/flightplans/${encodeURIComponent(s)}`);
    }
  }

  // De-dup
  return Array.from(new Set(out));
}

async function headThenGetCheck(urlStr: string) {
  // HEAD first
  try {
    const head = await fetch(urlStr, { method: "HEAD", cache: "no-store", redirect: "follow" });
    const ct = head.headers.get("content-type") || "";
    if (head.ok && ct.toLowerCase().includes("pdf")) return { ok: true };
    if (head.ok && urlStr.toLowerCase().endsWith(".pdf")) return { ok: true };
    // fall through
  } catch {
    // fall through
  }

  // GET fallback (header-only inspection)
  try {
    const get = await fetch(urlStr, { method: "GET", cache: "no-store", redirect: "follow" });
    const ct = get.headers.get("content-type") || "";
    if (get.ok && ct.toLowerCase().includes("pdf")) return { ok: true };
    if (get.ok && urlStr.toLowerCase().endsWith(".pdf")) return { ok: true };
    return { ok: false, error: `PDF not reachable or not a PDF (HTTP ${get.status}).` };
  } catch (e: any) {
    return { ok: false, error: `Validation failed: ${e?.message || String(e)}` };
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const targetRaw = url.searchParams.get("url")?.trim();
    if (!targetRaw) {
      return NextResponse.json({ ok: false, error: "Missing ?url parameter." }, { status: 400 });
    }

    const candidates = candidateUrlsFrom(targetRaw);
    if (!candidates.length) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Provide a SimBrief PDF as a full URL, a site-relative path (/ofp/flightplans/…).pdf, or a filename ending with .pdf.",
        },
        { status: 400 }
      );
    }

    // Must be SimBrief/dispatch hosts
    const filtered = candidates.filter((c) => {
      try {
        const h = new URL(c).hostname;
        return isAllowedHost(h);
      } catch {
        return false;
      }
    });
    if (!filtered.length) {
      return NextResponse.json(
        { ok: false, error: "URL host must be simbrief.com or dispatch.simbrief.com." },
        { status: 400 }
      );
    }

    // Try each candidate until one passes
    for (const cand of filtered) {
      const check = await headThenGetCheck(cand);
      if (check.ok) {
        return NextResponse.json({ ok: true, url: cand });
      }
    }

    // Nothing worked — return the last error we saw
    return NextResponse.json(
      { ok: false, error: "PDF not reachable on any candidate URL." },
      { status: 404 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: `Bad request: ${err?.message || String(err)}` },
      { status: 400 }
    );
  }
}
