"use client";

import React, { useState } from "react";
import { loadSettings } from "@/lib/settings";

type ExtState = "notavail" | "avail" | "connected";
type SsbState = "open" | "closed";

export default function PowerAirPanel() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>("");
  const [extBase, setExtBase] = useState<string>("");
  const [ext1, setExt1] = useState<ExtState>("notavail");
  const [ext2, setExt2] = useState<ExtState>("notavail");
  const [ssb, setSsb] = useState<SsbState>("closed");
  const [bleed, setBleed] = useState<boolean>(false);
  const [aircon, setAircon] = useState<boolean>(false);

  async function readQi132() {
    setBusy(true); setResult("");
    try {
      const s = loadSettings();
      const host = s.psxHost || "127.0.0.1";
      const port = s.psxPort || 10747;
      const res = await fetch("/api/psx/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, port, lines: ["Q=Qi132=?"] }),
      });
      const j = await res.json();
      const text: string = String(j?.response || "");
      const m = text.match(/Qi132\D+(\d+)/i) || text.match(/(\d+)/);
      if (m && m[1]) { setExtBase(m[1]); setResult("Qi132 read"); }
      else setResult("Could not parse Qi132 from response");
    } catch (e: any) {
      setResult(`Error: ${e?.message || String(e)}`);
    } finally { setBusy(false); }
  }

  async function applyPower() {
    const base = parseInt(extBase, 10);
    if (!Number.isFinite(base)) { setResult("Enter valid base (Qi132)"); return; }
    setBusy(true); setResult("");
    try {
      const res = await fetch("/api/psx/power", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base, ext1, ext2, ssb }),
      });
      const j = await res.json();
      setResult(j?.ok ? `Power set (Qi132=${j?.next})` : `Error: ${j?.error || `HTTP ${res.status}`}`);
    } catch (e: any) {
      setResult(`Error: ${e?.message || String(e)}`);
    } finally { setBusy(false); }
  }

  async function applyAir() {
    setBusy(true); setResult("");
    try {
      const res = await fetch("/api/psx/air", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bleed, aircon }),
      });
      const j = await res.json();
      setResult(j?.ok ? `Air set (Qi174=${j?.bits})` : `Error: ${j?.error || `HTTP ${res.status}`}`);
    } catch (e: any) {
      setResult(`Error: ${e?.message || String(e)}`);
    } finally { setBusy(false); }
  }

  return (
    <div className="p-3 space-y-3 text-sm">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide opacity-60 mb-1">External Power (Qi132)</div>
          <div className="flex items-center gap-2 mb-2">
            <input value={extBase} onChange={(e) => setExtBase(e.target.value)} placeholder="Qi132 base" className="w-32 rounded-md border px-2 py-1 bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700" />
            <button disabled={busy} onClick={() => void readQi132()} className="px-2 py-1 text-xs rounded-md border bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700">Read</button>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <label className="text-[11px] opacity-80">Ext1</label>
            <select value={ext1} onChange={(e) => setExt1(e.target.value as ExtState)} className="rounded-md border px-2 py-1 bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700">
              <option value="notavail">Not Avail</option>
              <option value="avail">Avail</option>
              <option value="connected">Connected</option>
            </select>
            <label className="text-[11px] opacity-80 ml-4">Ext2</label>
            <select value={ext2} onChange={(e) => setExt2(e.target.value as ExtState)} className="rounded-md border px-2 py-1 bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700">
              <option value="notavail">Not Avail</option>
              <option value="avail">Avail</option>
              <option value="connected">Connected</option>
            </select>
            <label className="text-[11px] opacity-80 ml-4">SSB</label>
            <select value={ssb} onChange={(e) => setSsb(e.target.value as SsbState)} className="rounded-md border px-2 py-1 bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700">
              <option value="closed">Closed</option>
              <option value="open">Open</option>
            </select>
          </div>
          <div>
            <button disabled={busy} onClick={() => void applyPower()} className="px-3 py-1 text-xs rounded-md border bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700">Apply Power</button>
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide opacity-60 mb-1">External Air (Qi174)</div>
          <label className="inline-flex items-center gap-2 mr-4 text-[12px] opacity-80">
            <input type="checkbox" checked={bleed} onChange={(e) => setBleed(e.target.checked)} /> Bleed Air
          </label>
          <label className="inline-flex items-center gap-2 text-[12px] opacity-80">
            <input type="checkbox" checked={aircon} onChange={(e) => setAircon(e.target.checked)} /> Air Conditioning
          </label>
          <div className="mt-2">
            <button disabled={busy} onClick={() => void applyAir()} className="px-3 py-1 text-xs rounded-md border bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700">Apply Air</button>
          </div>
        </div>
      </div>
      {result && <div className="text-[11px] opacity-70">{result}</div>}
    </div>
  );
}

