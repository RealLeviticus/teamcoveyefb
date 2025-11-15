"use client";

import React, { useCallback, useEffect, useState } from "react";
import { loadSettings } from "@/lib/settings";

function toNum(v: any, def: number) {
  const n = parseInt(String(v ?? "").trim(), 10);
  return Number.isFinite(n) ? n : def;
}

type ExtState = "notavail" | "avail" | "connected";
type SsbState = "open" | "closed";

const BITS = {
  GENRUN_X1: 0,
  GENRUN_X2: 3,
  CLOSED_X1: 8,
  CLOSED_X2: 11,
  CLOSED_SSB: 30,
} as const;

function hasBit(v: number, idx: number) {
  return (v & (1 << idx)) !== 0;
}

function extStateFromBits(v: number, which: 1 | 2): ExtState {
  const GEN = which === 1 ? BITS.GENRUN_X1 : BITS.GENRUN_X2;
  const CLS = which === 1 ? BITS.CLOSED_X1 : BITS.CLOSED_X2;
  const gen = hasBit(v, GEN);
  const cls = hasBit(v, CLS);
  if (!gen && !cls) return "notavail";
  if (gen && !cls) return "avail";
  return "connected";
}

function ssbFromBits(v: number): SsbState {
  const bit = hasBit(v, BITS.CLOSED_SSB);
  return bit ? "open" : "closed";
}

