import {
  SETUP_NEXT_COOKIE,
  SETUP_STATE_COOKIE,
  clearSetupCookie,
  discordAuthorizeUrl,
  getSetupAuthEnv,
  oauthCallbackUrl,
  randomState,
  safeNextPath,
  setupCookie,
} from "@/lib/setupAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const cfg = getSetupAuthEnv();
  if (!cfg.ok) {
    return new Response(cfg.error, { status: 500 });
  }

  const reqUrl = new URL(req.url);
  const secure = reqUrl.protocol === "https:";
  const state = randomState();
  const nextPath = safeNextPath(reqUrl.searchParams.get("next"));
  const callback = oauthCallbackUrl(req, cfg.env);
  const redirect = discordAuthorizeUrl(cfg.env, callback, state);

  const headers = new Headers();
  clearSetupCookie(headers, SETUP_STATE_COOKIE, secure);
  clearSetupCookie(headers, SETUP_NEXT_COOKIE, secure);
  setupCookie(headers, SETUP_STATE_COOKIE, state, secure, 600);
  setupCookie(headers, SETUP_NEXT_COOKIE, nextPath, secure, 600);
  headers.set("Location", redirect);

  return new Response(null, { status: 302, headers });
}

