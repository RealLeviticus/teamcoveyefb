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

function isAllowedHost(h: string) {
  const host = h.toLowerCase();
  return host === "simbrief.com" || host === "www.simbrief.com" || host === "dispatch.simbrief.com";
}

export const onRequestGet: PagesFunction = async (context) => {
  const reqUrl = new URL(context.request.url);
  const src = reqUrl.searchParams.get("url");

  if (!src) return json({ ok: false, error: "Missing url" }, 400);

  let target: URL;
  try {
    target = new URL(src);
  } catch {
    return json({ ok: false, error: "Invalid url" }, 400);
  }
  if (!/^https?:$/i.test(target.protocol) || !isAllowedHost(target.hostname)) {
    return json({ ok: false, error: "URL host must be simbrief.com" }, 400);
  }
  if (!/\.pdf(?:$|[?#])/i.test(target.pathname)) {
    return json({ ok: false, error: "URL must point to a .pdf" }, 400);
  }

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      cache: "no-store",
      redirect: "follow",
      headers: { "User-Agent": "CoveyEFB/1.0 (+ofp-proxy)" },
    });
  } catch {
    return json({ ok: false, error: "Upstream fetch failed" }, 502);
  }

  if (!upstream.ok || !upstream.body) {
    return json({ ok: false, error: `Upstream ${upstream.status}` }, 502);
  }

  const ct = upstream.headers.get("content-type") || "application/pdf";
  const disp = upstream.headers.get("content-disposition") || "inline";

  return new Response(upstream.body, {
    status: 200,
    headers: {
      ...noStoreHeaders(ct),
      "Content-Disposition": disp,
      "X-Accel-Buffering": "no",
    },
  });
};

