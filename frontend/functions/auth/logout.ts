import { clearSessionCookie } from "../_lib/session";

export const onRequestGet: PagesFunction = async (context) => {
  const reqUrl = new URL(context.request.url);
  const secure = reqUrl.protocol === "https:";
  const headers = new Headers();
  clearSessionCookie(headers, secure);
  headers.set("Location", "/");
  return new Response(null, { status: 302, headers });
};

