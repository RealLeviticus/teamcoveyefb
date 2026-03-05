import { buildAuthorizeUrl } from "../_lib/discord";
import { appendNextCookie, appendStateCookie } from "../_lib/session";

type Env = {
  DISCORD_CLIENT_ID: string;
};

function randomState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

function sanitizeNext(nextValue: string | null): string {
  if (!nextValue) return "/";
  if (!nextValue.startsWith("/")) return "/";
  if (nextValue.startsWith("//")) return "/";
  return nextValue;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const clientId = context.env.DISCORD_CLIENT_ID;
  if (!clientId) return new Response("Missing DISCORD_CLIENT_ID", { status: 500 });

  const reqUrl = new URL(context.request.url);
  const secure = reqUrl.protocol === "https:";
  const state = randomState();
  const nextPath = sanitizeNext(reqUrl.searchParams.get("next"));
  const callbackUrl = new URL("/auth/callback", reqUrl.origin).toString();
  const authorizeUrl = buildAuthorizeUrl(clientId, callbackUrl, state);

  const headers = new Headers();
  appendStateCookie(headers, state, secure);
  appendNextCookie(headers, nextPath, secure);
  headers.set("Location", authorizeUrl);

  return new Response(null, { status: 302, headers });
};

