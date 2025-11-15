import { NextRequest } from "next/server";
import { kgToLbs, setZfwLbs } from "@/lib/psxClient";

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

    const res = await setZfwLbs(lbs);
    return Response.json({ ...res, zfwLbs: Math.round(lbs) }, { status: res.ok ? 200 : 502 });
  } catch (err: any) {
    return Response.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
}

