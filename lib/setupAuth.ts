import crypto from "node:crypto";

export const SETUP_SESSION_COOKIE = "efb_setup_session";
export const SETUP_STATE_COOKIE = "efb_setup_oauth_state";
export const SETUP_NEXT_COOKIE = "efb_setup_oauth_next";

export type SetupSession = {
  sub: string;
  username: string;
  roles: string[];
  iat: number;
  exp: number;
};

type SetupAuthEnv = {
  clientId: string;
  clientSecret: string;
  guildId: string;
  allowedRoleIds: string[];
  sessionSecret: string;
  baseUrl?: string;
};

function parseCookies(req: Request): Record<string, string> {
  const raw = req.headers.get("cookie") || "";
  const out: Record<string, string> = {};
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(value);
  }
  return out;
}

function serializeCookie(
  name: string,
  value: string,
  opts?: { maxAge?: number; secure?: boolean; path?: string; sameSite?: "Lax" | "Strict" | "None" },
) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${opts?.path || "/"}`);
  if (typeof opts?.maxAge === "number") parts.push(`Max-Age=${Math.floor(opts.maxAge)}`);
  parts.push("HttpOnly");
  if (opts?.secure !== false) parts.push("Secure");
  parts.push(`SameSite=${opts?.sameSite || "Lax"}`);
  return parts.join("; ");
}

function sign(data: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(data).digest("base64url");
}

function encodePayload(v: unknown) {
  return Buffer.from(JSON.stringify(v), "utf8").toString("base64url");
}

function decodePayload<T>(raw: string): T {
  const txt = Buffer.from(raw, "base64url").toString("utf8");
  return JSON.parse(txt) as T;
}

export function getSetupAuthEnv(): { ok: true; env: SetupAuthEnv } | { ok: false; error: string } {
  const clientId = String(process.env.SETUP_DISCORD_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.SETUP_DISCORD_CLIENT_SECRET || "").trim();
  const guildId = String(process.env.SETUP_DISCORD_GUILD_ID || "").trim();
  const allowedRoleIds = String(process.env.SETUP_ALLOWED_ROLE_IDS || "")
    .split(/[,\s]+/)
    .map((r) => r.trim())
    .filter(Boolean);
  const sessionSecret = String(process.env.SETUP_SESSION_SECRET || "").trim();
  const baseUrl = String(process.env.SETUP_BASE_URL || "").trim() || undefined;

  if (!clientId || !clientSecret || !guildId || !sessionSecret) {
    return { ok: false, error: "Missing setup OAuth env. Set SETUP_DISCORD_* and SETUP_SESSION_SECRET." };
  }
  if (allowedRoleIds.length === 0) {
    return { ok: false, error: "SETUP_ALLOWED_ROLE_IDS is empty." };
  }

  return { ok: true, env: { clientId, clientSecret, guildId, allowedRoleIds, sessionSecret, baseUrl } };
}

export function makeSetupSessionToken(payload: SetupSession, secret: string): string {
  const body = encodePayload(payload);
  const sig = sign(body, secret);
  return `${body}.${sig}`;
}

export function readSetupSession(req: Request): SetupSession | null {
  const env = getSetupAuthEnv();
  if (!env.ok) return null;
  const cookies = parseCookies(req);
  const raw = cookies[SETUP_SESSION_COOKIE];
  if (!raw) return null;
  const [body, sig] = raw.split(".");
  if (!body || !sig) return null;
  const expected = sign(body, env.env.sessionSecret);
  if (expected !== sig) return null;
  try {
    const payload = decodePayload<SetupSession>(body);
    if (!payload?.sub || !payload?.exp) return null;
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getCookieValue(req: Request, name: string): string | undefined {
  return parseCookies(req)[name];
}

export function setupCookie(headers: Headers, name: string, value: string, secure: boolean, maxAge: number) {
  headers.append(
    "Set-Cookie",
    serializeCookie(name, value, {
      secure,
      maxAge,
      sameSite: "Lax",
      path: "/",
    }),
  );
}

export function clearSetupCookie(headers: Headers, name: string, secure: boolean) {
  headers.append(
    "Set-Cookie",
    serializeCookie(name, "", {
      secure,
      maxAge: 0,
      sameSite: "Lax",
      path: "/",
    }),
  );
}

export function oauthCallbackUrl(req: Request, env: SetupAuthEnv): string {
  if (env.baseUrl) return `${env.baseUrl.replace(/\/+$/, "")}/api/setup/auth/callback`;
  const u = new URL(req.url);
  return `${u.origin}/api/setup/auth/callback`;
}

export function discordAuthorizeUrl(env: SetupAuthEnv, callbackUrl: string, state: string): string {
  const u = new URL("https://discord.com/api/oauth2/authorize");
  u.searchParams.set("client_id", env.clientId);
  u.searchParams.set("redirect_uri", callbackUrl);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "identify guilds.members.read");
  u.searchParams.set("state", state);
  u.searchParams.set("prompt", "consent");
  return u.toString();
}

export function safeNextPath(v: string | null | undefined): string {
  const raw = String(v || "").trim();
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/setup";
  return raw;
}

export function randomState(): string {
  return crypto.randomBytes(18).toString("hex");
}

