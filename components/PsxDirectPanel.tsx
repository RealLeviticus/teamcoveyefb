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

// Note: applySsb in your API sets the CLOSED_SSB bit when ssb === "open",
// so we mirror that interpretation here.
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
  const [extBase, setExtBase] = useState<string>(""); // kept internal, no longer shown
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

  // One-click: load from SimBrief, fill fields, and send to PSX
  async function loadSimbriefAndApply() {
    try {
      setBusy(true);
      setResult("");

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
      const fuelText = (j?.plannedFuel || "").toString();

      const z = Math.round(parseInt(zfwText.match(/\d+/)?.[0] || "", 10));
      const f = Math.round(parseInt(fuelText.match(/\d+/)?.[0] || "", 10));

      if (!Number.isFinite(z) || z <= 0) {
        setResult("Could not parse ZFW from SimBrief");
        return;
      }
      if (!Number.isFinite(f) || f <= 0) {
        setResult("Could not parse Fuel from SimBrief");
        return;
      }
      if (f > 250000) {
        setResult("Fuel from SimBrief looks too high (max 250000 kg)");
        return;
      }

      // Update fields so UI matches what we send
      setZfw(String(z));
      setFuel(String(f));

      // Send both to PSX
      const [wbRes, fuelRes] = await Promise.all([
        fetch("/api/psx/wb", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ zfwKg: z }),
        }),
        fetch("/api/psx/fuel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "total", totalKg: f }),
        }),
      ]);

      const wbJson = await wbRes.json().catch(() => ({}));
      const fuelJson = await fuelRes.json().catch(() => ({}));

      if (wbJson?.ok && fuelJson?.ok) {
        setResult(
          `Loaded from SimBrief and sent to PSX (ZFW ${z.toLocaleString(
            "en-US",
          )} kg, Fuel ${f.toLocaleString("en-US")} kg)`,
        );
      } else if (!wbJson?.ok && !fuelJson?.ok) {
        setResult(
          `Error sending to PSX: ZFW → ${wbJson?.error || `HTTP ${wbRes.status}`}, Fuel → ${
            fuelJson?.error || `HTTP ${fuelRes.status}`
          }`,
        );
      } else if (!wbJson?.ok) {
        setResult(`ZFW send failed: ${wbJson?.error || `HTTP ${wbRes.status}`}`);
      } else {
        setResult(`Fuel send failed: ${fuelJson?.error || `HTTP ${fuelRes.status}`}`);
      }
    } catch (e: any) {
      setResult(`Error loading from SimBrief: ${e?.message || String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  // Read Qi132 via /api/psx/send, then decode ext1/ext2/ssb from bits
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

  // Load settings + initial ping
  useEffect(() => {
    try {
      const s = loadSettings();
      if (s.psxHost) setHost(s.psxHost);
      if (s.psxPort) setPort(s.psxPort);
    } catch {}
    void ping();
  }, [ping]);

  // Periodically sync ext power state from PSX (Qi132)
  useEffect(() => {
    const tick = () => {
      void syncPowerStatus(false);
    };
    tick(); // initial sync
    const id = setInterval(tick, 5000); // every 5 seconds
    return () => clearInterval(id);
  }, [host, port]); // reattach poll if host/port changes

  const baseButton =
    "text-xs rounded-md border " +
    "bg-neutral-200 text-neutral-900 hover:bg-neutral-300 border-neutral-400 " +
    "dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700 dark:border-neutral-600";

  return (
    <div className="space-y-4">
      {/* Connection (status only, host/port now in Settings) */}
      <div className="flex items-center gap-2 text-sm">
        <span
          className={[
            "px-2 py-0.5 rounded-full",
            status === "checking"
              ? "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400"
              : status === "up"
              ? "bg-green-500/20 text-green-700 dark:text-green-400"
              : "bg-red-500/20 text-red-700 dark:text-red-400",
          ].join(" ")}
        >
          {status === "checking" ? "Checking…" : status === "up" ? "PSX Online" : "PSX Offline"}
        </span>
        <button onClick={() => void ping()} className={`px-2 py-1 ${baseButton}`}>
          Recheck
        </button>
        <button onClick={() => void syncPowerStatus(true)} className={`px-2 py-1 ${baseButton}`}>
          Refresh Power
        </button>
      </div>

      {/* Pushback */}
      <section className="rounded-lg border border-neutral-200 dark:border-neutral-800">
        <header className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60">
          <h3 className="text-sm font-semibold">Pushback</h3>
        </header>
        <div className="p-3 space-y-2 text-sm">
          <div className="flex items-center gap-2 mb-2">
            <label className="text-[12px] opacity-80">Heading</label>
            <input
              value={String(pbHeading)}
              onChange={(e) => setPbHeading(toNum(e.target.value, 0))}
              placeholder="000"
              className="w-20 rounded-md border px-2 py-1 bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700"
            />
            <label className="ml-2 inline-flex items-center gap-1 text-[11px] opacity-80">
              <input
                type="checkbox"
                checked={pbHold}
                onChange={(e) => setPbHold(e.target.checked)}
              />
              <span>Hold turn (re-send)</span>
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
              className={`px-3 py-1 ${baseButton}`}
            >
              Start Back
            </button>
            <button
              disabled={busy}
              onClick={() =>
                fetch("/api/psx/pushback", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: "start",
                    direction: "forward",
                    heading: pbHeading,
                  }),
                })
              }
              className={`px-3 py-1 ${baseButton}`}
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
              className={`px-3 py-1 ${baseButton}`}
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
              className={`px-3 py-1 ${baseButton}`}
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
              className={`px-3 py-1 ${baseButton}`}
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
              className={`px-3 py-1 ${baseButton}`}
            >
              Stop
            </button>
          </div>
        </div>
      </section>

      {/* Ground Power & Air */}
      <section className="rounded-lg border border-neutral-200 dark:border-neutral-800">
        <header className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60">
          <h3 className="text-sm font-semibold">Ground Power &amp; Air</h3>
        </header>
        <div className="p-3 space-y-3 text-sm">
          <div className="text-[11px] uppercase tracking-wide opacity-60">External Power (Qi132)</div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              disabled={busy}
              onClick={() => void syncPowerStatus(true)}
              className={`px-2 py-1 ${baseButton}`}
            >
              Refresh
            </button>

            <button
              disabled={busy}
              onClick={handleToggleExt1}
              className={[
                "ml-4 px-2 py-1 text-xs rounded-md border",
                ext1 === "connected"
                  ? "bg-green-500/20 text-green-700 dark:text-green-400 border-green-700/40"
                  : ext1 === "avail"
                  ? "bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-700/40"
                  : "bg-red-500/20 text-red-700 dark:text-red-400 border-red-700/40",
              ].join(" ")}
            >
              Ext1: {ext1 === "notavail" ? "Not Avail" : ext1 === "avail" ? "Avail" : "Connected"}
            </button>

            <button
              disabled={busy}
              onClick={handleToggleExt2}
              className={[
                "px-2 py-1 text-xs rounded-md border",
                ext2 === "connected"
                  ? "bg-green-500/20 text-green-700 dark:text-green-400 border-green-700/40"
                  : ext2 === "avail"
                  ? "bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-700/40"
                  : "bg-red-500/20 text-red-700 dark:text-red-400 border-red-700/40",
              ].join(" ")}
            >
              Ext2: {ext2 === "notavail" ? "Not Avail" : ext2 === "avail" ? "Avail" : "Connected"}
            </button>

            <button
              disabled={busy}
              onClick={handleToggleSsb}
              className={[
                "px-2 py-1 text-xs rounded-md border",
                ssb === "open"
                  ? "bg-green-500/20 text-green-700 dark:text-green-400 border-green-700/40"
                  : "bg-red-500/20 text-red-700 dark:text-red-400 border-red-700/40",
              ].join(" ")}
            >
              SSB: {ssb === "open" ? "Open" : "Closed"}
            </button>
          </div>

          <div className="text-[11px] uppercase tracking-wide opacity-60">External Air (Qi174)</div>
          <div className="flex items-center gap-4">
            <label className="inline-flex items-center gap-2 text-[12px] opacity-80">
              <input
                type="checkbox"
                checked={bleed}
                onChange={(e) => setBleed(e.target.checked)}
              />{" "}
              Bleed
            </label>
            <label className="inline-flex items-center gap-2 text-[12px] opacity-80">
              <input
                type="checkbox"
                checked={aircon}
                onChange={(e) => setAircon(e.target.checked)}
              />{" "}
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
                    j?.ok
                      ? `Air set (Qi174=${j?.bits})`
                      : `Error: ${j?.error || `HTTP ${res.status}`}`,
                  );
                } catch (e: any) {
                  setResult(`Error: ${e?.message || String(e)}`);
                } finally {
                  setBusy(false);
                }
              }}
              className={`px-2 py-1 ${baseButton}`}
            >
              Apply
            </button>
          </div>
        </div>
      </section>

      {/* Weights & Fuel */}
      <section className="rounded-lg border border-neutral-200 dark:border-neutral-800">
        <header className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60">
          <h3 className="text-sm font-semibold">Weights &amp; Fuel</h3>
        </header>
        <div className="p-3 space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <label className="block text-[11px] opacity-60">ZFW (kg)</label>
            <input
              value={zfw}
              onChange={(e) => setZfw(e.target.value)}
              placeholder="e.g. 240000"
              className="w-28 rounded-md border px-2 py-1 bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700"
            />
            <button
              disabled={busy || !zfw}
              onClick={async () => {
                const zfwNum = Math.round(Number(zfw));
                if (!Number.isFinite(zfwNum) || zfwNum <= 0) {
                  setResult("ZFW must be a positive number in kg");
                  return;
                }
                setBusy(true);
                try {
                  const res = await fetch("/api/psx/wb", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ zfwKg: zfwNum }),
                  });
                  const j = await res.json();
                  setResult(
                    j?.ok
                      ? `ZFW sent: ${zfwNum.toLocaleString("en-US")} kg`
                      : `Error: ${j?.error || `HTTP ${res.status}`}`,
                  );
                } catch (e: any) {
                  setResult(`Error: ${e?.message || String(e)}`);
                } finally {
                  setBusy(false);
                }
              }}
              className={`px-2 py-1 ${baseButton}`}
            >
              Set via PSX
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="block text-[11px] opacity-60">Fuel (kg)</label>
            <input
              value={fuel}
              onChange={(e) => setFuel(e.target.value)}
              placeholder="e.g. 110000"
              className="w-32 rounded-md border px-2 py-1 bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700"
            />
            <button
              disabled={busy || !fuel}
              onClick={async () => {
                const fuelNum = Math.round(Number(fuel));
                if (!Number.isFinite(fuelNum) || fuelNum <= 0) {
                  setResult("Fuel must be a positive number in kg");
                  return;
                }
                if (fuelNum > 250000) {
                  setResult("Fuel value looks too high, max 250000 kg");
                  return;
                }

                setBusy(true);
                try {
                  const res = await fetch("/api/psx/fuel", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "total", totalKg: fuelNum }),
                  });
                  const j = await res.json();
                  setResult(
                    j?.ok
                      ? `Fuel set: ${fuelNum.toLocaleString("en-US")} kg`
                      : `Error: ${j?.error || `HTTP ${res.status}`}`,
                  );
                } catch (e: any) {
                  setResult(`Error: ${e?.message || String(e)}`);
                } finally {
                  setBusy(false);
                }
              }}
              className={`px-2 py-1 ${baseButton}`}
            >
              Set via PSX
            </button>
          </div>

          <div>
            <button
              disabled={busy}
              onClick={() => void loadSimbriefAndApply()}
              className={`px-3 py-1 ${baseButton}`}
            >
              Load ZFW &amp; Fuel from SimBrief
            </button>
          </div>
        </div>
      </section>

      {result && <div className="text-[11px] opacity-70">{result}</div>}
    </div>
  );
}
