import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cid = searchParams.get("cid")?.trim();
  const callsign = searchParams.get("callsign")?.trim();

  if ((!cid || !/^\d+$/.test(cid)) && !callsign) {
    return NextResponse.json(
      { ok: false, error: "Missing ?cid or ?callsign" },
      { status: 400 }
    );
  }

  try {
    const r = await fetch("https://data.vatsim.net/v3/vatsim-data.json", {
      cache: "no-store",
      redirect: "follow",
    });
    if (!r.ok) {
      return NextResponse.json(
        { ok: false, error: `VATSIM fetch failed (${r.status})` },
        { status: 502 }
      );
    }

    const data = await r.json();
    const pilots = (data?.pilots as any[] | undefined) || [];

    let pilot: any | undefined;
    if (cid && /^\d+$/.test(cid)) {
      pilot = pilots.find((p) => String(p?.cid) === cid);
    } else if (callsign) {
      const cs = callsign.toUpperCase();
      pilot = pilots.find((p) => String(p?.callsign || "").toUpperCase() === cs);
    }

    return NextResponse.json({
      ok: true,
      online: Boolean(pilot),
      pilot:
        pilot && {
          cid: pilot.cid,
          callsign: pilot.callsign,
          altitude: pilot.altitude,
          groundspeed: pilot.groundspeed,
          lat: pilot.latitude,
          lon: pilot.longitude,
          dep: pilot.flight_plan?.departure,
          arr: pilot.flight_plan?.arrival,
          route: pilot.flight_plan?.route,
        },
      lastUpdate: data?.general?.update_timestamp ?? null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}
