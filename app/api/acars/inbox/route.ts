import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore() {
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
  };
}

export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl;
    const logon = url.searchParams.get("logon")?.trim();
    const callsign = url.searchParams.get("from")?.trim();
    if (!logon || !callsign) {
      return NextResponse.json({ ok: false, error: "Missing logon/from" }, { status: 400, headers: noStore() });
    }

    // Poll Hoppie inbox (plain-text). Endpoint and parameters based on public docs.
    const endpoint = "https://www.hoppie.nl/acars/system/connect.html";
    const qs = new URLSearchParams();
    qs.set("logon", logon);
    qs.set("from", callsign);
    qs.set("poll", "1");

    const r = await fetch(`${endpoint}?${qs.toString()}`, {
      cache: "no-store",
      redirect: "follow",
    });
    const txt = await r.text();
    if (!r.ok) {
      return NextResponse.json(
        { ok: false, error: `Hoppie HTTP ${r.status}`, response: txt?.slice(0, 200) },
        { status: 502, headers: noStore() }
      );
    }

    // Attempt to parse lines; otherwise return raw messages
    const lines = (txt || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const messages = lines.map((line) => {
      // Heuristic split: time|from|to|text OR from>to text
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
        if (m) { fromF = m[1]; toF = m[2]; text = m[3]; }
      }
      return { time, from: fromF, to: toF, text };
    });

    return NextResponse.json({ ok: true, messages }, { headers: noStore() });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to fetch inbox" }, { status: 500, headers: noStore() });
  }
}
