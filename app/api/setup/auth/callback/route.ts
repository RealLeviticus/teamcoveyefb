import {
  SETUP_NEXT_COOKIE,
  SETUP_SESSION_COOKIE,
  SETUP_STATE_COOKIE,
  SetupSession,
  clearSetupCookie,
  getCookieValue,
  getSetupAuthEnv,
  makeSetupSessionToken,
  oauthCallbackUrl,
  safeNextPath,
  setupSessionTtlSeconds,
  setupCookie,
} from "@/lib/setupAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DiscordToken = {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in: number;
};

type DiscordUser = {
  id: string;
  username: string;
};

type DiscordMember = {
  roles: string[];
};

async function exchangeToken(code: string, clientId: string, clientSecret: string, redirectUri: string) {
  const body = new URLSearchParams();
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);
  body.set("grant_type", "authorization_code");
  body.set("code", code);
  body.set("redirect_uri", redirectUri);

  const res = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord token exchange failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return (await res.json()) as DiscordToken;
}

async function getUser(accessToken: string) {
  const res = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Discord user fetch failed (${res.status})`);
  return (await res.json()) as DiscordUser;
}

async function getMember(accessToken: string, guildId: string) {
  const res = await fetch(`https://discord.com/api/users/@me/guilds/${guildId}/member`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord role fetch failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return (await res.json()) as DiscordMember;
}

export async function GET(req: Request): Promise<Response> {
  const cfg = getSetupAuthEnv();
  if (!cfg.ok) return new Response(cfg.error, { status: 500 });

  const url = new URL(req.url);
  const secure = url.protocol === "https:";
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const stateCookie = getCookieValue(req, SETUP_STATE_COOKIE);
  const nextPath = safeNextPath(getCookieValue(req, SETUP_NEXT_COOKIE));

  const headers = new Headers();
  clearSetupCookie(headers, SETUP_STATE_COOKIE, secure);
  clearSetupCookie(headers, SETUP_NEXT_COOKIE, secure);

  if (!code || !state || !stateCookie || state !== stateCookie) {
    return new Response("OAuth state mismatch.", { status: 400, headers });
  }

  try {
    const callback = oauthCallbackUrl(req, cfg.env);
    const token = await exchangeToken(code, cfg.env.clientId, cfg.env.clientSecret, callback);
    const [user, member] = await Promise.all([getUser(token.access_token), getMember(token.access_token, cfg.env.guildId)]);
    const roleSet = new Set(member.roles || []);
    const allowed = cfg.env.allowedRoleIds.some((roleId) => roleSet.has(roleId));
    if (!allowed) {
      return new Response("You are authenticated but not allowed to use backend setup.", { status: 403, headers });
    }

    const now = Math.floor(Date.now() / 1000);
    const ttlSeconds = setupSessionTtlSeconds();
    const payload: SetupSession = {
      sub: user.id,
      username: user.username,
      roles: member.roles || [],
      iat: now,
      exp: now + ttlSeconds,
    };
    const signed = makeSetupSessionToken(payload, cfg.env.sessionSecret);
    setupCookie(headers, SETUP_SESSION_COOKIE, signed, secure, ttlSeconds);
    headers.set("Location", nextPath);
    return new Response(null, { status: 302, headers });
  } catch (err: any) {
    return new Response(`Backend setup login failed: ${err?.message || String(err)}`, { status: 502, headers });
  }
}

