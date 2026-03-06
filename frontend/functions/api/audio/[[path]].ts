import { readSession } from "../../_lib/session";

type Env = {
  FRONTEND_SESSION_SECRET: string;
  BACKEND_BASE_URL: string;
  BACKEND_SERVICE_TOKEN: string;
};

function buildUpstreamUrl(base: string, incoming: URL): URL {
  const trimmed = base.replace(/\/+$/, "");
  const tail = incoming.pathname.replace(/^\/api\/audio\/?/, "");
  const out = new URL(`${trimmed}/api/audio/${tail}`);
  out.search = incoming.search;
  return out;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const {
    BACKEND_BASE_URL: backendBase,
    BACKEND_SERVICE_TOKEN: serviceToken,
    FRONTEND_SESSION_SECRET: secret,
  } = context.env;

  if (!backendBase || !serviceToken || !secret) {
    return new Response(JSON.stringify({ ok: false, error: "Audio proxy env is incomplete." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const session = await readSession(context.request, secret);
  if (!session) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const incomingUrl = new URL(context.request.url);
  const upstreamUrl = buildUpstreamUrl(backendBase, incomingUrl);
  const headers = new Headers(context.request.headers);
  headers.delete("cookie");
  headers.delete("host");
  headers.set("x-efb-service-token", serviceToken);
  headers.set("x-efb-user-id", session.sub);
  headers.set("x-efb-user-name", session.username);

  const reqInit: RequestInit = {
    method: context.request.method,
    headers,
    redirect: "manual",
  };
  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    reqInit.body = context.request.body;
  }

  const upstreamReq = new Request(upstreamUrl.toString(), reqInit);
  const upstreamRes = await fetch(upstreamReq);
  const responseHeaders = new Headers(upstreamRes.headers);
  responseHeaders.set("Cache-Control", "no-store");

  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers: responseHeaders,
  });
};

