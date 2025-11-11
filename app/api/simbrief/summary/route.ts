import { NextResponse } from "next/server";
import { XMLParser } from "fast-xml-parser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  plannedEte?: string | null;        // HH:MM
  plannedFuel?: string | null;       // as text
};

function t(x?: unknown): string | null {
  const s = typeof x === "string" ? x.trim() : "";
  return s.length ? s : null;
}
function n(x?: unknown): number | null {
  const s = t(x);
  if (!s) return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const username = url.searchParams.get("username")?.trim();
    if (!username) {
      return NextResponse.json(
        { ok: false, error: "Missing ?username" },
        { status: 400 }
      );
    }

    const res = await fetch(
      `https://www.simbrief.com/api/xml.fetcher.php?username=${encodeURIComponent(
        username
      )}`,
      { cache: "no-store", redirect: "follow" }
    );
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `SimBrief fetch failed (HTTP ${res.status})` },
        { status: 502 }
      );
    }

    const xml = await res.text();

    const parser = new XMLParser({
      ignoreAttributes: false,
      allowBooleanAttributes: true,
      parseTagValue: true,
      trimValues: true,
    });
    const doc = parser.parse(xml) as any;
    const root = doc?.OFP || doc;

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

    const alternate =
      t(root?.alternate?.icao_code) || t(root?.alternate?.icao) || null;

    const schedOut =
      t(root?.times?.sched_out) || t(root?.times?.est_out) || null;
    const schedIn =
      t(root?.times?.sched_in) || t(root?.times?.est_in) || null;

    const route = t(root?.general?.route) || null;
    const costIndex =
      t(root?.general?.costindex) || t(root?.general?.cost_index) || null;

    const zfw =
      t(root?.weights?.zfw) ||
      t(root?.weights?.est_zfw) ||
      t(root?.weights?.planned_zfw) ||
      null;

    const cruiseAlt =
      t(root?.general?.cruise_alt) ||
      t(root?.general?.cruise_altitude) ||
      t(root?.general?.initial_altitude) ||
      t(root?.cruise_alt) ||
      null;

    const avgWind =
      t(root?.general?.avg_wind) ||
      t(root?.winds?.avg_wind) ||
      null;

    const callsign =
      t(root?.general?.callsign) ||
      (t(root?.general?.icao_airline) && t(root?.general?.flight_number)
        ? `${t(root?.general?.icao_airline)}${t(root?.general?.flight_number)}`
        : null);

    const plannedDistanceNm =
      n(root?.general?.plan_rte_distance) ??
      n(root?.general?.rte_distance) ??
      null;

    const plannedEte =
      t(root?.times?.enroute_time) ||
      t(root?.times?.ete) ||
      t(root?.times?.est_time_enroute) ||
      t(root?.times?.orig_est_block) ||
      null;

    const plannedFuel =
      t(root?.fuel?.plan_ramp) ||
      t(root?.fuel?.planned_ramp) ||
      t(root?.fuel?.ramp) ||
      t(root?.fuel?.planned_total) ||
      null;

    const data: Summary = {
      ok: true,
      origin: origin?.icao ? origin : null,
      destination: destination?.icao ? destination : null,
      alternate,
      schedOut,
      schedIn,
      companyRoute: t(root?.general?.company_route) || null,
      zfw,
      costIndex,
      avgWind,
      cruiseAlt,
      route,
      callsign,
      plannedDistanceNm,
      plannedEte,
      plannedFuel,
    };

    // Compatibility fields expected by ofp-latest-pdf route
    const compat: any = {
      general: {
        // duplicate ICAOs in general as used by ofp-latest-pdf fallback logic
        orig: data.origin?.icao || null,
        origin: data.origin?.icao || null,
        dest: data.destination?.icao || null,
        destination: data.destination?.icao || null,
        // pass-through identifiers when present in XML
        plan_id: t(root?.general?.plan_id) || null,
        unix_time: t(root?.general?.unix_time) || null,
      },
      params: {
        time_generated: t(root?.params?.time_generated) || null,
      },
    };

    return NextResponse.json({ ...data, ...compat });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || String(err) },
      { status: 500 }
    );
  }
}
