"use client";

import React, { useEffect, useMemo, useState } from "react";

type DoorKey =
  | "L1" | "L2" | "L3" | "L4" | "L5"
  | "R1" | "R2" | "R3" | "R4" | "R5"
  | "UL" | "UR" | "FWD" | "AFT" | "BULK" | "NOSE" | "SIDE" | "MAIN" | "CTR";

const mapKeyToBit: Record<DoorKey, number | null> = {
  NOSE: 0, FWD: 11, MAIN: 2, L1: 3, UL: 4, L2: 5, L3: 6, L4: 7, SIDE: 8, L5: 9,
  R1: 10, UR: 12, R2: 13, CTR: 14, R3: 15, R4: 16, AFT: 17, BULK: 18, R5: 19,
};

export default function Doors747() {
  const [busy, setBusy] = useState(false);
  const [bits, setBits] = useState<number>(0);
  const [msg, setMsg] = useState<string>("");

  function bitSet(b: number | null) { return b == null ? false : ((bits >> b) & 1) === 1; }

  async function readDoors() {
    setBusy(true); setMsg("");
    try {
      const res = await fetch("/api/psx/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lines: ["Q=Qi180=?"] }) });
      const j = await res.json();
      const text: string = String(j?.response || "");
      const m = text.match(/Qi180\D+(\d+)/i) || text.match(/(\d+)/);
      if (m && m[1]) setBits(parseInt(m[1], 10) >>> 0);
    } finally { setBusy(false); }
  }

  useEffect(() => { void readDoors(); }, []);

  async function toggleDoor(key: DoorKey) {
    const bit = mapKeyToBit[key];
    if (bit == null) return;
    const open = !!((bits >> bit) & 1) ? false : true;
    const payload: any = { action: "set", open: { [normalizeKey(key)]: open } };
    setBusy(true);
    try {
      const res = await fetch("/api/psx/doors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await res.json();
      if (j?.ok) {
        // Update local bits
        const mask = 1 << bit;
        setBits((prev) => open ? (prev | mask) : (prev & ~mask));
      } else {
        setMsg(j?.error || `HTTP ${res.status}`);
      }
    } finally { setBusy(false); }
  }

  function normalizeKey(k: DoorKey): string {
    switch (k) {
      case "FWD": return "fwdCargo";
      case "AFT": return "aftCargo";
      case "BULK": return "bulkCargo";
      case "NOSE": return "noseCargo";
      case "SIDE": return "sideCargo";
      case "MAIN": return "mainElec";
      case "CTR": return "ctrElec";
      default: return k;
    }
  }

  const doorCell = (label: DoorKey) => (
    <button key={label} onClick={() => void toggleDoor(label)} className="relative px-3 py-2 border rounded-md text-xs bg-white/70 dark:bg-neutral-900/40 border-neutral-200 dark:border-neutral-700 hover:bg-white dark:hover:bg-neutral-900">
      <span>{label}</span>
      {bitSet(mapKeyToBit[label]) && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-yellow-400 rounded-sm" />}
    </button>
  );

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wide opacity-60">747 Doors</div>
        <div className="flex items-center gap-2">
          <button disabled={busy} onClick={() => void readDoors()} className="px-2 py-1 text-xs rounded-md border bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700">Refresh</button>
        </div>
      </div>
      {/* Layout approximating 747 sides */}
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-2">
          <div className="text-[11px] opacity-60 mb-1">Left</div>
          <div className="flex flex-col gap-2">
            {doorCell("L1")}
            {doorCell("L2")}
            {doorCell("L3")}
            {doorCell("L4")}
            {doorCell("L5")}
          </div>
        </div>
        <div className="space-y-2">
          <div className="text-[11px] opacity-60 mb-1">Right</div>
          <div className="flex flex-col gap-2 items-end">
            {doorCell("R1")}
            {doorCell("R2")}
            {doorCell("R3")}
            {doorCell("R4")}
            {doorCell("R5")}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {doorCell("UL")}
        {doorCell("UR")}
        {doorCell("NOSE")}
        {doorCell("FWD")}
        {doorCell("AFT")}
        {doorCell("BULK")}
        {doorCell("SIDE")}
        {doorCell("MAIN")}
        {doorCell("CTR")}
      </div>
      {msg && <div className="text-[11px] opacity-70">{msg}</div>}
    </div>
  );
}

