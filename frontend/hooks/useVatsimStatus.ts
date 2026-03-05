"use client";

import { useEffect, useState } from "react";
import { loadSettings } from "@/lib/settings";

export type VatsimStatus = {
  loading: boolean;
  online: boolean; // now always boolean (no null state shown in UI)
  callsign?: string;
  noCid?: boolean;
  error?: string | null;
};

export function useVatsimStatus(pollMs = 15000): VatsimStatus {
  const [state, setState] = useState<VatsimStatus>({
    loading: true,
    online: false,
    error: null,
  });

  useEffect(() => {
    let timer: number | undefined;

    const tick = async () => {
      const cid = loadSettings().vatsimCid?.trim();

      if (!cid) {
        setState({ loading: false, online: false, noCid: true, error: null });
        return;
      }

      setState((s) => ({ ...s, loading: true, noCid: false, error: null }));

      // 1) Try our server proxy
      try {
        const r = await fetch(`/api/vatsim/online?cid=${encodeURIComponent(cid)}`, {
          cache: "no-store",
        });

        // If server route is missing or fails, fall back to public feed
        if (!r.ok) throw new Error(`Proxy HTTP ${r.status}`);

        const j = await r.json();
        if (j?.ok) {
          setState({
            loading: false,
            online: Boolean(j.online),
            callsign: j?.pilot?.callsign,
            noCid: false,
            error: null,
          });
          return;
        }

        // j not ok -> fall through to fallback
        throw new Error(j?.error || "Proxy returned !ok");
      } catch (e: any) {
        // 2) Fallback: query the public VATSIM feed directly
        try {
          const f = await fetch("https://data.vatsim.net/v3/vatsim-data.json", {
            cache: "no-store",
            redirect: "follow",
          });
          if (!f.ok) throw new Error(`Feed HTTP ${f.status}`);

          const data = await f.json();
          const pilot = (data?.pilots as any[] | undefined)?.find(
            (p) => String(p?.cid) === cid
          );

          setState({
            loading: false,
            online: Boolean(pilot),
            callsign: pilot?.callsign,
            noCid: false,
            error: null,
          });
        } catch (e2: any) {
          // Final failure: show as offline (red) and keep error for tooltip
          setState({
            loading: false,
            online: false,
            callsign: undefined,
            noCid: false,
            error: e2?.message || e?.message || "Unknown error",
          });
        }
      }
    };

    void tick();
    timer = window.setInterval(tick, pollMs);
    return () => {
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [pollMs]);

  return state;
}
