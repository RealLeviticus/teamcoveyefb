import { NextRequest } from "next/server";
import { sendQ } from "@/lib/psxClient";

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

type DoorKey = typeof doorOrder[number];

function mapToBits(map: Record<string, boolean> | undefined) {
  if (!map) return undefined as number | undefined;
  let v = 0;
  for (let i = 0; i < doorOrder.length; i++) {
    const key = doorOrder[i] as DoorKey;
    if (map[key]) v |= (1 << i);
  }
  return v >>> 0;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "set");

    if (action === "set") {
      const open = body.open as Record<string, boolean> | undefined; // true = door open
      const manual = body.manual as Record<string, boolean> | undefined; // true = door manual (armed = false)
      const openBits = mapToBits(open);
      const manBits = mapToBits(manual);

      const results: any = { ok: true };
      if (typeof openBits === "number") {
        const r = await sendQ("Qi180", String(openBits));
        results.open = { ...r, bits: openBits };
        if (!r.ok) results.ok = false;
      }
      if (typeof manBits === "number") {
        const r = await sendQ("Qi181", String(manBits));
        results.manual = { ...r, bits: manBits };
        if (!r.ok) results.ok = false;
      }
      return Response.json(results, { status: results.ok ? 200 : 502 });
    }

    if (action === "takeControl") {
      const r = await sendQ("Qi179", "32");
      return Response.json(r, { status: r.ok ? 200 : 502 });
    }

    return Response.json({ ok: false, error: "invalid action; expected set|takeControl" }, { status: 400 });
  } catch (err: any) {
    return Response.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
}

