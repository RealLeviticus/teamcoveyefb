import { SETUP_SESSION_COOKIE, clearSetupCookie } from "@/lib/setupAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const u = new URL(req.url);
  const secure = u.protocol === "https:";
  const headers = new Headers();
  clearSetupCookie(headers, SETUP_SESSION_COOKIE, secure);
  headers.set("Location", "/setup");
  return new Response(null, { status: 302, headers });
}

