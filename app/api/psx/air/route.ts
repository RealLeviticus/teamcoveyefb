import { NextRequest } from "next/server";
import { sendQ } from "@/lib/psxClient";

export const runtime = "nodejs";

// BleedAirBit indices from DLL
const BLEED = 0; // EXT_BLEEDAIR
const AIRCON = 1; // EXT_AIRCON

function setBit(v: number, idx: number) { return v | (1 << idx); }
function clearBit(v: number, idx: number) { return v & ~(1 << idx); }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const bleed = Boolean(body.bleed);
    const aircon = Boolean(body.aircon);
    let v = 0;
    v = bleed ? setBit(v, BLEED) : clearBit(v, BLEED);
    v = aircon ? setBit(v, AIRCON) : clearBit(v, AIRCON);
    const res = await sendQ("Qi174", String(v));
    return Response.json({ ...res, bits: v }, { status: res.ok ? 200 : 502 });
  } catch (err: any) {
    return Response.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
}

