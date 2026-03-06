import { NextRequest } from "next/server";
import {
  getPsxCallMonitorStatus,
  simulatePsxCallButton,
  startPsxCallMonitor,
} from "@/lib/psxCallMonitor";
import type { CallButton } from "@/lib/backendConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUTTONS: CallButton[] = ["1", "2", "3", "4", "5", "6", "P"];

function parseButton(v: unknown): CallButton | null {
  const s = String(v || "").trim().toUpperCase() as CallButton;
  return BUTTONS.includes(s) ? s : null;
}

export async function GET() {
  startPsxCallMonitor();
  return Response.json({ ok: true, status: getPsxCallMonitorStatus() }, { status: 200 });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "start").trim().toLowerCase();

  if (action === "start") {
    return Response.json({ ok: true, status: startPsxCallMonitor() }, { status: 200 });
  }

  if (action === "simulate") {
    const button = parseButton(body.button);
    if (!button) {
      return Response.json({ ok: false, error: "button must be one of 1,2,3,4,5,6,P" }, { status: 400 });
    }
    startPsxCallMonitor();
    const event = await simulatePsxCallButton(button);
    return Response.json({ ok: event.ok, event, status: getPsxCallMonitorStatus() }, { status: event.ok ? 200 : 502 });
  }

  return Response.json({ ok: false, error: "invalid action; expected start|simulate" }, { status: 400 });
}

