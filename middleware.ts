import { NextRequest, NextResponse } from "next/server";

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith("/api/")) return NextResponse.next();

  // Setup API is protected by Discord setup auth, not by shared service token.
  if (pathname.startsWith("/api/setup/")) return NextResponse.next();

  if (process.env.EFB_REQUIRE_SERVICE_TOKEN !== "1") return NextResponse.next();

  const expected = String(process.env.EFB_SERVICE_TOKEN || "").trim();
  if (!expected) return unauthorized();
  const provided = String(req.headers.get("x-efb-service-token") || "").trim();
  if (!provided || provided !== expected) return unauthorized();

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};

