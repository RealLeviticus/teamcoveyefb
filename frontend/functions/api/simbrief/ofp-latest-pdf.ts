import { fetchSimbriefXml, parseSimbrief } from "../../../lib/simbrief";

function noStoreHeaders(contentType = "application/json") {
  return {
    "Content-Type": contentType,
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
    "CDN-Cache-Control": "no-store",
  };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: noStoreHeaders() });
}

const FLIGHTPLANS_BASE = "https://www.simbrief.com/ofp/flightplans/";

async function getSummary(originUrl: string, username?: string | null) {
  if (!username) return null;
  const res = await fetch(`${originUrl}/api/simbrief/summary?username=${encodeURIComponent(username)}`, {
    cache: "no-store",
    headers: { "User-Agent": "CoveyEFB/1.0" },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err: any = new Error(body?.error || `summary ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

async function validateUrl(url: string) {
  try {
    const head = await fetch(url, { method: "HEAD", cache: "no-store", redirect: "follow" });
    if (head.ok) return true;
    const get = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: { Range: "bytes=0-0" },
      redirect: "follow",
    });
    return get.ok;
  } catch {
    return false;
  }
}

export const onRequestGet: PagesFunction = async (context) => {
  const url = new URL(context.request.url);
  const originUrl = url.origin;

  const username = url.searchParams.get("username");
  let od = (url.searchParams.get("od") || "").toUpperCase().replace(/[^A-Z]/g, "");

  try {
    let cacheKey: string | null = null;
    let pdfUrl: string | null = null;

    if (username) {
      try {
        const xml = await fetchSimbriefXml(username);
        const parsed = parseSimbrief(xml);
        if (parsed?.ofpPdfUrl) {
          const directUrl = parsed.ofpPdfUrl;
          const m = directUrl.match(/_PDF_(\d+)\.pdf/i);
          cacheKey = m?.[1] || null;
          return json({ ok: true, url: directUrl, cacheKey, method: "xml" });
        }
      } catch {}

      const data = await getSummary(originUrl, username);
      if (!data) return json({ ok: false, error: "username provided but summary unavailable" }, 502);

      const o = (data?.origin?.icao || data?.general?.orig || data?.general?.origin || "").toUpperCase();
      const d = (data?.destination?.icao || data?.general?.dest || data?.general?.destination || "").toUpperCase();
      const planId = String(
        data?.general?.plan_id ?? data?.general?.unix_time ?? data?.params?.time_generated ?? "",
      ).replace(/[^\d]/g, "");

      if (!o || !d || !planId) {
        if (!od) return json({ ok: false, error: "Could not resolve origin/destination/plan_id from summary" }, 502);
      } else {
        od = `${o}${d}`;
        cacheKey = planId;
        const fname = `${od}_PDF_${planId}.pdf`;
        pdfUrl = `${FLIGHTPLANS_BASE}${fname}`;
      }

      if (pdfUrl) await validateUrl(pdfUrl);
      if (pdfUrl) return json({ ok: true, url: pdfUrl, cacheKey, method: "summary", od });
    }

    if (!od || !/^[A-Z]{8}$/.test(od)) {
      return json({ ok: false, error: "Provide ?username=YourSimBrief or ?od=ORIGDEST (e.g., YSSYYMML)" }, 400);
    }
    return json({ ok: false, error: "Missing plan_id; refresh SimBrief summary first" }, 409);
  } catch (e: any) {
    const status = Number(e?.status);
    const code = Number.isFinite(status) ? (status >= 500 ? 502 : status) : 502;
    return json({ ok: false, error: `Failed to resolve latest PDF: ${e?.message || e}` }, code);
  }
};

