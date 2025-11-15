import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { host?: string; port?: number; lines?: string[] };

export async function POST(req: Request): Promise<Response> {
  let j: Body = {};
  try { j = await req.json(); } catch {}
  const host = (j.host || "127.0.0.1").trim();
  const port = Number.isFinite(j.port as number) ? (j.port as number) : 10747;
  const lines = Array.isArray(j.lines) ? j.lines : [];
  if (!host || !Number.isFinite(port)) return NextResponse.json({ ok: false, error: "Invalid host/port" }, { status: 400 });
  if (lines.length === 0) return NextResponse.json({ ok: false, error: "No lines" }, { status: 400 });

  const net = await import("node:net");

  return new Promise<Response>((resolve) => {
    const socket = new net.Socket();
    let done = false;
    let received = "";

    const finish = (ok: boolean, error?: string) => {
      if (done) return; done = true;
      try { socket.end(); socket.destroy(); } catch {}
      resolve(NextResponse.json(ok ? { ok: true, response: received } : { ok: false, error, response: received }, { status: ok ? 200 : 502 }));
    };

    socket.setTimeout(2000);
    socket.on("timeout", () => finish(false, "Timeout"));
    socket.on("error", (e: any) => finish(false, e?.message || "Socket error"));
    socket.on("data", (buf: Buffer) => { received += buf.toString("utf8"); });

    socket.connect(port, host, () => {
      try {
        for (const raw of lines) {
          const line = String(raw ?? "");
          if (!line) continue;
          // Ensure CRLF termination per PSX Q-line convention
          const term = /\r\n$/.test(line) ? line : line.replace(/\r?\n$/, "") + "\r\n";
          socket.write(term, "utf8");
        }
        // Give PSX a brief moment to respond, then close
        setTimeout(() => finish(true), 150);
      } catch (e: any) {
        finish(false, e?.message || "Send failed");
      }
    });
  });
}
