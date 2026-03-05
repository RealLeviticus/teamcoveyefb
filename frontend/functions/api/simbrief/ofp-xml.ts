import { fetchSimbriefXml, requireUsername } from "../../../lib/simbrief";

function noStoreHeaders(contentType = "application/json") {
  return {
    "Content-Type": contentType,
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
  };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: noStoreHeaders() });
}

export const onRequestGet: PagesFunction = async (context) => {
  try {
    const url = new URL(context.request.url);
    const username = requireUsername(url);
    const xml = await fetchSimbriefXml(username);
    return new Response(xml, {
      status: 200,
      headers: noStoreHeaders("application/xml; charset=utf-8"),
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || String(e) }, 400);
  }
};

