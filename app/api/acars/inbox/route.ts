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

    if (process.env.HOPPIE_ENABLE !== "1") {
      return NextResponse.json(
        { ok: false, error: "ACARS not enabled. Set HOPPIE_ENABLE=1 and configure integration." },
        { status: 501, headers: noStore() }
      );
    }

    // TODO: Implement actual Hoppie inbox poll here
    return NextResponse.json({ ok: true, messages: [] }, { headers: noStore() });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to fetch inbox" }, { status: 500, headers: noStore() });
  }
}

