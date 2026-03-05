import { readBackendConfig, resolvePsxTarget, writeBackendConfig } from "@/lib/backendConfig";
import { readSetupSession } from "@/lib/setupAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(msg: string, status = 400) {
  return Response.json({ ok: false, error: msg }, { status });
}

function parsePort(v: unknown): number | undefined {
  const n = Number(String(v ?? "").trim());
  if (!Number.isFinite(n)) return undefined;
  const p = Math.round(n);
  if (p < 1 || p > 65535) return undefined;
  return p;
}

function parseHost(v: unknown): string | undefined {
  const s = String(v ?? "").trim();
  return s || undefined;
}

function unauthorized() {
  return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

export async function GET(req: Request) {
  const session = readSetupSession(req);
  if (!session) return unauthorized();
  const cfg = readBackendConfig();
  const target = resolvePsxTarget();
  return Response.json(
    {
      ok: true,
      config: {
        psxHost: cfg.psxHost || target.host,
        psxPort: cfg.psxPort || target.port,
        updatedAt: cfg.updatedAt || null,
      },
      runtime: {
        psxHost: target.host,
        psxPort: target.port,
        clientOverrideEnabled: process.env.EFB_ALLOW_CLIENT_PSX_TARGET === "1",
        serviceTokenRequired: process.env.EFB_REQUIRE_SERVICE_TOKEN === "1",
      },
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: Request) {
  const session = readSetupSession(req);
  if (!session) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const psxHost = parseHost(body.psxHost);
  const psxPort = parsePort(body.psxPort);
  if (!psxHost) return bad("psxHost is required");
  if (!psxPort) return bad("psxPort must be between 1 and 65535");

  const saved = writeBackendConfig({ psxHost, psxPort });
  return Response.json({ ok: true, config: saved }, { status: 200 });
}

