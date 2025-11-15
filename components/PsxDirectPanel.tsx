"use client";

import React, { useEffect, useState } from "react";
import { loadSettings, setPsxHost, setPsxPort } from "@/lib/settings";

function toNum(v: any, def: number) {
  const n = parseInt(String(v ?? "").trim(), 10);
  return Number.isFinite(n) ? n : def;
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
  const [ext1, setExt1] = useState<'notavail'|'avail'|'connected'>("notavail");
  const [ext2, setExt2] = useState<'notavail'|'avail'|'connected'>("notavail");
  const [ssb, setSsb] = useState<'open'|'closed'>("closed");
  const [bleed, setBleed] = useState(false);
  const [aircon, setAircon] = useState(false);

  useEffect(() => {
    try {
      const s = loadSettings();
      if (s.psxHost) setHost(s.psxHost);
      if (s.psxPort) setPort(s.psxPort);
    } catch {}
    void ping();
  }, []);

  async function ping() {
    setStatus("checking");
    try {
      const res = await fetch(`/api/psx/ping?host=${encodeURIComponent(host)}&port=${encodeURIComponent(String(port))}`, { cache: "no-store" });
      const j = await res.json();
      setStatus(j?.ok ? "up" : "down");
    } catch { setStatus("down"); }
  }

  async function sendLines(lines: string[]) {
    setBusy(true); setResult("");
    try {
      const res = await fetch("/api/psx/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host, port, lines }) });
      const j = await res.json();
      setResult(j?.ok ? "OK" : `Error: ${j?.error || `HTTP ${res.status}`}`);
      if (!j?.ok) setStatus("down");
    } catch (e: any) { setResult(`Error: ${e?.message || String(e)}`); setStatus("down"); }
    finally { setBusy(false); }
  }

  async function loadSimbrief() {
    try {
      const s = loadSettings();
      if (!s.simbriefUsername) { setResult("Set SimBrief username in Settings"); return; }
      const r = await fetch(`/api/simbrief/summary?username=${encodeURIComponent(s.simbriefUsername)}`, { cache: 'no-store' });
      const j = await r.json();
      const zfwText = (j?.zfw || '').toString();
      const z = parseInt((zfwText.match(/\d+/)?.[0] || ''), 10);
      if (Number.isFinite(z)) setZfw(String(z));
      const fuelText = (j?.plannedFuel || '').toString();
      const f = parseInt((fuelText.match(/\d+/)?.[0] || ''), 10);
      if (Number.isFinite(f)) setFuel(String(f));
      setResult('Loaded from SimBrief');
    } catch (e: any) { setResult(`Error: ${e?.message || String(e)}`); }
  }

  async function readQi132() {
    setBusy(true); setResult("");
    try {
      const res = await fetch("/api/psx/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host, port, lines: ["Q=Qi132=?"] }) });
      const j = await res.json();
      const text: string = String(j?.response || "");
      const m = text.match(/Qi132\D+(\d+)/i) || text.match(/(\d+)/);
      if (m && m[1]) { setExtBase(m[1]); setResult("Qi132 read"); }
      else setResult("Could not parse Qi132 from response");
    } catch (e: any) { setResult(`Error: ${e?.message || String(e)}`); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      {/* Connection */}
      <div className="flex items-center gap-2 text-sm">
        <span className={["px-2 py-0.5 rounded-full",
          status === 'checking' ? 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400' :
          status === 'up' ? 'bg-green-500/20 text-green-700 dark:text-green-400' : 'bg-red-500/20 text-red-700 dark:text-red-400'
        ].join(' ')}>{status === 'checking' ? 'Checking…' : status === 'up' ? 'PSX Online' : 'PSX Offline'}</span>
        <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="127.0.0.1" className="w-44 rounded-md border px-2 py-1 bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700" />
        <input value={String(port)} onChange={(e) => setPort(toNum(e.target.value, 10747))} placeholder="10747" className="w-24 rounded-md border px-2 py-1 bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700" />
        <button onClick={() => { setPsxHost(host); setPsxPort(port); }} className="px-2 py-1 text-xs rounded-md border bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700">Save</button>
        <button onClick={() => void ping()} className="px-2 py-1 text-xs rounded-md border bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700">Recheck</button>
      </div>

      {/* Pushback */}
      <section className="rounded-lg border border-neutral-200 dark:border-neutral-800">
        <header className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60">
          <h3 className="text-sm font-semibold">Pushback</h3>
        </header>
        <div className="p-3 space-y-2 text-sm">
          <div className="flex items-center gap-2 mb-2">
            <label className="text-[12px] opacity-80">Heading</label>
            <input value={String(pbHeading)} onChange={(e) => setPbHeading(toNum(e.target.value, 0))} placeholder="000" className="w-20 rounded-md border px-2 py-1 bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700" />
            <label className="ml-2 inline-flex items-center gap-1 text-[11px] opacity-80">
              <input type="checkbox" checked={pbHold} onChange={(e) => setPbHold(e.target.checked)} />
              <span>Hold turn (re-send)</span>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button disabled={busy} onClick={() => fetch("/api/psx/pushback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start", direction: "back", heading: pbHeading }) })} className="px-3 py-1 text-xs rounded-md border bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700">Start Back</button>
            <button disabled={busy} onClick={() => fetch("/api/psx/pushback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start", direction: "forward", heading: pbHeading }) })} className="px-3 py-1 text-xs rounded-md border bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700">Start Forward</button>
            <button disabled={busy} onClick={() => fetch("/api/psx/pushback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "turn", direction: "back", heading: pbHeading, hold: pbHold, key: "pb" }) })} className="px-3 py-1 text-xs rounded-md border bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700">Turn (Back)</button>
            <button disabled={busy} onClick={() => fetch("/api/psx/pushback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "turn", direction: "forward", heading: pbHeading, hold: pbHold, key: "pb" }) })} className="px-3 py-1 text-xs rounded-md border bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700">Turn (Forward)</button>
            <button disabled={busy} onClick={() => fetch("/api/psx/pushback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "release", heading: pbHeading, key: "pb" }) })} className="px-3 py-1 text-xs rounded-md border bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700">Release Hold</button>
            <button disabled={busy} onClick={() => fetch("/api/psx/pushback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "stop", heading: pbHeading, key: "pb" }) })} className="px-3 py-1 text-xs rounded-md border bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700">Stop</button>
          </div>
        </div>
      </section>

      {/* Ground Power & Air */}
      <section className="rounded-lg border border-neutral-200 dark:border-neutral-800">
        <header className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60">
          <h3 className="text-sm font-semibold">Ground Power & Air</h3>
        </header>
        <div className="p-3 space-y-3 text-sm">
          <div className="text-[11px] uppercase tracking-wide opacity-60">External Power (Qi132)</div>
          <div className="flex items-center gap-2">
            <input value={extBase} onChange={(e) => setExtBase(e.target.value)} placeholder="Qi132 base" className="w-32 rounded-md border px-2 py-1 bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700" />
            <button disabled={busy} onClick={() => void readQi132()} className="px-2 py-1 text-xs rounded-md border bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700">Read</button>
            <label className="text-[11px] opacity-80 ml-2">Ext1</label>
            <select value={ext1} onChange={(e) => setExt1(e.target.value as any)} className="rounded-md border px-2 py-1 bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700">
              <option value="notavail">Not Avail</option>
              <option value="avail">Avail</option>
              <option value="connected">Connected</option>
            </select>
            <label className="text-[11px] opacity-80 ml-2">Ext2</label>
            <select value={ext2} onChange={(e) => setExt2(e.target.value as any)} className="rounded-md border px-2 py-1 bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700">
              <option value="notavail">Not Avail</option>
              <option value="avail">Avail</option>
              <option value="connected">Connected</option>
            </select>
            <label className="text-[11px] opacity-80 ml-2">SSB</label>
            <select value={ssb} onChange={(e) => setSsb(e.target.value as any)} className="rounded-md border px-2 py-1 bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700">
              <option value="closed">Closed</option>
              <option value="open">Open</option>
            </select>
            <button disabled={busy} onClick={async () => { setBusy(true); try { const res = await fetch('/api/psx/power', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base: Number(extBase), ext1, ext2, ssb }) }); const j = await res.json(); setResult(j?.ok ? `Power set (Qi132=${j?.next})` : `Error: ${j?.error || `HTTP ${res.status}`}`); } catch (e: any) { setResult(`Error: ${e?.message || String(e)}`); } finally { setBusy(false); } }} className="ml-2 px-2 py-1 text-xs rounded-md border bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700">Apply</button>
          </div>
          <div className="text-[11px] uppercase tracking-wide opacity-60">External Air (Qi174)</div>
          <div className="flex items-center gap-4">
            <label className="inline-flex items-center gap-2 text-[12px] opacity-80"><input type="checkbox" checked={bleed} onChange={(e) => setBleed(e.target.checked)} /> Bleed</label>
            <label className="inline-flex items-center gap-2 text-[12px] opacity-80"><input type="checkbox" checked={aircon} onChange={(e) => setAircon(e.target.checked)} /> AirCon</label>
            <button disabled={busy} onClick={async () => { setBusy(true); try { const res = await fetch('/api/psx/air', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bleed, aircon }) }); const j = await res.json(); setResult(j?.ok ? `Air set (Qi174=${j?.bits})` : `Error: ${j?.error || `HTTP ${res.status}`}`); } catch (e: any) { setResult(`Error: ${e?.message || String(e)}`); } finally { setBusy(false); } }} className="px-2 py-1 text-xs rounded-md border bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700">Apply</button>
          </div>
        </div>
      </section>

      {/* Weight & Balance */}
      <section className="rounded-lg border border-neutral-200 dark:border-neutral-800">
        <header className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60">
          <h3 className="text-sm font-semibold">Weight & Balance</h3>
        </header>
        <div className="p-3 space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <label className="block text-[11px] opacity-60">ZFW (kg)</label>
            <input value={zfw} onChange={(e) => setZfw(e.target.value)} placeholder="e.g. 240000" className="w-28 rounded-md border px-2 py-1 bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700" />
            <button disabled={busy || !zfw} onClick={async () => { try { setBusy(true); const res = await fetch("/api/psx/wb", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ zfwKg: Number(zfw) }) }); const j = await res.json(); setResult(j?.ok ? "ZFW sent" : `Error: ${j?.error || `HTTP ${res.status}`}`); } catch (e: any) { setResult(`Error: ${e?.message || String(e)}`); } finally { setBusy(false); } }} className="px-2 py-1 text-xs rounded-md border bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700">Set via PSX</button>
            <button disabled={busy} onClick={() => void loadSimbrief()} className="px-2 py-1 text-xs rounded-md border bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700">Load from SimBrief</button>
          </div>
        </div>
      </section>

      {/* Fuel */}
      <section className="rounded-lg border border-neutral-200 dark:border-neutral-800">
        <header className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60">
          <h3 className="text-sm font-semibold">Fuel</h3>
        </header>
        <div className="p-3 space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <label className="block text-[11px] opacity-60">Fuel (kg)</label>
            <input value={fuel} onChange={(e) => setFuel(e.target.value)} placeholder="e.g. 110000" className="w-32 rounded-md border px-2 py-1 bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700" />
            <button disabled={busy || !fuel} onClick={async () => { try { setBusy(true); const res = await fetch("/api/psx/fuel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "total", totalKg: Number(fuel) }) }); const j = await res.json(); setResult(j?.ok ? "Fuel set" : `Error: ${j?.error || `HTTP ${res.status}`}`); } catch (e: any) { setResult(`Error: ${e?.message || String(e)}`); } finally { setBusy(false); } }} className="px-2 py-1 text-xs rounded-md border bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700">Set via PSX</button>
            <button disabled={busy} onClick={() => void loadSimbrief()} className="px-2 py-1 text-xs rounded-md border bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700">Load from SimBrief</button>
          </div>
        </div>
      </section>

      {result && <div className="text-[11px] opacity-70">{result}</div>}
    </div>
  );
}

