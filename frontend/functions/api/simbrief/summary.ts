import { fetchSimbriefJson, SimbriefError } from "../../../lib/simbrief";

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

type Summary = {
  ok: true;
  origin: { icao: string; name?: string; lat?: number; lon?: number } | null;
  destination: { icao: string; name?: string; lat?: number; lon?: number } | null;
  alternate?: string | null;
  schedOut?: string | null;
  schedIn?: string | null;
  companyRoute?: string | null;
  zfw?: string | null;
  costIndex?: string | null;
  avgWind?: string | null;
  cruiseAlt?: string | null;
  route?: string | null;
  callsign?: string | null;
  plannedDistanceNm?: number | null;
  plannedEte?: string | null;
  plannedFuel?: string | null;
};

function t(x?: unknown): string | null {
  if (x == null) return null;
  if (typeof x === "string") {
    const s = x.trim();
    return s.length ? s : null;
  }
  if (typeof x === "number") {
    if (!Number.isFinite(x)) return null;
    const s = String(x);
    return s.length ? s : null;
  }
  return null;
}

function n(x?: unknown): number | null {
  if (x == null) return null;
  if (typeof x === "number") return Number.isFinite(x) ? x : null;
  const s = t(x);
  if (!s) return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

export const onRequestGet: PagesFunction = async (context) => {
  try {
    const url = new URL(context.request.url);
    const username = url.searchParams.get("username")?.trim();
    if (!username) return json({ ok: false, error: "Missing ?username" }, 400);

    const simbrief = (await fetchSimbriefJson(username)) as any;
    const root = simbrief?.OFP || simbrief;

    const origin: Summary["origin"] = root?.origin
      ? {
          icao: t(root.origin.icao_code) || "",
          name: t(root.origin.name) || undefined,
          lat: n(root.origin.pos_lat) ?? n(root.origin.lat) ?? undefined,
          lon: n(root.origin.pos_long) ?? n(root.origin.lon) ?? undefined,
        }
      : null;

    const destination: Summary["destination"] = root?.destination
      ? {
          icao: t(root.destination.icao_code) || "",
          name: t(root.destination.name) || undefined,
          lat: n(root.destination.pos_lat) ?? n(root.destination.lat) ?? undefined,
          lon: n(root.destination.pos_long) ?? n(root.destination.lon) ?? undefined,
        }
      : null;

    const data: Summary = {
      ok: true,
      origin: origin?.icao ? origin : null,
      destination: destination?.icao ? destination : null,
      alternate: t(root?.alternate?.icao_code) || t(root?.alternate?.icao) || null,
      schedOut: t(root?.times?.sched_out) || t(root?.times?.est_out) || null,
      schedIn: t(root?.times?.sched_in) || t(root?.times?.est_in) || null,
      companyRoute: t(root?.general?.company_route) || null,
      zfw:
        t(root?.weights?.zfw) ||
        t(root?.weights?.est_zfw) ||
        t(root?.weights?.planned_zfw) ||
        null,
      costIndex: t(root?.general?.costindex) || t(root?.general?.cost_index) || null,
      avgWind: t(root?.general?.avg_wind) || t(root?.winds?.avg_wind) || null,
      cruiseAlt:
        t(root?.general?.cruise_alt) ||
        t(root?.general?.cruise_altitude) ||
        t(root?.general?.initial_altitude) ||
        t(root?.cruise_alt) ||
        null,
      route: t(root?.general?.route) || null,
      callsign:
        t(root?.general?.callsign) ||
        (t(root?.general?.icao_airline) && t(root?.general?.flight_number)
          ? `${t(root?.general?.icao_airline)}${t(root?.general?.flight_number)}`
          : null),
      plannedDistanceNm: n(root?.general?.plan_rte_distance) ?? n(root?.general?.rte_distance) ?? null,
      plannedEte:
        t(root?.times?.enroute_time) ||
        t(root?.times?.ete) ||
        t(root?.times?.est_time_enroute) ||
        t(root?.times?.orig_est_block) ||
        null,
      plannedFuel:
        t(root?.fuel?.plan_ramp) ||
        t(root?.fuel?.planned_ramp) ||
        t(root?.fuel?.ramp) ||
        t(root?.fuel?.planned_total) ||
        null,
    };

    const compat: any = {
      general: {
        orig: data.origin?.icao || null,
        origin: data.origin?.icao || null,
        dest: data.destination?.icao || null,
        destination: data.destination?.icao || null,
        plan_id: t(root?.general?.plan_id) || null,
        unix_time: t(root?.general?.unix_time) || null,
      },
      params: {
        time_generated: t(root?.params?.time_generated) || null,
      },
    };

    return json({ ...data, ...compat });
  } catch (err: any) {
    if (err instanceof SimbriefError) return json({ ok: false, error: err.message }, err.status);
    return json({ ok: false, error: err?.message || String(err) }, 500);
  }
};

