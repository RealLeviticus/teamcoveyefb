import { parseCookies, serializeCookie } from "./cookies";

export const SESSION_COOKIE = "efb_frontend_session";
export const STATE_COOKIE = "efb_frontend_oauth_state";
export const NEXT_COOKIE = "efb_frontend_oauth_next";

export type FrontendSession = {
  sub: string;
  username: string;
  roles: string[];
  iat: number;
  exp: number;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(data: Uint8Array): string {
  let s = "";
  for (const b of data) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function hmac(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return toBase64Url(new Uint8Array(sig));
}

export async function signSession(payload: FrontendSession, secret: string): Promise<string> {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const sig = await hmac(body, secret);
  return `${body}.${sig}`;
}

export async function verifySession(raw: string | undefined, secret: string): Promise<FrontendSession | null> {
  if (!raw) return null;
  const [body, sig] = raw.split(".");
  if (!body || !sig) return null;
  const expected = await hmac(body, secret);
  if (expected !== sig) return null;
  try {
    const payload = JSON.parse(decoder.decode(fromBase64Url(body))) as FrontendSession;
    if (!payload?.sub || !payload?.exp) return null;
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function readSession(req: Request, secret: string): Promise<FrontendSession | null> {
  const cookies = parseCookies(req);
  return verifySession(cookies[SESSION_COOKIE], secret);
}

export function appendSessionCookie(
  headers: Headers,
  token: string,
  secure: boolean,
  ttlSeconds: number,
) {
  headers.append(
    "Set-Cookie",
    serializeCookie(SESSION_COOKIE, token, {
      maxAge: ttlSeconds,
      secure,
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
    }),
  );
}

export function clearSessionCookie(headers: Headers, secure: boolean) {
  headers.append(
    "Set-Cookie",
    serializeCookie(SESSION_COOKIE, "", {
      maxAge: 0,
      secure,
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
    }),
  );
}

export function appendStateCookie(headers: Headers, state: string, secure: boolean) {
  headers.append(
    "Set-Cookie",
    serializeCookie(STATE_COOKIE, state, {
      maxAge: 600,
      secure,
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
    }),
  );
}

export function appendNextCookie(headers: Headers, nextPath: string, secure: boolean) {
  headers.append(
    "Set-Cookie",
    serializeCookie(NEXT_COOKIE, nextPath, {
      maxAge: 600,
      secure,
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
    }),
  );
}

export function clearOauthCookies(headers: Headers, secure: boolean) {
  headers.append(
    "Set-Cookie",
    serializeCookie(STATE_COOKIE, "", {
      maxAge: 0,
      secure,
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
    }),
  );
  headers.append(
    "Set-Cookie",
    serializeCookie(NEXT_COOKIE, "", {
      maxAge: 0,
      secure,
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
    }),
  );
}

