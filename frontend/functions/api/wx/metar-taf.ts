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

async function fetchText(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { cache: "no-store", redirect: "follow" });
    if (!r.ok) return null;
    const t = await r.text();
    return (t || "").trim() || null;
  } catch {
    return null;
  }
}

async function resolveStationsFromUsername(originUrl: string, username: string): Promise<string[]> {
  try {
    const r = await fetch(`${originUrl}/api/simbrief/summary?username=${encodeURIComponent(username)}`, {
      cache: "no-store",
      headers: { "User-Agent": "CoveyEFB/1.0 (+wx)" },
    });
    if (!r.ok) return [];
    const j = await r.json();
    const list = [j?.origin?.icao, j?.destination?.icao, j?.alternate || null]
      .map((x: any) => (typeof x === "string" ? x.trim().toUpperCase() : ""))
      .filter((x: string) => /^[A-Z]{4}$/.test(x));
    return Array.from(new Set(list));
  } catch {
    return [];
  }
}

export const onRequestGet: PagesFunction = async (context) => {
  const url = new URL(context.request.url);
  const originUrl = url.origin;

  try {
    const stationsParam = url.searchParams.get("stations")?.trim();
    const username = url.searchParams.get("username")?.trim();

    let stations: string[] = [];
    if (stationsParam) {
      stations = stationsParam
        .split(/[,\s]+/)
        .map((s) => s.trim().toUpperCase())
        .filter((s) => /^[A-Z]{4}$/.test(s));
    }
    if (!stations.length && username) stations = await resolveStationsFromUsername(originUrl, username);
    stations = Array.from(new Set(stations)).slice(0, 5);

    if (!stations.length) {
      return json({ ok: false, error: "Provide ?stations=AAAA,BBBB or ?username=..." }, 400);
    }

    const out: Record<
      string,
      { metar?: string; taf?: string; metarTime?: string | null; tafTime?: string | null }
    > = {};

    for (const icao of stations) {
      const mUrl = `https://tgftp.nws.noaa.gov/data/observations/metar/stations/${icao}.TXT`;
      const tUrl = `https://tgftp.nws.noaa.gov/data/forecasts/taf/stations/${icao}.TXT`;
      const [m, t] = await Promise.all([fetchText(mUrl), fetchText(tUrl)]);

      const parseLines = (txt: string | null) => {
        if (!txt) return { time: null as string | null, body: undefined as string | undefined };
        const lines = txt.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        if (!lines.length) return { time: null, body: undefined };

        const time = lines.length > 1 ? lines[0] : null;
        const payload = lines.length > 1 ? lines.slice(1) : [...lines];
        while (payload.length && /^(METAR|SPECI|TAF)$/i.test(payload[0])) payload.shift();

        const body = payload.join("\n").trim() || undefined;
        return { time, body };
      };

      const mp = parseLines(m);
      const tp = parseLines(t);
      out[icao] = { metar: mp.body, metarTime: mp.time, taf: tp.body, tafTime: tp.time };
    }

    return json({ ok: true, data: out });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Failed to fetch METAR/TAF" }, 500);
  }
};

