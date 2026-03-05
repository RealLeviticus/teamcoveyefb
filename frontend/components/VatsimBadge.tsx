"use client";

import { useVatsimStatus } from "@/hooks/useVatsimStatus";

export function VatsimBadge() {
  const { loading, online, callsign, noCid, error } = useVatsimStatus(15000);

  const base =
    "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium transition-colors ring-1";

  // We only show green (online) or red (offline/no CID/error). No grey idle state.
  const variant =
    online
      ? "bg-green-100 text-green-700 ring-green-300/60 dark:bg-green-500/20 dark:text-green-300 dark:ring-green-400/30"
      : "bg-red-100 text-red-700 ring-red-300/60 dark:bg-red-500/20 dark:text-red-300 dark:ring-red-400/30";

  const dot =
    "h-2 w-2 rounded-full " +
    (online ? "bg-green-500 dark:bg-green-400" : "bg-red-500 dark:bg-red-400");

  const label = noCid
    ? "No CID Set"
    : online
    ? `VATSIM Online${callsign ? ` • ${callsign}` : ""}`
    : loading
    ? "VATSIM Offline (checking…)"
    : "VATSIM Offline";

  const title = noCid
    ? "No VATSIM CID saved in Settings"
    : error
    ? `Last error: ${error}`
    : online
    ? "Pilot online on VATSIM"
    : "Not online on VATSIM";

  return (
    <span
      className={`${base} ${variant}`}
      title={title}
      aria-live="polite"
      aria-busy={loading ? "true" : "false"}
    >
      <span className={dot} aria-hidden />
      {label}
    </span>
  );
}
