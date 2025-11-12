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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const logon = String(body?.logon || "").trim();
    const from = String(body?.from || "").trim();
    const to = String(body?.to || "").trim();
    const type = String(body?.type || "telex").trim();
    const text = String(body?.text || "");

    if (!logon || !from || !to || !text) {
      return NextResponse.json({ ok: false, error: "Missing logon/from/to/text" }, { status: 400, headers: noStore() });
    }

    // Submit to Hoppie ACARS system (form-encoded)
    const endpoint = "https://www.hoppie.nl/acars/system/connect.html";
    const form = new URLSearchParams();
    form.set("logon", logon);
    form.set("from", from);
    form.set("to", to);
    form.set("message", text);
    form.set("type", type);

    const r = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      cache: "no-store",
      redirect: "follow",
    });
    const respText = await r.text();
    if (!r.ok) {
      return NextResponse.json(
        { ok: false, error: `Hoppie HTTP ${r.status}`, response: respText?.slice(0, 200) },
        { status: 502, headers: noStore() }
      );
    }

    // Hoppie typically returns plain text; consider any non-empty 200 as success
    return NextResponse.json({ ok: true, response: (respText || "").trim() }, { headers: noStore() });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to send ACARS" }, { status: 500, headers: noStore() });
  }
}
