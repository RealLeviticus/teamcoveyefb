import { NextRequest } from "next/server";
import { sendQ } from "@/lib/psxClient";

export const runtime = "nodejs";

// ElecSysMainBit indices from DLL
const BITS = {
  GENRUN_X1: 0,
  GENRUN_X2: 3,
  CLOSED_X1: 8,
  CLOSED_X2: 11,
  CLOSED_SSB: 30,
} as const;

type ExtState = "notavail" | "avail" | "connected";
type SsbState = "open" | "closed";

function setBit(v: number, idx: number) { return v | (1 << idx); }
function clearBit(v: number, idx: number) { return v & ~(1 << idx); }

function applyExtState(base: number, which: 1 | 2, state: ExtState | undefined) {
  if (!state) return base;
  const GEN = which === 1 ? BITS.GENRUN_X1 : BITS.GENRUN_X2;
  const CLS = which === 1 ? BITS.CLOSED_X1 : BITS.CLOSED_X2;
  let v = base;
  if (state === "notavail") {
    v = clearBit(v, GEN); v = clearBit(v, CLS);
  } else if (state === "avail") {
    v = setBit(v, GEN); v = clearBit(v, CLS);
  } else if (state === "connected") {
    v = setBit(v, GEN); v = setBit(v, CLS);
  }
  return v >>> 0;
}

function applySsb(base: number, ssb: SsbState | undefined) {
  if (!ssb) return base;
  return ssb === "open" ? setBit(base, BITS.CLOSED_SSB) : clearBit(base, BITS.CLOSED_SSB);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const base = Number(body.base);
    if (!Number.isFinite(base)) {
      return Response.json({ ok: false, error: "Provide numeric 'base' (Qi132 current value)" }, { status: 400 });
    }
    const ext1 = body.ext1 as ExtState | undefined;
    const ext2 = body.ext2 as ExtState | undefined;
    const ssb = body.ssb as SsbState | undefined;

    let next = base >>> 0;
    next = applyExtState(next, 1, ext1);
    next = applyExtState(next, 2, ext2);
    next = applySsb(next, ssb);

    const res = await sendQ("Qi132", String(next));
    return Response.json({ ...res, base, next }, { status: res.ok ? 200 : 502 });
  } catch (err: any) {
    return Response.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
}

