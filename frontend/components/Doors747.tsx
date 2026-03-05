"use client";

import React, { useEffect, useState } from "react";

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
  L1: "Entry 1",
  UL: "Upper Deck",
  L2: "Entry 2",
  L3: "Entry 3",
  L4: "Entry 4",
  sideCargo: "Side Cargo",
  L5: "Entry 5",
  R1: "Entry 1",
  fwdCargo: "Fwd Cargo",
  UR: "Upper Deck",
  R2: "Entry 2",
  ctrElec: "Ctr Elec",
  R3: "Entry 3",
  R4: "Entry 4",
  aftCargo: "Aft Cargo",
  bulkCargo: "Bulk Cargo",
  R5: "Entry 5",
};

// Layout groups to roughly match your diagram
const noseGroup: DoorKey[] = ["noseCargo", "fwdOvhd"];
const leftGroups: DoorKey[][] = [
  ["mainElec", "L1"], // MAIN ELEC / ENTRY 1
  ["UL", "L2"],       // UPPER DECK / ENTRY 2
  ["L3"],             // ENTRY 3
  ["L4"],             // ENTRY 4
  ["L5"],             // ENTRY 5
];
const rightGroups: DoorKey[][] = [
  ["R1"],                             // ENTRY 1
  ["fwdCargo", "UR"],                 // FWD CARGO / UPPER DECK
  ["R2", "ctrElec"],                  // ENTRY 2 / CTR ELEC
  ["R3"],                             // ENTRY 3
  ["R4", "aftCargo", "bulkCargo"],    // ENTRY 4 / AFT + BULK
  ["R5"],                             // ENTRY 5
];

export default function DoorsPanel() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>("");

  const [open, setOpen] = useState<Record<DoorKey, boolean>>(
    () => Object.fromEntries(order.map((k) => [k, false])) as Record<DoorKey, boolean>
  );

  const [manual, setManual] = useState<Record<DoorKey, boolean>>(
    () => Object.fromEntries(order.map((k) => [k, false])) as Record<DoorKey, boolean>
  );

  // Always request control when the component mounts
  useEffect(() => {
    void takeControl();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Periodically poll the API for door status so UI reflects real state
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/psx/doors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "status" }),
        });

        if (!res.ok) return;
        const j: any = await res.json();
        if (cancelled || !j?.ok) return;

        if (j.open) {
          setOpen((prev) => {
            const next = { ...prev };
            for (const k of order) {
              if (k in j.open) next[k] = !!j.open[k];
            }
            return next;
          });
        }

        if (j.manual) {
          setManual((prev) => {
            const next = { ...prev };
            for (const k of order) {
              if (k in j.manual) next[k] = !!j.manual[k];
            }
            return next;
          });
        }
      } catch {
        // ignore polling errors
      }
    }

    void poll();
    const id = setInterval(poll, 2000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  async function takeControl() {
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
    }
  }

  async function sendDoors(nextOpen: Record<DoorKey, boolean>) {
    setBusy(true);
    setResult("");
    try {
      const res = await fetch("/api/psx/doors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set", open: nextOpen, manual }),
      });
      const j = await res.json();
      setResult(j?.ok ? "Updated" : `Error: ${j?.error || `HTTP ${res.status}`}`);
    } catch (e: any) {
      setResult(`Error: ${e?.message || String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  function toggleDoor(k: DoorKey) {
    setOpen((current) => {
      const next = { ...current, [k]: !current[k] };
      void sendDoors(next);
      return next;
    });
  }

  function DoorButton({
    k,
    align,
  }: {
    k: DoorKey;
    align: "left" | "right" | "center";
  }) {
    const isOpen = !!open[k];
    const baseAlign =
      align === "left"
        ? "justify-start text-left"
        : align === "right"
        ? "justify-end text-right"
        : "justify-center text-center";

    const colourClasses = isOpen
      ? "bg-yellow-300 text-black border-yellow-400"
      : "bg-transparent text-sky-300 border-sky-300/70 hover:bg-sky-300/10";

    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => toggleDoor(k)}
        className={[
          "px-3 py-1 text-[11px] font-mono tracking-wide rounded-sm border transition-colors",
          "min-w-[90px]",
          baseAlign,
          "flex items-center",
          colourClasses,
        ].join(" ")}
      >
        {labels[k].toUpperCase()}
      </button>
    );
  }

  function DoorGroup({
    keys,
    side,
  }: {
    keys: DoorKey[];
    side: "left" | "right";
  }) {
    return (
      <div className="flex flex-col gap-1 my-1">
        {keys.map((k) => (
          <DoorButton
            key={k}
            k={k}
            align={side === "left" ? "right" : "left"}
          />
        ))}
      </div>
    );
  }

  return (
    <section className="rounded-lg border border-neutral-200 dark:border-neutral-800">
      <header className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60">
        <h3 className="text-sm font-semibold">Doors</h3>
      </header>

      <div className="p-3 space-y-4 text-sm">
        {/* Nose buttons at the top, centred */}
        <div className="flex justify-center gap-2 flex-wrap">
          {noseGroup.map((k) => (
            <DoorButton key={k} k={k} align="center" />
          ))}
        </div>

        {/* Main left/right layout */}
        <div className="flex flex-col sm:flex-row justify-center gap-6 sm:gap-10 md:gap-14">
          {/* Left side doors */}
          <div className="flex flex-col justify-between">
            {leftGroups.map((g, idx) => (
              <DoorGroup key={idx} keys={g} side="left" />
            ))}
          </div>

          {/* Right side doors */}
          <div className="flex flex-col justify-between">
            {rightGroups.map((g, idx) => (
              <DoorGroup key={idx} keys={g} side="right" />
            ))}
          </div>
        </div>

        {result && <div className="text-[11px] opacity-70">{result}</div>}
      </div>
    </section>
  );
}
