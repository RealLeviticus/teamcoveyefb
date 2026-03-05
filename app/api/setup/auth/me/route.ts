import { readSetupSession } from "@/lib/setupAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const session = readSetupSession(req);
  if (!session) {
    return Response.json({ ok: false, authenticated: false }, { status: 401 });
  }
  return Response.json(
    {
      ok: true,
      authenticated: true,
      user: { id: session.sub, username: session.username, roles: session.roles },
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

