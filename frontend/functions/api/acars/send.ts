function noStoreHeaders() {
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
  };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: noStoreHeaders() });
}

export const onRequestPost: PagesFunction = async (context) => {
  try {
    const body = await context.request.json().catch(() => ({} as any));
    const logon = String(body?.logon || "").trim();
    const from = String(body?.from || "").trim();
    const to = String(body?.to || "").trim();
    const type = String(body?.type || "telex").trim();
    const text = String(body?.text || "");

    if (!logon || !from || !to || !text) {
      return json({ ok: false, error: "Missing logon/from/to/text" }, 400);
    }

    const endpoint = "https://www.hoppie.nl/acars/system/connect.html";
    const form = new URLSearchParams();
    form.set("logon", logon);
    form.set("from", from);
    form.set("to", to);
    form.set("packet", text);
    form.set("type", type);

    const r = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      cache: "no-store",
      redirect: "follow",
    });
    const respText = await r.text();
    if (!r.ok) {
      return json(
        { ok: false, error: `Hoppie HTTP ${r.status}`, response: respText?.slice(0, 200) },
        502,
      );
    }

    return json({ ok: true, response: (respText || "").trim() });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Failed to send ACARS" }, 500);
  }
};

