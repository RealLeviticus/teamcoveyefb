export type DiscordUser = {
  id: string;
  username: string;
  discriminator?: string;
};

type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
};

export type DiscordGuildMember = {
  roles: string[];
  user?: DiscordUser;
};

export type OAuthEnv = {
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  DISCORD_GUILD_ID: string;
  DISCORD_ALLOWED_ROLE_IDS: string;
};

const DISCORD_API = "https://discord.com/api";

export function normalizeRoleList(raw: string): string[] {
  return raw
    .split(/[,\s]+/)
    .map((r) => r.trim())
    .filter(Boolean);
}

export function buildAuthorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const u = new URL(`${DISCORD_API}/oauth2/authorize`);
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "identify guilds.members.read");
  u.searchParams.set("state", state);
  u.searchParams.set("prompt", "consent");
  return u.toString();
}

export async function exchangeCodeForToken(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams();
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);
  body.set("grant_type", "authorization_code");
  body.set("code", code);
  body.set("redirect_uri", redirectUri);

  const res = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord token exchange failed (${res.status}): ${text.slice(0, 180)}`);
  }
  return (await res.json()) as TokenResponse;
}

export async function fetchDiscordUser(accessToken: string): Promise<DiscordUser> {
  const res = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Discord user fetch failed (${res.status})`);
  return (await res.json()) as DiscordUser;
}

export async function fetchGuildMember(accessToken: string, guildId: string): Promise<DiscordGuildMember> {
  const res = await fetch(`${DISCORD_API}/users/@me/guilds/${guildId}/member`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord guild member fetch failed (${res.status}): ${text.slice(0, 180)}`);
  }
  return (await res.json()) as DiscordGuildMember;
}

export function isRoleAllowed(memberRoles: string[], allowedRoles: string[]): boolean {
  if (allowedRoles.length === 0) return false;
  const set = new Set(memberRoles);
  return allowedRoles.some((role) => set.has(role));
}

