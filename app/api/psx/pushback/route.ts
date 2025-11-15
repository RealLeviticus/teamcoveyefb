import { NextRequest } from "next/server";
import { startPushback, stopPushback, updatePushbackTurn, type PushDirection } from "@/lib/psxClient";

export const runtime = "nodejs";

// Simple in-memory hold loops (per-process). Not suitable for multi-instance scale-out.
const loops = new Map<string, NodeJS.Timeout>();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "").toLowerCase();
    const heading = Number(body.heading);
    const direction = (String(body.direction || "").toLowerCase() as PushDirection) || undefined;
    const hold = Boolean(body.hold);
    const key = String(body.key || "default");

    if (!Number.isFinite(heading)) {
      return Response.json({ ok: false, error: "heading must be a number (degrees)" }, { status: 400 });
    }

    if (action === "start") {
      if (direction !== "forward" && direction !== "back") {
        return Response.json({ ok: false, error: "direction must be 'forward' or 'back'" }, { status: 400 });
      }
      const res = await startPushback(direction, heading);
      return Response.json(res, { status: res.ok ? 200 : 502 });
    }

    if (action === "stop") {
      const res = await stopPushback(heading);
      // Clearing any loop on stop
      const t = loops.get(key); if (t) { clearInterval(t); loops.delete(key); }
      return Response.json(res, { status: res.ok ? 200 : 502 });
    }

    if (action === "turn") {
      if (direction !== "forward" && direction !== "back") {
        return Response.json({ ok: false, error: "direction must be 'forward' or 'back'" }, { status: 400 });
      }
      const res = await updatePushbackTurn(direction, heading);
      // Optional hold loop: re-issue turn command every 5s
      if (res.ok && hold) {
        const prev = loops.get(key); if (prev) clearInterval(prev);
        const timer = setInterval(() => { void updatePushbackTurn(direction, heading); }, 5000);
        loops.set(key, timer);
      }
      return Response.json({ ...res, hold, key }, { status: res.ok ? 200 : 502 });
    }

    if (action === "release") {
      const t = loops.get(key);
      if (t) { clearInterval(t); loops.delete(key); }
      return Response.json({ ok: true, released: true, key });
    }

    return Response.json({ ok: false, error: "invalid action; expected start|stop|turn" }, { status: 400 });
  } catch (err: any) {
    return Response.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
}
