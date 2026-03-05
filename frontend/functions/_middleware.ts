import { readSession } from "./_lib/session";

type Env = {
  FRONTEND_SESSION_SECRET: string;
};

function isStaticPath(pathname: string): boolean {
  if (pathname.startsWith("/_next/")) return true;
  if (pathname.startsWith("/static/")) return true;
  if (pathname === "/favicon.ico") return true;
  return /\.[a-zA-Z0-9]+$/.test(pathname);
}

function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/auth/login" ||
    pathname === "/auth/callback" ||
    pathname === "/auth/logout" ||
    pathname === "/auth/me"
  );
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const pathname = url.pathname;

  if (context.request.method === "OPTIONS") return context.next();
  if (isStaticPath(pathname) || isPublicPath(pathname)) return context.next();

  const secret = context.env.FRONTEND_SESSION_SECRET;
  if (!secret) {
    return new Response("Missing FRONTEND_SESSION_SECRET", { status: 500 });
  }

  const session = await readSession(context.request, secret);
  if (session) {
    context.data.session = session;
    return context.next();
  }

  if (pathname.startsWith("/api/")) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const login = new URL("/auth/login", url.origin);
  login.searchParams.set("next", `${pathname}${url.search}`);
  return Response.redirect(login.toString(), 302);
};

