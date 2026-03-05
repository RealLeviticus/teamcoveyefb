import { resolvePsxTarget } from "@/lib/backendConfig";
import { readSetupSession } from "@/lib/setupAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

export async function POST(req: Request): Promise<Response> {
  const session = readSetupSession(req);
  if (!session) return unauthorized();

  const { host, port } = resolvePsxTarget();
  const net = await import("node:net");

  return new Promise<Response>((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (ok: boolean, error?: string) => {
      if (done) return;
      done = true;
      try {
        socket.destroy();
      } catch {}
      resolve(
        Response.json(
          ok ? { ok: true, host, port } : { ok: false, host, port, error: error || "PSX connection failed" },
          { status: ok ? 200 : 502 },
        ),
      );
    };
    socket.setTimeout(1500);
    socket.once("timeout", () => finish(false, "Timeout"));
    socket.once("error", (e: any) => finish(false, e?.message || "Socket error"));
    socket.connect(port, host, () => finish(true));
  });
}

