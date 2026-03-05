import { NextRequest } from "next/server";
import { kgToLbs, setZfwLbs } from "@/lib/psxClient";
import { psxIntRangeError } from "@/lib/psxVariables";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const zfwKg = body.zfwKg != null ? Number(body.zfwKg) : undefined;
    const zfwLbs = body.zfwLbs != null ? Number(body.zfwLbs) : undefined;

    let lbs: number | undefined = zfwLbs;
    if (lbs == null && zfwKg != null) lbs = kgToLbs(Number(zfwKg));

    if (lbs == null || !Number.isFinite(lbs)) {
      return Response.json({ ok: false, error: "Provide zfwLbs or zfwKg as a number" }, { status: 400 });
    }
    const rounded = Math.round(lbs);
    const rangeErr = psxIntRangeError("Qi123", rounded);
    if (rangeErr) {
      return Response.json({ ok: false, error: rangeErr }, { status: 400 });
    }

    const res = await setZfwLbs(rounded);
    return Response.json({ ...res, zfwLbs: rounded }, { status: res.ok ? 200 : 502 });
  } catch (err: any) {
    return Response.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
}
