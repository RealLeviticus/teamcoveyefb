import { readSession } from "../../_lib/session";

type Env = {
  FRONTEND_SESSION_SECRET: string;
  BACKEND_BASE_URL: string;
  BACKEND_SERVICE_TOKEN: string;
};

function buildUpstreamUrl(base: string, incoming: URL): URL {
  const trimmed = base.replace(/\/+$/, "");
  const tail = incoming.pathname.replace(/^\/api\/psx\/?/, "");
  const out = new URL(`${trimmed}/api/psx/${tail}`);
  out.search = incoming.search;
  return out;
}

function summarizeUpstreamError(status: number, body: string): string {
  const text = String(body || "").trim();
  if (!text) return `Upstream PSX request failed (HTTP ${status})`;
  const looksHtml = /<!doctype html|<html[\s>]/i.test(text);
  if (looksHtml) {
    if (/error\s*1016|origin dns error/i.test(text)) {
      return "Backend unavailable (Cloudflare 1016 Origin DNS error). Check backend DNS/tunnel and BACKEND_BASE_URL.";
    }
    return `Upstream PSX request returned HTML error (HTTP ${status})`;
  }
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.slice(0, 220);
}

function jsonError(status: number, error: string, upstreamStatus?: number): Response {
  return new Response(
    JSON.stringify({
      ok: false,
      error,
      ...(typeof upstreamStatus === "number" ? { upstreamStatus } : {}),
    }),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    },
  );
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const {
    BACKEND_BASE_URL: backendBase,
    BACKEND_SERVICE_TOKEN: serviceToken,
    FRONTEND_SESSION_SECRET: secret,
  } = context.env;

  if (!backendBase || !serviceToken || !secret) {
    return new Response(JSON.stringify({ ok: false, error: "PSX proxy env is incomplete." }), {
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
  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstreamReq);
  } catch (err: any) {
    return jsonError(502, `PSX proxy upstream fetch failed: ${err?.message || String(err)}`);
  }

  const contentType = String(upstreamRes.headers.get("content-type") || "").toLowerCase();
  if (!upstreamRes.ok && !contentType.includes("application/json")) {
    const raw = await upstreamRes.text().catch(() => "");
    return jsonError(502, summarizeUpstreamError(upstreamRes.status, raw), upstreamRes.status);
  }

  const responseHeaders = new Headers(upstreamRes.headers);
  responseHeaders.set("Cache-Control", "no-store");

  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers: responseHeaders,
  });
};

