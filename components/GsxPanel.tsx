"use client";

import React, { useEffect, useMemo, useState } from "react";
import { loadSettings } from "@/lib/settings";

type CommandResult = { ok: boolean; status?: number; error?: string; attempted?: { url: string; status: number }[] };

const DEFAULT_BASE = "http://127.0.0.1:8380";

const ACTIONS: { id: string; label: string }[] = [
  { id: "boarding_start", label: "Start Boarding" },
  { id: "boarding_stop", label: "Stop Boarding" },
  { id: "deboarding_start", label: "Start Deboard" },
  { id: "catering_start", label: "Request Catering" },
  { id: "fuel_start", label: "Request Fuel" },
  { id: "pushback_left", label: "Pushback Left" },
  { id: "pushback_right", label: "Pushback Right" },
  { id: "pushback_straight", label: "Pushback Straight" },
  { id: "tug_connect", label: "Tug Connect" },
  { id: "tug_disconnect", label: "Tug Disconnect" },
  { id: "jetway_connect", label: "Jetway Connect" },
  { id: "jetway_disconnect", label: "Jetway Disconnect" },
];

export default function GsxPanel() {
  const [base, setBase] = useState<string>(DEFAULT_BASE);
  const [detected, setDetected] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [last, setLast] = useState<CommandResult | null>(null);

  useEffect(() => {
    try {
      const s = loadSettings();
      const url = (s.gsxRemoteUrl || DEFAULT_BASE).trim();
      if (url) setBase(url);
    } catch {}
  }, []);

  async function ping() {
    setDetected(null);
    setLast(null);
    try {
      const res = await fetch(`/api/gsx/ping?base=${encodeURIComponent(base)}`, { cache: "no-store" });
      const j = await res.json();
      setDetected(Boolean(j?.ok));
      if (!j?.ok && j?.error) setLast({ ok: false, error: j.error, status: res.status });
    } catch (e: any) {
      setDetected(false);
      setLast({ ok: false, error: e?.message || "Failed to reach GSX" });
    }
  }

  useEffect(() => { void ping(); }, [base]);

  async function send(action: string) {
    setBusy(action);
    setLast(null);
    try {
      const res = await fetch(`/api/gsx/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base, action }),
      });
      const j = await res.json();
      setLast(j);
      // optimistic: if command succeeded, consider GSX detected
      if (j?.ok) setDetected(true);
    } catch (e: any) {
      setLast({ ok: false, error: e?.message || "Command failed" });
    } finally {
      setBusy(null);
    }
  }

  const statusClass = detected == null
    ? "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400"
    : detected
      ? "bg-green-500/20 text-green-600 dark:text-green-400"
      : "bg-red-500/20 text-red-600 dark:text-red-400";

  return (
    <div className="h-full overflow-auto">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm opacity-80">GSX Control Panel</div>
        <div className={["px-2 py-0.5 rounded-full text-xs font-medium", statusClass].join(" ")}
             title={detected ? "GSX Remote detected" : detected === false ? "GSX Remote not reachable" : "Checking..."}>
          {detected == null ? "Checking…" : detected ? "GSX Running" : "GSX Not Detected"}
        </div>
      </div>

      {!detected && detected !== null && (
        <div className="mb-3 text-xs text-red-600 dark:text-red-400">
          Couldn’t detect GSX at {base}. Ensure GSX Remote is enabled and the URL/port matches your setup.
        </div>
      )}

      <div className="mb-3 text-xs opacity-70">
        Target: <code className="font-mono">{base}</code>
        <button onClick={() => void ping()} className="ml-2 px-2 py-0.5 border rounded text-[11px] bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700">Recheck</button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {ACTIONS.map((a) => (
          <button
            key={a.id}
            disabled={busy === a.id}
            onClick={() => void send(a.id)}
            className={[
              "text-xs px-3 py-2 rounded-md border",
              "bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900",
              "border-neutral-200 dark:border-neutral-700",
              busy === a.id ? "opacity-60 cursor-wait" : ""
            ].join(" ")}
          >
            {a.label}
          </button>
        ))}
      </div>

      {last && (
        <div className="mt-3 text-xs">
          {last.ok ? (
            <div className="text-green-600 dark:text-green-400">Command sent.</div>
          ) : (
            <div className="space-y-2">
              <div className="text-red-600 dark:text-red-400">Command failed{last.status ? ` (${last.status})` : ""}{last.error ? ` — ${last.error}` : ""}</div>
              {Array.isArray(last.attempted) && last.attempted.length > 0 && (
                <div className="opacity-70">
                  <div className="mb-1">Tried endpoints:</div>
                  <ul className="list-disc pl-5 space-y-0.5">
                    {last.attempted.map((a, i) => (
                      <li key={i}><code className="font-mono break-all">{a.url}</code> → {a.status || 0}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 text-[11px] opacity-60">
        Tip: If commands don’t work, open the GSX Remote UI and verify actions there. This panel uses a generic proxy and may require adjustments depending on your GSX version.
      </div>
    </div>
  );
}
