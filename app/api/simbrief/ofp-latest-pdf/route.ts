import { NextRequest, NextResponse } from "next/server";
import { fetchSimbriefXml, parseSimbrief } from "@/lib/simbrief";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStore() {
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
    "CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store",
    "Surrogate-Control": "no-store",
  };
}

function bad(msg: string, code = 400) {
  return new NextResponse(JSON.stringify({ ok: false, error: msg }), {
    status: code,
    headers: { "Content-Type": "application/json", ...noStore() },
  });
}

const FLIGHTPLANS_BASE = "https://www.simbrief.com/ofp/flightplans/";

async function getSummary(originUrl: string, username?: string | null) {
  if (!username) return null;
  const res = await fetch(`${originUrl}/api/simbrief/summary?username=${encodeURIComponent(username)}`, {
    cache: "no-store",
    headers: { "User-Agent": "CoveyEFB/1.0" },
  });
  if (!res.ok) throw new Error(`summary ${res.status}`);
  return res.json();
}

async function validateUrl(url: string) {
  try {
    // Some hosts block HEAD – try HEAD first, then a minimal GET
    const head = await fetch(url, { method: "HEAD", cache: "no-store", redirect: "follow" });
    if (head.ok) return true;
    const get = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: { Range: "bytes=0-0" }, // pull only first byte
      redirect: "follow",
    });
    return get.ok;
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const originUrl = url.origin;

  const username = url.searchParams.get("username");
  let od = (url.searchParams.get("od") || "").toUpperCase().replace(/[^A-Z]/g, "");

  try {
    // Prefer username → derive orig/dest/plan_id from your summary
    let cacheKey: string | null = null;
    let pdfUrl: string | null = null;

    if (username) {
      // 1) Try authoritative PDF link from XML (files.pdf)
      try {
        const xml = await fetchSimbriefXml(username);
        const parsed = parseSimbrief(xml);
        if (parsed?.ofpPdfUrl) {
          const directUrl = parsed.ofpPdfUrl;
          const m = directUrl.match(/_PDF_(\d+)\.pdf/i);
          const cacheKey = m?.[1] || null;
          const body: any = { ok: true, url: directUrl, cacheKey, method: "xml" };
          return new NextResponse(JSON.stringify(body), {
            status: 200,
            headers: { "Content-Type": "application/json", ...noStore() },
          });
        }
      } catch {}
      // 2) Fallback to summary-derived filename
      const data = await getSummary(originUrl, username);
      if (!data) return bad("username provided but summary unavailable", 502);

      const o =
        (data?.origin?.icao ||
          data?.general?.orig ||
          data?.general?.origin ||
          "").toUpperCase();
      const d =
        (data?.destination?.icao ||
          data?.general?.dest ||
          data?.general?.destination ||
          "").toUpperCase();

      const planId =
        String(
          data?.general?.plan_id ??
            data?.general?.unix_time ??
            data?.params?.time_generated ??
            ""
        ).replace(/[^\d]/g, "");

      if (!o || !d || !planId) {
        // Fall back to provided od or bail
        if (!od) return bad("Could not resolve origin/destination/plan_id from summary", 502);
      } else {
        od = `${o}${d}`;
        cacheKey = planId;
        const fname = `${od}_PDF_${planId}.pdf`;
        pdfUrl = `${FLIGHTPLANS_BASE}${fname}`;
      }

      // Optional quick validation – if it 404s, we’ll still return it (SimBrief may lag a few seconds)
      if (pdfUrl) {
        const ok = await validateUrl(pdfUrl);
        // If not OK, we still return it; the viewer/proxy will retry shortly
      }

      if (pdfUrl) {
        const body: any = { ok: true, url: pdfUrl, cacheKey, method: "summary", od };
        return new NextResponse(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json", ...noStore() },
        });
      }
      // If we got here, we didn’t get planId – drop to the OD path below
    }

    // OD path (when username wasn’t provided or summary lacked plan_id)
    if (!od || !/^[A-Z]{8}$/.test(od)) {
      return bad("Provide ?username=YourSimBrief or ?od=ORIGDEST (e.g., YSSYYMML)", 400);
    }

    // If no plan_id, we cannot guess the numeric suffix reliably. Tell the caller to refresh summary.
    return bad("Missing plan_id; refresh SimBrief summary first", 409);
  } catch (e: any) {
    return bad(`Failed to resolve latest PDF: ${e?.message || e}`, 502);
  }
}
