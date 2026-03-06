import { NextRequest } from "next/server";
import { sendQ } from "@/lib/psxClient";
import { resolvePsxTarget } from "@/lib/backendConfig";
import { psxIntRangeError } from "@/lib/psxVariables";

export const runtime = "nodejs";

// Bit order per DoorOpenBit / DoorManBit enums in DLL
const doorOrder = [
  "noseCargo",   // 0 DR_NOSE_CARGO
  "fwdOvhd",     // 1 DR_FWD_OVHD
  "mainElec",    // 2 DR_MAIN_ELEC
  "L1",          // 3 DR_ENTRY_1L
  "UL",          // 4 DR_UPPER_L
  "L2",          // 5 DR_ENTRY_2L
  "L3",          // 6 DR_ENTRY_3L
  "L4",          // 7 DR_ENTRY_4L
  "sideCargo",   // 8 DR_SIDE_CARGO
  "L5",          // 9 DR_ENTRY_5L
  "R1",          // 10 DR_ENTRY_1R
  "fwdCargo",    // 11 DR_FWD_CARGO
  "UR",          // 12 DR_UPPER_R
  "R2",          // 13 DR_ENTRY_2R
  "ctrElec",     // 14 DR_CTR_ELEC
  "R3",          // 15 DR_ENTRY_3R
  "R4",          // 16 DR_ENTRY_4R
  "aftCargo",    // 17 DR_AFT_CARGO
  "bulkCargo",   // 18 DR_BULK_CARGO
  "R5",          // 19 DR_ENTRY_5R
] as const;

type DoorKey = (typeof doorOrder)[number];

function mapToBits(map: Record<string, boolean> | undefined) {
  if (!map) return undefined as number | undefined;
  let v = 0;
  for (let i = 0; i < doorOrder.length; i++) {
    const key = doorOrder[i] as DoorKey;
    if (map[key]) v |= 1 << i;
  }
  return v >>> 0;
}

function bitsToMap(bits: number | undefined): Record<DoorKey, boolean> {
  const out = {} as Record<DoorKey, boolean>;
  for (let i = 0; i < doorOrder.length; i++) {
    const key = doorOrder[i] as DoorKey;
    out[key] = typeof bits === "number" ? !!(bits & (1 << i)) : false;
  }
  return out;
}

// Cached last-known bits we’ve sent to PSX (so status has something real to return)
let lastOpenBits: number | undefined;
let lastManualBits: number | undefined;
let lastDoorComBits: number | undefined;

function parseLastIntLine(blob: string, code: "Qi179" | "Qi180" | "Qi181"): number | undefined {
  const re = new RegExp(`\\b${code}=(-?\\d+)\\b`, "g");
  let match: RegExpExecArray | null = null;
  let value: number | undefined;
  while (true) {
    match = re.exec(blob);
    if (!match) break;
    const n = Number.parseInt(match[1], 10);
    if (Number.isFinite(n)) value = n;
  }
  return value;
}

async function readLiveDoorBits(waitMs = 450): Promise<
  | {
      openBits?: number;
      manualBits?: number;
      comBits?: number;
    }
  | null
> {
  const { host, port } = resolvePsxTarget();
  const net = await import("node:net");

  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    let received = "";

    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      try {
        socket.end();
        socket.destroy();
      } catch {}
      if (!ok) {
        resolve(null);
        return;
      }
      const openBits = parseLastIntLine(received, "Qi180");
      const manualBits = parseLastIntLine(received, "Qi181");
      const comBits = parseLastIntLine(received, "Qi179");
      if (
        typeof openBits !== "number" &&
        typeof manualBits !== "number" &&
        typeof comBits !== "number"
      ) {
        resolve(null);
        return;
      }
      resolve({ openBits, manualBits, comBits });
    };

    socket.setTimeout(2000);
    socket.on("timeout", () => finish(false));
    socket.on("error", () => finish(false));
    socket.on("data", (buf: Buffer) => {
      received += buf.toString("utf8");
    });

    socket.connect(port, host, () => {
      try {
        socket.write("bang\r\n", "utf8");
        setTimeout(() => finish(true), Math.max(100, Math.min(2000, Math.round(waitMs))));
      } catch {
        finish(false);
      }
    });
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "set");

    if (action === "set") {
      const open = body.open as Record<string, boolean> | undefined;   // true = door open
      const manual = body.manual as Record<string, boolean> | undefined; // true = door manual (armed = false)
      const openBits = mapToBits(open);
      const manBits = mapToBits(manual);

      const results: any = { ok: true };

      if (typeof openBits === "number") {
        const rangeErr = psxIntRangeError("Qi180", openBits);
        if (rangeErr) return Response.json({ ok: false, error: rangeErr }, { status: 400 });
        const r = await sendQ("Qi180", String(openBits));
        results.open = { ...r, bits: openBits };
        if (r.ok) lastOpenBits = openBits;
        if (!r.ok) results.ok = false;
      }

      if (typeof manBits === "number") {
        const rangeErr = psxIntRangeError("Qi181", manBits);
        if (rangeErr) return Response.json({ ok: false, error: rangeErr }, { status: 400 });
        const r = await sendQ("Qi181", String(manBits));
        results.manual = { ...r, bits: manBits };
        if (r.ok) lastManualBits = manBits;
        if (!r.ok) results.ok = false;
      }

      return Response.json(results, { status: results.ok ? 200 : 502 });
    }

    if (action === "takeControl") {
      const rangeErr = psxIntRangeError("Qi179", 32);
      if (rangeErr) return Response.json({ ok: false, error: rangeErr }, { status: 400 });
      const r = await sendQ("Qi179", "32");
      if (r.ok) lastDoorComBits = 32;
      return Response.json(r, { status: r.ok ? 200 : 502 });
    }

    if (action === "status") {
      const live = await readLiveDoorBits();
      if (typeof live?.openBits === "number") lastOpenBits = live.openBits;
      if (typeof live?.manualBits === "number") lastManualBits = live.manualBits;
      if (typeof live?.comBits === "number") lastDoorComBits = live.comBits;

      const open = bitsToMap(lastOpenBits);
      const manual = bitsToMap(lastManualBits);
      const comBits = typeof lastDoorComBits === "number" ? lastDoorComBits : null;
      const hasControl = typeof comBits === "number" ? !!(comBits & 32) : null;
      return Response.json(
        {
          ok: true,
          open,
          manual,
          doorComBits: comBits,
          hasControl,
          source: live ? "live" : "cache",
        },
        { status: 200 },
      );
    }

    return Response.json(
      { ok: false, error: "invalid action; expected set|takeControl|status" },
      { status: 400 },
    );
  } catch (err: any) {
    return Response.json(
      { ok: false, error: err?.message || String(err) },
      { status: 500 },
    );
  }
}
