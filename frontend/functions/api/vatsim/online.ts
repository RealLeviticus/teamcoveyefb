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
  const url = new URL(context.request.url);
  const cid = url.searchParams.get("cid")?.trim();

  if (!cid || !/^\d+$/.test(cid)) {
    return json({ ok: false, error: "Missing or invalid ?cid" }, 400);
  }

  try {
    const r = await fetch("https://data.vatsim.net/v3/vatsim-data.json", {
      cache: "no-store",
      redirect: "follow",
    });
    if (!r.ok) {
      return json({ ok: false, error: `VATSIM fetch failed (${r.status})` }, 502);
    }

    const data = await r.json();
    const pilot = (data?.pilots as any[] | undefined)?.find((p) => String(p?.cid) === cid);

    return json({
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
    return json({ ok: false, error: e?.message || String(e) }, 500);
  }
};

