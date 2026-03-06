import {
  exchangeCodeForToken,
  fetchDiscordUser,
  fetchGuildMember,
  isRoleAllowed,
  normalizeRoleList,
} from "../_lib/discord";
import { parseCookies } from "../_lib/cookies";
import {
  appendSessionCookie,
  clearOauthCookies,
  FRONTEND_SESSION_TTL_SECONDS,
  FrontendSession,
  NEXT_COOKIE,
  SESSION_COOKIE,
  signSession,
  STATE_COOKIE,
} from "../_lib/session";

type Env = {
  FRONTEND_SESSION_SECRET: string;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  DISCORD_GUILD_ID: string;
  DISCORD_ALLOWED_ROLE_IDS: string;
};

function sanitizeNext(nextValue: string | undefined): string {
  if (!nextValue) return "/";
  if (!nextValue.startsWith("/")) return "/";
  if (nextValue.startsWith("//")) return "/";
  return nextValue;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const reqUrl = new URL(context.request.url);
  const secure = reqUrl.protocol === "https:";
  const code = reqUrl.searchParams.get("code");
  const state = reqUrl.searchParams.get("state");
  const cookies = parseCookies(context.request);
  const expectedState = cookies[STATE_COOKIE];
  const nextPath = sanitizeNext(cookies[NEXT_COOKIE]);

  const clearHeaders = new Headers();
  clearOauthCookies(clearHeaders, secure);

  if (!code || !state || !expectedState || state !== expectedState) {
    return new Response("OAuth state mismatch.", { status: 400, headers: clearHeaders });
  }

  const {
    FRONTEND_SESSION_SECRET: sessionSecret,
    DISCORD_CLIENT_ID: clientId,
    DISCORD_CLIENT_SECRET: clientSecret,
    DISCORD_GUILD_ID: guildId,
    DISCORD_ALLOWED_ROLE_IDS: allowedRolesRaw,
  } = context.env;

  if (!sessionSecret || !clientId || !clientSecret || !guildId) {
    return new Response("OAuth env is not fully configured.", { status: 500, headers: clearHeaders });
  }

  const allowedRoles = normalizeRoleList(allowedRolesRaw || "");
  if (allowedRoles.length === 0) {
    return new Response("No allowed Discord roles configured.", { status: 500, headers: clearHeaders });
  }

  try {
    const redirectUri = new URL("/auth/callback", reqUrl.origin).toString();
    const token = await exchangeCodeForToken(code, clientId, clientSecret, redirectUri);
    const [user, member] = await Promise.all([
      fetchDiscordUser(token.access_token),
      fetchGuildMember(token.access_token, guildId),
    ]);

    if (!isRoleAllowed(member.roles || [], allowedRoles)) {
      return new Response("You do not have an allowed Discord role.", { status: 403, headers: clearHeaders });
    }

    const now = Math.floor(Date.now() / 1000);
    const payload: FrontendSession = {
      sub: user.id,
      username: user.username,
      roles: member.roles || [],
      iat: now,
      exp: now + FRONTEND_SESSION_TTL_SECONDS,
    };
    const signed = await signSession(payload, sessionSecret);

    const headers = new Headers(clearHeaders);
    appendSessionCookie(headers, signed, secure, FRONTEND_SESSION_TTL_SECONDS);
    headers.set("Location", nextPath);
    return new Response(null, { status: 302, headers });
  } catch (err: any) {
    const msg = err?.message || String(err);
    return new Response(`Discord login failed: ${msg}`, { status: 502, headers: clearHeaders });
  }
};

