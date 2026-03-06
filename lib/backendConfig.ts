import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type BackendConfig = {
  psxHost?: string;
  psxPort?: number;
  psxReferencesDir?: string;
  x32Host?: string;
  x32Port?: number;
  callRoutes?: Partial<Record<CallButton, string>>;
  updatedAt?: string;
};

export type CallButton = "1" | "2" | "3" | "4" | "5" | "6" | "P";
const CALL_BUTTONS: CallButton[] = ["1", "2", "3", "4", "5", "6", "P"];

const DEFAULT_CONFIG_PATH = path.join(os.homedir(), ".teamcovey-efb", "backend-config.json");
export const DEFAULT_PSX_REFERENCES_DIR = "C:\\Users\\levis\\OneDrive\\Documents 1\\Aerowinx\\Developers";

function parsePort(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : Number(String(v ?? "").trim());
  if (!Number.isFinite(n)) return undefined;
  const p = Math.round(n);
  if (p < 1 || p > 65535) return undefined;
  return p;
}

function cleanHost(v: unknown): string | undefined {
  const s = String(v ?? "").trim();
  return s || undefined;
}

function cleanReferencesDir(v: unknown): string | undefined {
  const s = String(v ?? "").trim();
  return s || undefined;
}

function cleanCallRoutes(v: unknown): Partial<Record<CallButton, string>> | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const obj = v as Record<string, unknown>;
  const out: Partial<Record<CallButton, string>> = {};
  for (const button of CALL_BUTTONS) {
    const raw = obj[button];
    const s = String(raw ?? "").trim();
    if (s) out[button] = s;
  }
  return out;
}

export function backendConfigPath(): string {
  const envPath = String(process.env.EFB_CONFIG_PATH || "").trim();
  return envPath || DEFAULT_CONFIG_PATH;
}

export function readBackendConfig(): BackendConfig {
  const file = backendConfigPath();
  try {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as BackendConfig;
    return {
      psxHost: cleanHost(parsed.psxHost),
      psxPort: parsePort(parsed.psxPort),
      psxReferencesDir: cleanReferencesDir(parsed.psxReferencesDir),
      x32Host: cleanHost(parsed.x32Host),
      x32Port: parsePort(parsed.x32Port),
      callRoutes: cleanCallRoutes(parsed.callRoutes),
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return {};
  }
}

export function writeBackendConfig(next: Partial<BackendConfig>): BackendConfig {
  const current = readBackendConfig();
  const hasCallRoutes = Object.prototype.hasOwnProperty.call(next, "callRoutes");
  const cleanedCallRoutes = cleanCallRoutes(next.callRoutes);
  const nextCallRoutes = hasCallRoutes ? cleanedCallRoutes : current.callRoutes;

  const merged: BackendConfig = {
    ...current,
    psxHost: cleanHost(next.psxHost) ?? current.psxHost,
    psxPort: parsePort(next.psxPort) ?? current.psxPort,
    psxReferencesDir: cleanReferencesDir(next.psxReferencesDir) ?? current.psxReferencesDir,
    x32Host: cleanHost(next.x32Host) ?? current.x32Host,
    x32Port: parsePort(next.x32Port) ?? current.x32Port,
    callRoutes: nextCallRoutes && Object.keys(nextCallRoutes).length > 0 ? nextCallRoutes : undefined,
    updatedAt: new Date().toISOString(),
  };
  const file = backendConfigPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(merged, null, 2), "utf8");
  return merged;
}

export function resolvePsxTarget(overrides?: { host?: string; port?: number }) {
  const cfg = readBackendConfig();
  const allowClientOverride = process.env.EFB_ALLOW_CLIENT_PSX_TARGET === "1";

  const host =
    (allowClientOverride ? cleanHost(overrides?.host) : undefined) ||
    cleanHost(cfg.psxHost) ||
    cleanHost(process.env.PSX_HOST) ||
    "127.0.0.1";

  const port =
    (allowClientOverride ? parsePort(overrides?.port) : undefined) ||
    parsePort(cfg.psxPort) ||
    parsePort(process.env.PSX_PORT) ||
    10747;

  return { host, port };
}

export function resolveX32Target(overrides?: { host?: string; port?: number }) {
  const cfg = readBackendConfig();
  const allowClientOverride = process.env.EFB_ALLOW_CLIENT_X32_TARGET === "1";

  const host =
    (allowClientOverride ? cleanHost(overrides?.host) : undefined) ||
    cleanHost(cfg.x32Host) ||
    cleanHost(process.env.X32_HOST) ||
    "127.0.0.1";

  const port =
    (allowClientOverride ? parsePort(overrides?.port) : undefined) ||
    parsePort(cfg.x32Port) ||
    parsePort(process.env.X32_PORT) ||
    10023;

  return { host, port };
}

export function resolvePsxReferencesDir() {
  const cfg = readBackendConfig();
  return (
    cleanReferencesDir(cfg.psxReferencesDir) ||
    cleanReferencesDir(process.env.PSX_REFERENCES_DIR) ||
    DEFAULT_PSX_REFERENCES_DIR
  );
}
