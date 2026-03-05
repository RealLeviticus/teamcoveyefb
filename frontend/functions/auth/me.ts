import { readSession } from "../_lib/session";

type Env = {
  FRONTEND_SESSION_SECRET: string;
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const secret = context.env.FRONTEND_SESSION_SECRET;
  if (!secret) {
    return new Response(JSON.stringify({ ok: false, error: "Missing FRONTEND_SESSION_SECRET" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  const session = await readSession(context.request, secret);
  if (!session) {
    return new Response(JSON.stringify({ ok: false, authenticated: false }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(
    JSON.stringify({
      ok: true,
      authenticated: true,
      user: { id: session.sub, username: session.username, roles: session.roles },
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    },
  );
};

