// app/api/vatsim/online/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cid = searchParams.get("cid")?.trim();

  if (!cid || !/^\d+$/.test(cid)) {
    return NextResponse.json(
      { ok: false, error: "Missing or invalid ?cid" },
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
    const pilot = (data?.pilots as any[] | undefined)?.find(
      (p) => String(p?.cid) === cid
    );

    return NextResponse.json({
      ok: true,
      online: Boolean(pilot),
      pilot:
        pilot && {
          cid: pilot.cid,
          callsign: pilot.callsign,
          altitude: pilot.altitude,
          groundspeed: pilot.groundspeed,
          latitude: pilot.latitude,
          longitude: pilot.longitude,
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