export default function PsxDirectPanel() {
  const [host, setHost] = useState("127.0.0.1");
  const [port, setPort] = useState(10747);
  const [status, setStatus] = useState<"checking" | "up" | "down">("checking");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>("");

  const [pbHeading, setPbHeading] = useState<number>(0);
  const [pbHold, setPbHold] = useState<boolean>(false);

  const [zfw, setZfw] = useState<string>("");
  const [fuel, setFuel] = useState<string>("");

  // Power/Air
  const [extBase, setExtBase] = useState<string>("");
  const [ext1, setExt1] = useState<ExtState>("notavail");
  const [ext2, setExt2] = useState<ExtState>("notavail");
  const [ssb, setSsb] = useState<SsbState>("closed");
  const [bleed, setBleed] = useState(false);
  const [aircon, setAircon] = useState(false);

  const ping = useCallback(async () => {
    setStatus("checking");
    try {
      const res = await fetch(
        `/api/psx/ping?host=${encodeURIComponent(host)}&port=${encodeURIComponent(
          String(port),
        )}`,
        { cache: "no-store" },
      );
      const j = await res.json();
      setStatus(j?.ok ? "up" : "down");
    } catch {
      setStatus("down");
    }
  }, [host, port]);

  async function sendLines(lines: string[]) {
    setBusy(true);
    setResult("");
    try {
      const res = await fetch("/api/psx/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, port, lines }),
      });
      const j = await res.json();
      setResult(j?.ok ? "OK" : `Error: ${j?.error || `HTTP ${res.status}`}`);
      if (!j?.ok) setStatus("down");
    } catch (e: any) {
      setResult(`Error: ${e?.message || String(e)}`);
      setStatus("down");
    } finally {
      setBusy(false);
    }
  }

  async function loadSimbrief() {
    try {
      const s = loadSettings();
      if (!s.simbriefUsername) {
        setResult("Set SimBrief username in Settings");
        return;
      }
      const r = await fetch(
        `/api/simbrief/summary?username=${encodeURIComponent(s.simbriefUsername)}`,
        { cache: "no-store" },
      );
      const j = await r.json();
      const zfwText = (j?.zfw || "").toString();
      const z = parseInt(zfwText.match(/\d+/)?.[0] || "", 10);
      if (Number.isFinite(z)) setZfw(String(z));
      const fuelText = (j?.plannedFuel || "").toString();
      const f = parseInt(fuelText.match(/\d+/)?.[0] || "", 10);
      if (Number.isFinite(f)) setFuel(String(f));
      setResult("Loaded from SimBrief");
    } catch (e: any) {
      setResult(`Error: ${e?.message || String(e)}`);
    }
  }

  // PSX Qi132 poll
  async function syncPowerStatus(showMessage = false) {
    try {
      const res = await fetch("/api/psx/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, port, lines: ["Q=Qi132=?"] }),
      });
      const j = await res.json();
      const text: string = String(j?.response || "");
      const m = text.match(/Qi132\D+(\d+)/i) || text.match(/(\d+)/);
      if (!m || !m[1]) {
        if (showMessage) setResult("Could not parse Qi132 from response");
        return;
      }

      const base = Number(m[1]);
      if (!Number.isFinite(base)) {
        if (showMessage) setResult("Qi132 value not numeric");
        return;
      }

      const baseU = base >>> 0;
      setExtBase(String(baseU));
      setExt1(extStateFromBits(baseU, 1));
      setExt2(extStateFromBits(baseU, 2));
      setSsb(ssbFromBits(baseU));

      if (showMessage) setResult("External power status synced");
    } catch (e: any) {
      if (showMessage) setResult(`Error syncing power: ${e?.message || String(e)}`);
    }
  }

  async function applyPower(nextExt1: ExtState, nextExt2: ExtState, nextSsb: SsbState) {
    const baseNum = Number(extBase);
    if (!extBase || !Number.isFinite(baseNum)) {
      setResult("External power base (Qi132) not loaded yet");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/psx/power", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base: baseNum,
          ext1: nextExt1,
          ext2: nextExt2,
          ssb: nextSsb,
        }),
      });
      const j = await res.json();
      setResult(
        j?.ok ? `Power set (Qi132=${j?.next})` : `Error: ${j?.error || `HTTP ${res.status}`}`,
      );
    } catch (e: any) {
      setResult(`Error: ${e?.message || String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  const handleToggleExt1 = () => {
    const next: ExtState = ext1 === "avail" ? "notavail" : "avail";
    setExt1(next);
    void applyPower(next, ext2, ssb);
  };

  const handleToggleExt2 = () => {
    const next: ExtState = ext2 === "avail" ? "notavail" : "avail";
    setExt2(next);
    void applyPower(ext1, next, ssb);
  };

  const handleToggleSsb = () => {
    const next: SsbState = ssb === "closed" ? "open" : "closed";
    setSsb(next);
    void applyPower(ext1, ext2, next);
  };

  useEffect(() => {
    try {
      const s = loadSettings();
      if (s.psxHost) setHost(s.psxHost);
      if (s.psxPort) setPort(s.psxPort);
    } catch {}
    void ping();
  }, [ping]);

  useEffect(() => {
    const tick = () => void syncPowerStatus(false);
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, [host, port]);

  return (
    <div className="space-y-4">
      {/* Status */}
      <div className="flex items-center gap-2 text-sm">
        <span
          className={[
            "px-2 py-0.5 rounded-full",
            status === "checking"
              ? "bg-yellow-500/20 text-yellow-700"
              : status === "up"
              ? "bg-green-500/20 text-green-700"
              : "bg-red-500/20 text-red-700",
          ].join(" ")}
        >
          {status === "checking" ? "Checking…" : status === "up" ? "PSX Online" : "PSX Offline"}
        </span>

        <button
          onClick={() => void ping()}
          className="px-2 py-1 text-xs rounded-md border bg-white/70 dark:bg-neutral-900/40"
        >
          Recheck
        </button>

        <button
          onClick={() => void syncPowerStatus(true)}
          className="px-2 py-1 text-xs rounded-md border bg-white/70 dark:bg-neutral-900/40"
        >
          Refresh Power
        </button>
      </div>

      {/* PUSHBACK */}
      <section className="rounded-lg border border-neutral-200 dark:border-neutral-800">
        <header className="px-3 py-2 border-b bg-white/60 dark:bg-neutral-900/60">
          <h3 className="text-sm font-semibold">Pushback</h3>
        </header>

        <div className="p-3 space-y-2 text-sm">
          <div className="flex items-center gap-2 mb-2">
            <label className="text-[12px] opacity-80">Heading</label>
            <input
              value={String(pbHeading)}
              onChange={(e) => setPbHeading(toNum(e.target.value, 0))}
              placeholder="000"
              className="w-20 rounded-md border px-2 py-1"
            />
            <label className="ml-2 inline-flex items-center gap-1 text-[11px] opacity-80">
              <input type="checkbox" checked={pbHold} onChange={(e) => setPbHold(e.target.checked)} />
              Hold turn
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              disabled={busy}
              onClick={() =>
                fetch("/api/psx/pushback", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "start", direction: "back", heading: pbHeading }),
                })
              }
              className="px-3 py-1 text-xs rounded-md border bg-white/70"
            >
              Start Back
            </button>

            <button
              disabled={busy}
              onClick={() =>
                fetch("/api/psx/pushback", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "start", direction: "forward", heading: pbHeading }),
                })
              }
              className="px-3 py-1 text-xs rounded-md border bg-white/70"
            >
              Start Forward
            </button>

            <button
              disabled={busy}
              onClick={() =>
                fetch("/api/psx/pushback", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: "turn",
                    direction: "back",
                    heading: pbHeading,
                    hold: pbHold,
                    key: "pb",
                  }),
                })
              }
              className="px-3 py-1 text-xs rounded-md border bg-white/70"
            >
              Turn (Back)
            </button>

            <button
              disabled={busy}
              onClick={() =>
                fetch("/api/psx/pushback", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: "turn",
                    direction: "forward",
                    heading: pbHeading,
                    hold: pbHold,
                    key: "pb",
                  }),
                })
              }
              className="px-3 py-1 text-xs rounded-md border bg-white/70"
            >
              Turn (Forward)
            </button>

            <button
              disabled={busy}
              onClick={() =>
                fetch("/api/psx/pushback", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "release", heading: pbHeading, key: "pb" }),
                })
              }
              className="px-3 py-1 text-xs rounded-md border bg-white/70"
            >
              Release Hold
            </button>

            <button
              disabled={busy}
              onClick={() =>
                fetch("/api/psx/pushback", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "stop", heading: pbHeading, key: "pb" }),
                })
              }
              className="px-3 py-1 text-xs rounded-md border bg-white/70"
            >
              Stop
            </button>
          </div>
        </div>
      </section>

      {/* GROUND POWER */}
      <section className="rounded-lg border border-neutral-200 dark:border-neutral-800">
        <header className="px-3 py-2 border-b bg-white/60 dark:bg-neutral-900/60">
          <h3 className="text-sm font-semibold">Ground Power & Air</h3>
        </header>

        <div className="p-3 space-y-3 text-sm">
          <div className="text-[11px] uppercase tracking-wide opacity-60">External Power (Qi132)</div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              disabled={busy}
              onClick={() => void syncPowerStatus(true)}
              className="px-2 py-1 text-xs rounded-md border bg-white/70"
            >
              Refresh
            </button>

            {/* EXT1 BUTTON WITH NEW COLOUR LOGIC */}
            <button
              disabled={busy}
              onClick={handleToggleExt1}
              className={[
                "ml-4 px-2 py-1 text-xs rounded-md border",
                ext1 === "connected"
                  ? "bg-green-500/20 text-green-700 border-green-700/40"
                  : ext1 === "avail"
                  ? "bg-blue-500/20 text-blue-700 border-blue-700/40"
                  : "bg-red-500/20 text-red-700 border-red-700/40",
              ].join(" ")}
            >
              Ext1: {ext1 === "notavail" ? "Not Avail" : ext1 === "avail" ? "Avail" : "Connected"}
            </button>

            {/* EXT2 BUTTON WITH NEW COLOUR LOGIC */}
            <button
              disabled={busy}
              onClick={handleToggleExt2}
              className={[
                "px-2 py-1 text-xs rounded-md border",
                ext2 === "connected"
                  ? "bg-green-500/20 text-green-700 border-green-700/40"
                  : ext2 === "avail"
                  ? "bg-blue-500/20 text-blue-700 border-blue-700/40"
                  : "bg-red-500/20 text-red-700 border-red-700/40",
              ].join(" ")}
            >
              Ext2: {ext2 === "notavail" ? "Not Avail" : ext2 === "avail" ? "Avail" : "Connected"}
            </button>

            {/* SSB BUTTON */}
            <button
              disabled={busy}
              onClick={handleToggleSsb}
              className={[
                "px-2 py-1 text-xs rounded-md border",
                ssb === "open"
                  ? "bg-green-500/20 text-green-700 border-green-700/40"
                  : "bg-red-500/20 text-red-700 border-red-700/40",
              ].join(" ")}
            >
              SSB: {ssb === "open" ? "Open" : "Closed"}
            </button>
          </div>

          <div className="text-[11px] uppercase tracking-wide opacity-60">External Air (Qi174)</div>
          <div className="flex items-center gap-4">
            <label className="inline-flex items-center gap-2 text-[12px] opacity-80">
              <input type="checkbox" checked={bleed} onChange={(e) => setBleed(e.target.checked)} />
              Bleed
            </label>

            <label className="inline-flex items-center gap-2 text-[12px] opacity-80">
              <input type="checkbox" checked={aircon} onChange={(e) => setAircon(e.target.checked)} />
              AirCon
            </label>

            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const res = await fetch("/api/psx/air", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ bleed, aircon }),
                  });
                  const j = await res.json();
                  setResult(
                    j?.ok ? `Air set (Qi174=${j?.bits})` : `Error: ${j?.error || `HTTP ${res.status}`}`,
                  );
                } catch (e: any) {
                  setResult(`Error: ${e?.message || String(e)}`);
                } finally {
                  setBusy(false);
                }
              }}
              className="px-2 py-1 text-xs rounded-md border bg-white/70"
            >
              Apply
            </button>
          </div>
        </div>
      </section>

      {/* WEIGHTS */}
      <section className="rounded-lg border border-neutral-200 dark:border-neutral-800">
        <header className="px-3 py-2 border-b bg-white/60 dark:bg-neutral-900/60">
          <h3 className="text-sm font-semibold">Weights & Fuel</h3>
        </header>
        <div className="p-3 space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <label className="block text-[11px] opacity-60">ZFW (kg)</label>
            <input
              value={zfw}
              onChange={(e) => setZfw(e.target.value)}
              className="w-28 rounded-md border px-2 py-1"
            />

            <button
              disabled={busy || !zfw}
              onClick={async () => {
                try {
                  setBusy(true);
                  const res = await fetch("/api/psx/wb", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ zfwKg: Number(zfw) }),
                  });
                  const j = await res.json();
                  setResult(j?.ok ? "ZFW sent" : `Error: ${j?.error || `HTTP ${res.status}`}`);
                } catch (e: any) {
                  setResult(`Error: ${e?.message || String(e)}`);
                } finally {
                  setBusy(false);
                }
              }}
              className="px-2 py-1 text-xs rounded-md border bg-white/70"
            >
              Set via PSX
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="block text-[11px] opacity-60">Fuel (kg)</label>
            <input
              value={fuel}
              onChange={(e) => setFuel(e.target.value)}
              className="w-32 rounded-md border px-2 py-1"
            />

            <button
              disabled={busy || !fuel}
              onClick={async () => {
                try {
                  setBusy(true);
                  const res = await fetch("/api/psx/fuel", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "total", totalKg: Number(fuel) }),
                  });
                  const j = await res.json();
                  setResult(j?.ok ? "Fuel set" : `Error: ${j?.error || `HTTP ${res.status}`}`);
                } catch (e: any) {
                  setResult(`Error: ${e?.message || String(e)}`);
                } finally {
                  setBusy(false);
                }
              }}
              className="px-2 py-1 text-xs rounded-md border bg-white/70"
            >
              Set via PSX
            </button>
          </div>

          <button
            disabled={busy}
            onClick={() => void loadSimbrief()}
            className="px-3 py-1 text-xs rounded-md border bg-white/70"
          >
            Load ZFW & Fuel from SimBrief
          </button>
        </div>
      </section>

      {result && <div className="text-[11px] opacity-70">{result}</div>}
    </div>
  );
}
