import { NextRequest } from "next/server";
import { sendQ, kgToLbs } from "@/lib/psxClient";

export const runtime = "nodejs";

function toTenthString(n: number) {
  // e.g. 1234.5 => "12345" (one decimal place, dot removed)
  return (Math.round(n * 10) / 10).toFixed(1).replace(".", "");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "").toLowerCase();

    if (action === "prefuel") {
      const entry = String(body.entry || "");
      if (!entry) return Response.json({ ok: false, error: "entry required" }, { status: 400 });
      const res = await sendQ("Qi220", entry);
      return Response.json(res, { status: res.ok ? 200 : 502 });
    }

    if (action === "tanks") {
      const payload = String(body.payload || "");
      if (!payload) return Response.json({ ok: false, error: "payload required" }, { status: 400 });
      const res = await sendQ("Qs438", payload);
      return Response.json(res, { status: res.ok ? 200 : 502 });
    }

    if (action === "preselect") {
      const payload = String(body.payload || "");
      if (!payload) return Response.json({ ok: false, error: "payload required" }, { status: 400 });
      const res = await sendQ("Qs439", payload);
      return Response.json(res, { status: res.ok ? 200 : 502 });
    }

    if (action === "total") {
      const totalKg = Number(body.totalKg);
      if (!Number.isFinite(totalKg) || totalKg <= 0) {
        return Response.json({ ok: false, error: "totalKg must be > 0" }, { status: 400 });
      }
      // Convert kg to lbs; PSX expects pounds with one decimal digit (dot removed).
      const totalLbs = kgToLbs(totalKg);
      const perMainLbs = totalLbs / 4;
      const m = toTenthString(perMainLbs);
      const zero = "0";
      const preselect = toTenthString(totalLbs);
      const payload438 = `d${m};${m};${m};${m};${zero};${zero};${zero};${zero};0;${preselect};2802;`;
      const payload439 = `${m};${m};${m};${m};${zero};${zero};${zero};${zero};0;`;
      const r1 = await sendQ("Qs438", payload438);
      if (!r1.ok) return Response.json(r1, { status: 502 });
      const r2 = await sendQ("Qs439", payload439);
      return Response.json({ ok: r2.ok, totalKg: Math.round(totalKg), totalLbs, payload438, payload439 }, { status: r2.ok ? 200 : 502 });
    }

    return Response.json({ ok: false, error: "invalid action; expected prefuel|tanks|preselect|total" }, { status: 400 });
  } catch (err: any) {
    return Response.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
}
