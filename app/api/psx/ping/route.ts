import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const host = (searchParams.get("host") || "127.0.0.1").trim();
  const port = parseInt((searchParams.get("port") || "10747").trim(), 10);
  if (!host || !Number.isFinite(port)) return NextResponse.json({ ok: false, error: "Invalid host/port" }, { status: 400 });

  const net = await import("node:net");
  return new Promise<Response>((resolve) => {
    const socket = new net.Socket();
    let done = false;

    const finish = (ok: boolean, error?: string) => {
      if (done) return; done = true;
      try { socket.destroy(); } catch {}
      resolve(NextResponse.json(ok ? { ok: true } : { ok: false, error }, { status: ok ? 200 : 502 }));
    };

    socket.setTimeout(1500);
    socket.once("timeout", () => finish(false, "Timeout"));
    socket.once("error", (e: any) => finish(false, e?.message || "Connect error"));
    socket.connect(port, host, () => finish(true));
  });
}
