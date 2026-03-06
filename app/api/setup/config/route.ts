import {
  type CallButton,
  readBackendConfig,
  resolvePsxReferencesDir,
  resolvePsxTarget,
  resolveX32Target,
  writeBackendConfig,
} from "@/lib/backendConfig";
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

function parsePath(v: unknown): string | undefined {
  const s = String(v ?? "").trim();
  return s || undefined;
}

const CALL_BUTTONS: CallButton[] = ["1", "2", "3", "4", "5", "6", "P"];

function parseCallRoutes(v: unknown): Partial<Record<CallButton, string>> | undefined {
  if (typeof v === "undefined") return undefined;
  if (v == null) return {};
  if (typeof v !== "object" || Array.isArray(v)) return undefined;
  const obj = v as Record<string, unknown>;
  const out: Partial<Record<CallButton, string>> = {};
  for (const button of CALL_BUTTONS) {
    const s = String(obj[button] ?? "").trim();
    if (s) out[button] = s;
  }
  return out;
}

function unauthorized() {
  return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

export async function GET(req: Request) {
  const session = readSetupSession(req);
  if (!session) return unauthorized();
  const cfg = readBackendConfig();
  const target = resolvePsxTarget();
  const x32 = resolveX32Target();
  const referencesDir = resolvePsxReferencesDir();
  return Response.json(
    {
      ok: true,
      config: {
        psxHost: cfg.psxHost || target.host,
        psxPort: cfg.psxPort || target.port,
        psxReferencesDir: cfg.psxReferencesDir || referencesDir,
        x32Host: cfg.x32Host || x32.host,
        x32Port: cfg.x32Port || x32.port,
        callRoutes: cfg.callRoutes || { P: "0401 495 110" },
        updatedAt: cfg.updatedAt || null,
      },
      runtime: {
        psxHost: target.host,
        psxPort: target.port,
        psxReferencesDir: referencesDir,
        x32Host: x32.host,
        x32Port: x32.port,
        clientOverrideEnabled: process.env.EFB_ALLOW_CLIENT_PSX_TARGET === "1",
        clientX32OverrideEnabled: process.env.EFB_ALLOW_CLIENT_X32_TARGET === "1",
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
  const psxReferencesDir = parsePath(body.psxReferencesDir);
  const x32Host = parseHost(body.x32Host);
  const x32Port = parsePort(body.x32Port);
  const callRoutes = parseCallRoutes(body.callRoutes);
  if (!psxHost) return bad("psxHost is required");
  if (!psxPort) return bad("psxPort must be between 1 and 65535");
  if ("psxReferencesDir" in body && !psxReferencesDir) return bad("psxReferencesDir must be a non-empty path");
  if ("x32Host" in body && !x32Host) return bad("x32Host must be a non-empty host");
  if ("x32Port" in body && !x32Port) return bad("x32Port must be between 1 and 65535");
  if ("callRoutes" in body && !callRoutes) return bad("callRoutes must be an object keyed by 1..6 and P");

  const saved = writeBackendConfig({
    psxHost,
    psxPort,
    psxReferencesDir,
    x32Host,
    x32Port,
    ...("callRoutes" in body ? { callRoutes } : {}),
  });
  return Response.json({ ok: true, config: saved }, { status: 200 });
}
