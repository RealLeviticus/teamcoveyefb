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

    // Placeholder: wire up to Hoppie ACARS or a relay later
    // For safety, we do not call external services without explicit configuration
    if (process.env.HOPPIE_ENABLE !== "1") {
      return NextResponse.json(
        { ok: false, error: "ACARS not enabled. Set HOPPIE_ENABLE=1 and configure integration." },
        { status: 501, headers: noStore() }
      );
    }

    // TODO: Implement actual Hoppie submit here (requires network + credentials)
    return NextResponse.json({ ok: true, queued: true }, { headers: noStore() });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to send ACARS" }, { status: 500, headers: noStore() });
  }
}

