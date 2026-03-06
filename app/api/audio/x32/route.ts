import { NextRequest } from "next/server";
import { queryX32, sendX32 } from "@/lib/x32Client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  action?: string;
  host?: string;
  port?: number;
  channel?: number;
  bus?: number;
  on?: boolean;
  fader?: number;
  sendOn?: boolean;
  sendLevel?: number;
  busOn?: boolean;
  busFader?: number;
  mainOn?: boolean;
  mainFader?: number;
};

function toInt(v: unknown): number | undefined {
  const n = Number(String(v ?? "").trim());
  if (!Number.isFinite(n)) return undefined;
  return Math.round(n);
}

function toFloat(v: unknown): number | undefined {
  const n = Number(String(v ?? "").trim());
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function parseOptionalBool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "1" || s === "on") return true;
    if (s === "false" || s === "0" || s === "off") return false;
  }
  return undefined;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function firstNumber(args: Array<string | number | boolean>): number | null {
  for (const v of args) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

function firstString(args: Array<string | number | boolean>): string | null {
  for (const v of args) {
    if (typeof v === "string") return v;
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const action = String(body.action || "").trim().toLowerCase();
    const host = String(body.host || "").trim() || undefined;
    const port = toInt(body.port);
    const target = { host, port };

    if (action === "ping") {
      const info = await queryX32("/info", target);
      if (!info.ok) return Response.json(info, { status: 502 });
      return Response.json(
        {
          ok: true,
          host: info.host,
          port: info.port,
          infoAddress: info.address,
          infoArgs: info.args,
          model: firstString(info.args),
        },
        { status: 200 },
      );
    }

    if (action === "status") {
      const channel = toInt(body.channel);
      if (!channel || channel < 1 || channel > 32) {
        return Response.json({ ok: false, error: "channel must be between 1 and 32" }, { status: 400 });
      }
      const busInput = toInt(body.bus);
      if (typeof body.bus !== "undefined" && (!busInput || busInput < 1 || busInput > 16)) {
        return Response.json({ ok: false, error: "bus must be between 1 and 16" }, { status: 400 });
      }
      const bus = busInput || 1;
      const ch = pad2(channel);
      const b = pad2(bus);
      const [chOn, chFader, mainOn, mainFader, sendOn, sendLevel, busOn, busFader] = await Promise.all([
        queryX32(`/ch/${ch}/mix/on`, target),
        queryX32(`/ch/${ch}/mix/fader`, target),
        queryX32("/main/st/mix/on", target),
        queryX32("/main/st/mix/fader", target),
        queryX32(`/ch/${ch}/mix/${b}/on`, target),
        queryX32(`/ch/${ch}/mix/${b}/level`, target),
        queryX32(`/bus/${b}/mix/on`, target),
        queryX32(`/bus/${b}/mix/fader`, target),
      ]);

      if (!chOn.ok) return Response.json(chOn, { status: 502 });
      if (!chFader.ok) return Response.json(chFader, { status: 502 });
      if (!mainOn.ok) return Response.json(mainOn, { status: 502 });
      if (!mainFader.ok) return Response.json(mainFader, { status: 502 });
      if (!sendOn.ok) return Response.json(sendOn, { status: 502 });
      if (!sendLevel.ok) return Response.json(sendLevel, { status: 502 });
      if (!busOn.ok) return Response.json(busOn, { status: 502 });
      if (!busFader.ok) return Response.json(busFader, { status: 502 });

      const channelOn = (firstNumber(chOn.args) ?? 0) > 0;
      const channelFader = clamp01(firstNumber(chFader.args) ?? 0);
      const mainOnValue = (firstNumber(mainOn.args) ?? 0) > 0;
      const mainFaderValue = clamp01(firstNumber(mainFader.args) ?? 0);
      const sendOnValue = (firstNumber(sendOn.args) ?? 0) > 0;
      const sendLevelValue = clamp01(firstNumber(sendLevel.args) ?? 0);
      const busOnValue = (firstNumber(busOn.args) ?? 0) > 0;
      const busFaderValue = clamp01(firstNumber(busFader.args) ?? 0);

      return Response.json(
        {
          ok: true,
          host: chOn.host,
          port: chOn.port,
          channel,
          bus,
          channelOn,
          channelFader,
          mainOn: mainOnValue,
          mainFader: mainFaderValue,
          sendOn: sendOnValue,
          sendLevel: sendLevelValue,
          busOn: busOnValue,
          busFader: busFaderValue,
        },
        { status: 200 },
      );
    }

    if (action === "setchannel") {
      const channel = toInt(body.channel);
      if (!channel || channel < 1 || channel > 32) {
        return Response.json({ ok: false, error: "channel must be between 1 and 32" }, { status: 400 });
      }
      const fader = toFloat(body.fader);
      const on = parseOptionalBool(body.on);
      if (typeof fader !== "number" && typeof on !== "boolean") {
        return Response.json(
          { ok: false, error: "Provide at least one of: fader (0..1), on (boolean)" },
          { status: 400 },
        );
      }

      const ch = pad2(channel);
      const results: any = { ok: true, channel };
      if (typeof on === "boolean") {
        const r = await sendX32(`/ch/${ch}/mix/on`, [on ? 1 : 0], target);
        results.on = r;
        if (!r.ok) results.ok = false;
      }
      if (typeof fader === "number") {
        const level = clamp01(fader);
        const r = await sendX32(`/ch/${ch}/mix/fader`, [level], target);
        results.fader = { ...r, value: level };
        if (!r.ok) results.ok = false;
      }

      return Response.json(results, { status: results.ok ? 200 : 502 });
    }

    if (action === "setbussend") {
      const channel = toInt(body.channel);
      if (!channel || channel < 1 || channel > 32) {
        return Response.json({ ok: false, error: "channel must be between 1 and 32" }, { status: 400 });
      }
      const bus = toInt(body.bus);
      if (!bus || bus < 1 || bus > 16) {
        return Response.json({ ok: false, error: "bus must be between 1 and 16" }, { status: 400 });
      }
      const sendLevel = toFloat(body.sendLevel);
      const sendOn = parseOptionalBool(body.sendOn);
      if (typeof sendLevel !== "number" && typeof sendOn !== "boolean") {
        return Response.json(
          { ok: false, error: "Provide at least one of: sendLevel (0..1), sendOn (boolean)" },
          { status: 400 },
        );
      }

      const ch = pad2(channel);
      const b = pad2(bus);
      const results: any = { ok: true, channel, bus };
      if (typeof sendOn === "boolean") {
        const r = await sendX32(`/ch/${ch}/mix/${b}/on`, [sendOn ? 1 : 0], target);
        results.sendOn = r;
        if (!r.ok) results.ok = false;
      }
      if (typeof sendLevel === "number") {
        const level = clamp01(sendLevel);
        const r = await sendX32(`/ch/${ch}/mix/${b}/level`, [level], target);
        results.sendLevel = { ...r, value: level };
        if (!r.ok) results.ok = false;
      }
      return Response.json(results, { status: results.ok ? 200 : 502 });
    }

    if (action === "setbus") {
      const bus = toInt(body.bus);
      if (!bus || bus < 1 || bus > 16) {
        return Response.json({ ok: false, error: "bus must be between 1 and 16" }, { status: 400 });
      }
      const fader = toFloat(body.busFader);
      const on = parseOptionalBool(body.busOn);
      if (typeof fader !== "number" && typeof on !== "boolean") {
        return Response.json(
          { ok: false, error: "Provide at least one of: busFader (0..1), busOn (boolean)" },
          { status: 400 },
        );
      }

      const b = pad2(bus);
      const results: any = { ok: true, bus };
      if (typeof on === "boolean") {
        const r = await sendX32(`/bus/${b}/mix/on`, [on ? 1 : 0], target);
        results.busOn = r;
        if (!r.ok) results.ok = false;
      }
      if (typeof fader === "number") {
        const level = clamp01(fader);
        const r = await sendX32(`/bus/${b}/mix/fader`, [level], target);
        results.busFader = { ...r, value: level };
        if (!r.ok) results.ok = false;
      }

      return Response.json(results, { status: results.ok ? 200 : 502 });
    }

    if (action === "setmain") {
      const fader = toFloat(body.mainFader);
      const on = parseOptionalBool(body.mainOn);
      if (typeof fader !== "number" && typeof on !== "boolean") {
        return Response.json(
          { ok: false, error: "Provide at least one of: mainFader (0..1), mainOn (boolean)" },
          { status: 400 },
        );
      }

      const results: any = { ok: true };
      if (typeof on === "boolean") {
        const r = await sendX32("/main/st/mix/on", [on ? 1 : 0], target);
        results.mainOn = r;
        if (!r.ok) results.ok = false;
      }
      if (typeof fader === "number") {
        const level = clamp01(fader);
        const r = await sendX32("/main/st/mix/fader", [level], target);
        results.mainFader = { ...r, value: level };
        if (!r.ok) results.ok = false;
      }

      return Response.json(results, { status: results.ok ? 200 : 502 });
    }

    return Response.json(
      { ok: false, error: "invalid action; expected ping|status|setChannel|setBusSend|setBus|setMain" },
      { status: 400 },
    );
  } catch (err: any) {
    return Response.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
}
