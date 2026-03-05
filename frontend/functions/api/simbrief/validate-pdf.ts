function noStoreHeaders() {
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
  };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: noStoreHeaders() });
}

function isAllowedHost(hostname: string) {
  const h = hostname.toLowerCase();
  return h === "simbrief.com" || h === "www.simbrief.com" || h === "dispatch.simbrief.com";
}

function isPdfFilename(s: string) {
  return /^[A-Za-z0-9._-]+\.pdf$/i.test(s);
}

function candidateUrlsFrom(raw: string): string[] {
  const s = raw.trim();
  const out: string[] = [];
  let abs: URL | null = null;
  try {
    abs = new URL(s);
  } catch {
    abs = null;
  }

  if (abs) {
    if (!/^https?:$/i.test(abs.protocol)) return out;
    if (isPdfFilename(abs.pathname.replace(/^\/+/, "")) && !/\/ofp\/flightplans\//i.test(abs.pathname)) {
      const file = abs.pathname.split("/").pop()!;
      out.push(`https://www.simbrief.com/ofp/flightplans/${encodeURIComponent(file)}`);
    }
    out.push(abs.toString());
  } else {
    if (s.startsWith("/")) {
      out.push(`https://www.simbrief.com${s}`);
      if (isPdfFilename(s.replace(/^\/+/, "")) && !/\/ofp\/flightplans\//i.test(s)) {
        const file = s.split("/").pop()!;
        out.push(`https://www.simbrief.com/ofp/flightplans/${encodeURIComponent(file)}`);
      }
    }
    if (isPdfFilename(s)) out.push(`https://www.simbrief.com/ofp/flightplans/${encodeURIComponent(s)}`);
  }
  return Array.from(new Set(out));
}

async function headThenGetCheck(urlStr: string) {
  try {
    const head = await fetch(urlStr, { method: "HEAD", cache: "no-store", redirect: "follow" });
    const ct = head.headers.get("content-type") || "";
    if (head.ok && ct.toLowerCase().includes("pdf")) return { ok: true };
    if (head.ok && urlStr.toLowerCase().endsWith(".pdf")) return { ok: true };
  } catch {}

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

export const onRequestGet: PagesFunction = async (context) => {
  try {
    const url = new URL(context.request.url);
    const targetRaw = url.searchParams.get("url")?.trim();
    if (!targetRaw) return json({ ok: false, error: "Missing ?url parameter." }, 400);

    const candidates = candidateUrlsFrom(targetRaw);
    if (!candidates.length) {
      return json(
        {
          ok: false,
          error:
            "Provide a SimBrief PDF as a full URL, a site-relative path (/ofp/flightplans/...).pdf, or a filename ending with .pdf.",
        },
        400,
      );
    }

    const filtered = candidates.filter((c) => {
      try {
        return isAllowedHost(new URL(c).hostname);
      } catch {
        return false;
      }
    });
    if (!filtered.length) {
      return json({ ok: false, error: "URL host must be simbrief.com or dispatch.simbrief.com." }, 400);
    }

    for (const cand of filtered) {
      const check = await headThenGetCheck(cand);
      if (check.ok) return json({ ok: true, url: cand });
    }
    return json({ ok: false, error: "PDF not reachable on any candidate URL." }, 404);
  } catch (err: any) {
    return json({ ok: false, error: `Bad request: ${err?.message || String(err)}` }, 400);
  }
};

