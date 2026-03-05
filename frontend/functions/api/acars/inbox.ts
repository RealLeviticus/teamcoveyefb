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

export const onRequestGet: PagesFunction = async (context) => {
  try {
    const url = new URL(context.request.url);
    const logon = url.searchParams.get("logon")?.trim();
    const callsign = url.searchParams.get("from")?.trim();
    if (!logon || !callsign) return json({ ok: false, error: "Missing logon/from" }, 400);

    const endpoint = "https://www.hoppie.nl/acars/system/connect.html";
    const qs = new URLSearchParams();
    qs.set("logon", logon);
    qs.set("from", callsign);
    qs.set("to", "SERVER");
    qs.set("type", "poll");

    const r = await fetch(`${endpoint}?${qs.toString()}`, {
      cache: "no-store",
      redirect: "follow",
    });
    const txt = await r.text();
    if (!r.ok) {
      return json({ ok: false, error: `Hoppie HTTP ${r.status}`, response: txt?.slice(0, 200) }, 502);
    }
    const body = (txt || "").trim();
    if (/^ok\s*$/i.test(body)) return json({ ok: true, messages: [] });

    const lines = body
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .filter((l) => !/^ok\s*(?:\(.*\))?$/i.test(l));

    const messages = lines.map((line) => {
      let time: string | undefined;
      let fromF: string | undefined;
      let toF: string | undefined;
      let text: string = line;
      const pipe = line.split("|");
      if (pipe.length >= 4) {
        time = pipe[0];
        fromF = pipe[1];
        toF = pipe[2];
        text = pipe.slice(3).join("|");
      } else {
        const m = line.match(/^([^>\s]+)\s*>\s*([^:]+)\s*:?\s*(.*)$/);
        if (m) {
          fromF = m[1];
          toF = m[2];
          text = m[3];
        }
      }
      return { time, from: fromF, to: toF, text };
    });

    return json({ ok: true, messages });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Failed to fetch inbox" }, 500);
  }
};

