"use client";

import React from "react";

export type FlightSummary = {
  origin?: { icao: string; name?: string; lat?: number | null; lon?: number | null } | null;
  destination?: { icao: string; name?: string; lat?: number | null; lon?: number | null } | null;
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

export type VatsimState = {
  online: boolean;

  // motion / pos
  lat?: number | null;
  lon?: number | null;
  groundspeed?: number | null;   // kts
  altitudeFt?: number | null;    // ft
  headingDeg?: number | null;    // deg
  remainingNm?: number | null;
  flownNm?: number | null;
  etaText?: string | null;
  phase?: "ground" | "climb" | "cruise" | "descent" | "unknown";

  // pilot / airline
  pilotName?: string | null;
  pilotCid?: string | null;
  airline?: string | null;

  // radios/transponder
  squawk?: string | null;
  com?: string | null; // not in VATSIM feed for pilots; left for future

  // FP overrides
  callsign?: string | null;
  route?: string | null;
  origin?: { icao: string; name?: string; lat?: number | null; lon?: number | null } | null;
  destination?: { icao: string; name?: string; lat?: number | null; lon?: number | null } | null;
  aircraft?: string | null;
  tasKts?: number | null;
  cruiseAltFt?: number | null;
  alternateIcao?: string | null;

  // tiny graphs
  gsHistory?: number[];
  altHistory?: number[];
};

type Props = {
  data: FlightSummary | null;
  loading?: boolean;
  error?: string | null;
  vatsim?: VatsimState | null;
  className?: string;
};

const clean = (s?: string | null) => {
  const t = (s ?? "").trim();
  return t.length ? t : null;
};

function InfoCell({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col items-start gap-1 min-w-[8ch]">
      <span className="text-[10px] uppercase tracking-wide opacity-60">{label}</span>
      <span className="text-sm font-medium">{clean(value) ?? "—"}</span>
    </div>
  );
}

function Sparkline({ data, title, suffix = "" }: { data?: number[] | null; title: string; suffix?: string }) {
  const arr = (data && data.length ? data : [0]).slice(-10);
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const span = max - min || 1;
  const pts = arr
    .map((v, i) => {
      const x = (i / (arr.length - 1 || 1)) * 100;
      const y = 100 - ((v - min) / span) * 100;
      return `${x},${y}`;
    })
    .join(" ");
  const last = arr[arr.length - 1];

  return (
    <div className="flex items-center gap-2">
      <svg viewBox="0 0 100 100" className="w-24 h-8">
        <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" className="opacity-70" />
      </svg>
      <div className="text-xs">
        <div className="opacity-60">{title}</div>
        <div className="font-medium">{Math.round(last)}{suffix}</div>
      </div>
    </div>
  );
}

export function FlightCard({ data, loading, error, vatsim, className }: Props) {
  // Prefer every non-empty VATSIM field when online
  const merged: FlightSummary | null = React.useMemo(() => {
    if (!data) return null;
    if (!vatsim?.online) return data;

    return {
      ...data,
      origin: vatsim.origin ?? data.origin,
      destination: vatsim.destination ?? data.destination,
      callsign: clean(vatsim.callsign) ?? data.callsign ?? null,
      route: clean(vatsim.route) ?? data.route ?? null,
      alternate: vatsim.alternateIcao ?? data.alternate ?? null,
      cruiseAlt:
        vatsim.cruiseAltFt != null
          ? `${Math.round(vatsim.cruiseAltFt)} ft`
          : data.cruiseAlt ?? null,
    };
  }, [data, vatsim]);

  const o = merged?.origin;
  const d = merged?.destination;

  const pct =
    vatsim?.flownNm != null &&
    merged?.plannedDistanceNm &&
    merged.plannedDistanceNm > 0
      ? Math.max(0, Math.min(100, Math.round((vatsim.flownNm / merged.plannedDistanceNm) * 100)))
      : 0;

  const statusClasses = vatsim?.online
    ? "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400"
    : "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400";

  const phaseText =
    vatsim?.phase === "ground" ? "On ground"
    : vatsim?.phase === "climb" ? "Climbing"
    : vatsim?.phase === "descent" ? "Descending"
    : vatsim?.phase === "cruise" ? "Cruising"
    : "";

  return (
    <div
      className={[
        "rounded-xl border p-4 w-full shadow-lg",
        "bg-white text-neutral-900 border-neutral-200",
        "dark:bg-neutral-900 dark:text-neutral-100 dark:border-neutral-800",
        className || "",
      ].join(" ")}
    >
      {/* Header row */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-2xl font-extrabold leading-none">{o?.icao ?? "----"}</div>
          <div className="text-[11px] opacity-70">{o?.name ?? ""}</div>
        </div>

        <div className="flex-1 mx-3 flex items-center pt-2">
          <div className="h-px flex-1 border-t border-dashed border-neutral-300 dark:border-neutral-600" />
          <svg viewBox="0 0 20 20" className="mx-2 w-5 h-5 rotate-90 fill-sky-600 dark:fill-sky-400" aria-hidden>
            <path d="M10 0l2 8h6l-8 4 2 8-4-6-8 2 6-4-6-4 8 2z" />
          </svg>
          <div className="h-px flex-1 border-t border-dashed border-neutral-300 dark:border-neutral-600" />
        </div>

        <div className="text-right">
          <div className="text-2xl font-extrabold leading-none">{d?.icao ?? "----"}</div>
          <div className="text-[11px] opacity-70">{d?.name ?? ""}</div>
        </div>
      </div>

      {/* Pilot / Airline */}
      {vatsim?.online && (vatsim.pilotName || vatsim.airline) && (
        <div className="flex items-center justify-between text-xs opacity-80 mb-2">
          <span>
            {vatsim.pilotName ? vatsim.pilotName : ""}
            {vatsim.pilotCid ? ` • ${vatsim.pilotCid}` : ""}
          </span>
          <span>{vatsim.airline || ""}</span>
        </div>
      )}

      {/* Times + VATSIM pill */}
      <div className="flex items-center justify-between text-xs opacity-80 mb-3">
        <span>{merged?.schedOut ?? "—"}</span>
        <div className={["px-2 py-0.5 rounded-full font-medium transition-colors", statusClasses].join(" ")}
             title={vatsim?.online ? "Pilot online on VATSIM" : "Not online on VATSIM"}>
          VATSIM {vatsim?.online ? "Online" : "Offline"}
        </div>
        <span>{merged?.schedIn ?? "—"}</span>
      </div>

      {/* Phase / Remaining / ETA */}
      {vatsim?.online && (
        <div className="mb-2 text-xs opacity-80">
          <span className="font-medium">{phaseText}</span>
          {typeof vatsim.remainingNm === "number" && merged?.plannedDistanceNm != null ? (
            <> • {Math.max(0, Math.round(vatsim.remainingNm))} / {Math.round(merged.plannedDistanceNm)} NM
               {vatsim.etaText ? ` • ETA ${vatsim.etaText}` : ""}</>
          ) : null}
        </div>
      )}

      {/* Progress bar */}
      {vatsim?.online && (
        <div className="mb-3">
          <div className="h-2 rounded bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
            <div className="h-full bg-sky-600 dark:bg-sky-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {/* Core stats (Radar-like) */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-4 py-3 border-y border-neutral-200 dark:border-neutral-800">
        <InfoCell label="GS" value={vatsim?.online && vatsim?.groundspeed != null ? `${Math.round(vatsim.groundspeed)} kts` : "—"} />
        <InfoCell label="Altitude" value={vatsim?.online && vatsim?.altitudeFt != null ? `${Math.round(vatsim.altitudeFt)} ft` : merged?.cruiseAlt || "—"} />
        <InfoCell label="Heading" value={vatsim?.online && vatsim?.headingDeg != null ? `${Math.round(vatsim.headingDeg)}°` : "—"} />
        <InfoCell label="Squawk" value={vatsim?.online ? vatsim?.squawk ?? "—" : "—"} />
        <InfoCell label="COM" value={vatsim?.online ? vatsim?.com ?? "—" : "—"} />
        <InfoCell label="Callsign" value={clean(merged?.callsign) ?? "—"} />
      </div>

      {/* Route + plan / aircraft */}
      <div className="mt-3">
        <div className="text-[10px] uppercase tracking-wide opacity-60 mb-1">Route (VATSIM overrides when online)</div>
        <div className="text-sm font-mono whitespace-pre-wrap break-words leading-relaxed">
          {clean(merged?.route) ?? "—"}
        </div>

        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <InfoCell label="Aircraft" value={vatsim?.aircraft ?? "—"} />
          <InfoCell label="TAS" value={vatsim?.tasKts != null ? `${Math.round(vatsim.tasKts)} kts` : "—"} />
          <InfoCell label="Cruise Alt" value={vatsim?.cruiseAltFt != null ? `${Math.round(vatsim.cruiseAltFt)} ft` : merged?.cruiseAlt} />
          <InfoCell label="Alternate" value={vatsim?.alternateIcao ?? merged?.alternate} />
          <InfoCell label="Planned Distance" value={merged?.plannedDistanceNm != null ? `${Math.round(merged.plannedDistanceNm)} NM` : "—"} />
          <InfoCell label="Planned ETE" value={merged?.plannedEte} />
        </div>
      </div>

      {/* Mini graphs */}
      {vatsim?.online && (vatsim.gsHistory?.length || vatsim.altHistory?.length) ? (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Sparkline data={vatsim.gsHistory} title="Groundspeed" suffix=" kts" />
          <Sparkline data={vatsim.altHistory} title="Altitude" suffix=" ft" />
        </div>
      ) : null}

      {loading && <div className="mt-3 text-xs opacity-70">Loading latest flight…</div>}
      {error && <div className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</div>}
    </div>
  );
}
