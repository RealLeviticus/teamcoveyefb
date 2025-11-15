"use client";

import React, { useMemo, useState } from "react";

type DoorKey =
  | "noseCargo" | "fwdOvhd" | "mainElec"
  | "L1" | "UL" | "L2" | "L3" | "L4" | "sideCargo" | "L5"
  | "R1" | "fwdCargo" | "UR" | "R2" | "ctrElec" | "R3" | "R4" | "aftCargo" | "bulkCargo" | "R5";

const order: DoorKey[] = [
  "noseCargo", "fwdOvhd", "mainElec",
  "L1", "UL", "L2", "L3", "L4", "sideCargo", "L5",
  "R1", "fwdCargo", "UR", "R2", "ctrElec", "R3", "R4", "aftCargo", "bulkCargo", "R5",
];

const labels: Record<DoorKey, string> = {
  noseCargo: "Nose Cargo",
  fwdOvhd: "Fwd Ovhd",
  mainElec: "Main Elec",
  L1: "L1", UL: "Upper-L", L2: "L2", L3: "L3", L4: "L4", sideCargo: "Side Cargo", L5: "L5",
  R1: "R1", fwdCargo: "Fwd Cargo", UR: "Upper-R", R2: "R2", ctrElec: "Ctr Elec", R3: "R3", R4: "R4", aftCargo: "Aft Cargo", bulkCargo: "Bulk Cargo", R5: "R5",
};

export default function DoorsPanel() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>("");
  const [open, setOpen] = useState<Record<DoorKey, boolean>>(() => Object.fromEntries(order.map(k => [k, false])) as any);
  const [manual, setManual] = useState<Record<DoorKey, boolean>>(() => Object.fromEntries(order.map(k => [k, false])) as any);

  const grid = useMemo(() => {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {order.map((k) => (
          <div key={k} className="p-2 rounded-md border border-neutral-200 dark:border-neutral-800">
            <div className="text-xs mb-1 font-medium">{labels[k]}</div>
            <label className="block text-[11px] opacity-80">
              <input
                type="checkbox"
                className="mr-1"
                checked={!!open[k]}
                onChange={(e) => setOpen((s) => ({ ...s, [k]: e.target.checked }))}
              />
              Open
            </label>
            <label className="block text-[11px] opacity-80">
              <input
                type="checkbox"
                className="mr-1"
                checked={!!manual[k]}
                onChange={(e) => setManual((s) => ({ ...s, [k]: e.target.checked }))}
              />
              Manual (Armed if off)
            </label>
          </div>
        ))}
      </div>
    );
  }, [open, manual]);

  async function apply() {
    setBusy(true); setResult("");
    try {
      const res = await fetch("/api/psx/doors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set", open, manual }),
      });
      const j = await res.json();
      setResult(j?.ok ? "Updated" : `Error: ${j?.error || `HTTP ${res.status}`}`);
    } catch (e: any) {
      setResult(`Error: ${e?.message || String(e)}`);
    } finally { setBusy(false); }
  }

  async function takeControl() {
    setBusy(true); setResult("");
    try {
      const res = await fetch("/api/psx/doors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "takeControl" }),
      });
      const j = await res.json();
      setResult(j?.ok ? "Control requested" : `Error: ${j?.error || `HTTP ${res.status}`}`);
    } catch (e: any) {
      setResult(`Error: ${e?.message || String(e)}`);
    } finally { setBusy(false); }
  }

  function setAllOpen(v: boolean) {
    setOpen(Object.fromEntries(order.map(k => [k, v])) as any);
  }
  function setAllManual(v: boolean) {
    setManual(Object.fromEntries(order.map(k => [k, v])) as any);
  }

  return (
    <section className="rounded-lg border border-neutral-200 dark:border-neutral-800">
      <header className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60">
        <h3 className="text-sm font-semibold">Doors</h3>
      </header>
      <div className="p-3 space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <button disabled={busy} onClick={() => setAllOpen(true)} className="px-2 py-1 text-xs rounded-md border bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700">Open All</button>
          <button disabled={busy} onClick={() => setAllOpen(false)} className="px-2 py-1 text-xs rounded-md border bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700">Close All</button>
          <span className="mx-2" />
          <button disabled={busy} onClick={() => setAllManual(true)} className="px-2 py-1 text-xs rounded-md border bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700">Manual All</button>
          <button disabled={busy} onClick={() => setAllManual(false)} className="px-2 py-1 text-xs rounded-md border bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700">Armed All</button>
          <span className="mx-2" />
          <button disabled={busy} onClick={() => void takeControl()} className="px-2 py-1 text-xs rounded-md border bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700">Take Control</button>
          <button disabled={busy} onClick={() => void apply()} className="px-3 py-1 text-xs rounded-md border bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700">Apply</button>
        </div>
        {grid}
        {result && <div className="text-[11px] opacity-70">{result}</div>}
      </div>
    </section>
  );
}

