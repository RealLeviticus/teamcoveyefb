// Cloudflare Worker proxy (VATSIM + SimBrief)
// Env:
//   ALLOW_ORIGIN = https://efb.actuallyleviticus.xyz   (comma-separate if multiple)
// Optional: tweak TIMEOUT_MS if you like.
const TIMEOUT_MS = 12_000;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get("origin") || "";
    const corsOk = isAllowedOrigin(origin, env.ALLOW_ORIGIN);
    const corsHeaders = corsOk
      ? {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Max-Age": "86400",
        }
      : {};

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      if (url.pathname === "/health") {
        return json({ ok: true, ts: Date.now() }, corsHeaders);
      }

      if (url.pathname === "/vatsim/data") {
        const r = await doFetch("https://data.vatsim.net/v3/vatsim-data.json");
        return relay(r, corsHeaders, "application/json");
      }

      if (url.pathname === "/simbrief/summary") {
        const username = (url.searchParams.get("username") || "").trim();
        if (!username) return json({ ok: false, error: "username required" }, corsHeaders, 400);
        const r = await doFetch(
          `https://www.simbrief.com/api/xml.fetcher.php?username=${encodeURIComponent(username)}`
        );
        return relay(r, corsHeaders, "application/xml");
      }

      if (url.pathname === "/simbrief/ofp-pdf") {
        const file = (url.searchParams.get("file") || "").trim();
        if (!file) return json({ ok: false, error: "file required" }, corsHeaders, 400);
        const r = await doFetch(`https://www.simbrief.com/ofp/flightplans/${encodeURIComponent(file)}`);
        return relay(r, corsHeaders, "application/pdf");
      }

      return json({ ok: false, error: "not found" }, corsHeaders, 404);
    } catch (err) {
      return json({ ok: false, error: String(err) }, corsHeaders, 500);
    }
  },
};

function isAllowedOrigin(origin, allowList) {
  if (!allowList) return false;
  if (!origin) return false;
  const allowed = allowList.split(/[,\\s]+/).filter(Boolean);
  return allowed.includes(origin);
}

async function doFetch(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort("timeout"), TIMEOUT_MS);
  try {
    return await fetch(url, { signal: ctrl.signal, cf: { cacheTtl: 0, cacheEverything: false } });
  } finally {
    clearTimeout(t);
  }
}

async function relay(r, extraHeaders, forcedType) {
  const body = await r.arrayBuffer();
  const headers = {
    ...extraHeaders,
    "Content-Type": forcedType || r.headers.get("content-type") || "application/octet-stream",
  };
  return new Response(body, { status: r.status, statusText: r.statusText, headers });
}

function json(obj, extraHeaders, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...(extraHeaders || {}) },
  });
}