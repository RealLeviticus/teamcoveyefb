import { XMLParser } from "fast-xml-parser";

const SB_URL = "https://www.simbrief.com/api/xml.fetcher.php";

type NotamItem = { station: string; id?: string; text: string; starts?: string; ends?: string };

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

function splitBlocks(raw: string): string[] {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const items: string[] = [];
  let cur: string[] = [];
  const flush = () => {
    const t = cur.join("\n").trim();
    if (t) items.push(t);
    cur = [];
  };
  for (const ln of lines) {
    if (!ln.trim()) {
      flush();
      continue;
    }
    if (/^[-=]{3,}$/.test(ln)) continue;
    cur.push(ln);
  }
  flush();
  return items;
}

function fromJson(ofp: any): NotamItem[] {
  if (!ofp) return [];
  const res: NotamItem[] = [];

  const push = (station: string | undefined, raw?: string) => {
    const sta = (station || "").toUpperCase();
    const txt = (raw || "").trim();
    if (!sta || !txt) return;
    for (const block of splitBlocks(txt)) {
      const idMatch = block.match(/\b([A-Z]?\d{3,5}\/\d{2})\b/i);
      const fromMatch = block.match(
        /\b(from|fr|effective)\s+([0-9]{1,2}\s+\w+\s+[0-9]{2,4}|\d{8}\/\d{4}|\d{2}\s\w{3}\s\d{2})/i,
      );
      const toMatch = block.match(
        /\b(until|to)\s+([0-9]{1,2}\s+\w+\s+[0-9]{2,4}|\d{8}\/\d{4}|\d{2}\s\w{3}\s\d{2})/i,
      );

      res.push({
        station: sta,
        id: idMatch?.[1],
        text: block,
        starts: fromMatch?.[2],
        ends: toMatch?.[2],
      });
    }
  };

  const originIcao = ofp?.origin?.icao || ofp?.origin_icao;
  const destIcao = ofp?.destination?.icao || ofp?.destination_icao;
  const altIcao = ofp?.alternate?.icao || ofp?.alternate_icao;
  push(originIcao, ofp?.origin?.notams || ofp?.notams_origin || ofp?.origin_notams);
  push(destIcao, ofp?.destination?.notams || ofp?.notams_destination || ofp?.destination_notams);
  push(altIcao, ofp?.alternate?.notams || ofp?.notams_alternate || ofp?.alternate_notams);

  if (typeof ofp?.text?.notams === "string") {
    const chunks = ofp.text.notams
      .replace(/\r\n/g, "\n")
      .split(/\n(?=[A-Z]{4}\s+NOTAM\b|\bNOTAM[S]?\s+[A-Z]{4}\b)/g);
    for (const ch of chunks) {
      const sta = ch.match(/\b([A-Z]{4})\b/)?.[1];
      const body = ch.replace(/^[A-Z\s]*\bNOTAM[S]?\b\s+[A-Z]{4}\s*:?/i, "").trim();
      if (sta && body) push(sta, body);
    }
  }

  const hits: string[] = [];
  const walk = (n: any) => {
    if (!n) return;
    if (typeof n === "string") return;
    if (Array.isArray(n)) return n.forEach(walk);
    for (const [k, v] of Object.entries(n)) {
      if (typeof v === "string" && /notam/i.test(k) && v.trim()) hits.push(v);
      else walk(v);
    }
  };
  walk(ofp);

  for (const blob of hits) {
    for (const block of splitBlocks(blob)) {
      const sta = block.match(/\b([A-Z]{4})\b/)?.[1] || "OTHER";
      push(sta, block);
    }
  }

  if (Array.isArray(ofp?.notam_list)) {
    for (const n of ofp.notam_list) {
      const sta = n?.station || n?.icao;
      const body = n?.text || n?.body || n?.message;
      push(sta, body);
    }
  }

  const seen = new Set<string>();
  const out = res.filter((r) => {
    const k = `${r.station}|${r.id || ""}|${r.text.slice(0, 120)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  out.sort(
    (a, b) => a.station.localeCompare(b.station) || (a.id || "").localeCompare(b.id || "") || a.text.localeCompare(b.text),
  );
  return out;
}

function fromXml(xmlText: string): NotamItem[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
  const xml = parser.parse(xmlText);
  const ofp = xml?.ofp || xml?.OFP || xml || {};
  const res: NotamItem[] = [];

  const push = (sta?: string, raw?: string) => {
    const station = (sta || "").toUpperCase();
    if (!station || !raw?.trim()) return;
    for (const block of splitBlocks(raw)) res.push({ station, text: block });
  };

  const collectTag = (node: any) => {
    if (!node) return;
    if (Array.isArray(node)) return node.forEach(collectTag);
    if (typeof node === "object") {
      if (node.notam) {
        const arr = Array.isArray(node.notam) ? node.notam : [node.notam];
        for (const n of arr) {
          const station = n?.icao || n?.station || n?.STATION;
          const id = n?.id || n?.ID;
          const from = n?.from || n?.FROM;
          const to = n?.to || n?.TO;
          const body = n?.text || n?.TEXT || (typeof n === "string" ? n : "");
          if (station && body) res.push({ station: String(station).toUpperCase(), id, starts: from, ends: to, text: String(body).trim() });
        }
      }
      for (const v of Object.values(node)) collectTag(v);
    }
  };
  collectTag(ofp);

  push(ofp?.origin?.icao || ofp?.origin_icao, ofp?.origin?.notams || ofp?.origin_notams);
  push(ofp?.destination?.icao || ofp?.destination_icao, ofp?.destination?.notams || ofp?.destination_notams);
  push(ofp?.alternate?.icao || ofp?.alternate_icao, ofp?.alternate?.notams || ofp?.alternate_notams);

  const big = ofp?.text?.notams || ofp?.NOTAMS || ofp?.notams;
  if (typeof big === "string") {
    const chunks = big.replace(/\r\n/g, "\n").split(/\n(?=[A-Z]{4}\s+NOTAM\b|\bNOTAM[S]?\s+[A-Z]{4}\b)/g);
    for (const ch of chunks) {
      const sta = ch.match(/\b([A-Z]{4})\b/)?.[1];
      const body = ch.replace(/^[A-Z\s]*\bNOTAM[S]?\b\s+[A-Z]{4}\s*:?/i, "").trim();
      if (sta && body) push(sta, body);
    }
  }

  const seen = new Set<string>();
  const out = res.filter((r) => {
    const k = `${r.station}|${r.id || ""}|${r.text.slice(0, 120)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  out.sort(
    (a, b) => a.station.localeCompare(b.station) || (a.id || "").localeCompare(b.id || "") || a.text.localeCompare(b.text),
  );
  return out;
}

export const onRequestGet: PagesFunction = async (context) => {
  try {
    const url = new URL(context.request.url);
    const username = (url.searchParams.get("username") || "").trim();
    if (!username) return json({ ok: false, error: "Missing ?username" }, 400);

    const jsonResp = await fetch(`${SB_URL}?username=${encodeURIComponent(username)}&json=1`, { cache: "no-store" });
    const jsonText = await jsonResp.text();
    if (jsonResp.ok && !jsonText.startsWith("<")) {
      const payload = JSON.parse(jsonText);
      const ofp = payload?.ofp || payload?.OFP || payload;
      const items = fromJson(ofp);
      if (items.length) return json({ ok: true, items });
    }

    const xmlResp = await fetch(`${SB_URL}?username=${encodeURIComponent(username)}&json=0`, { cache: "no-store" });
    const xmlText = await xmlResp.text();
    if (!xmlResp.ok || !xmlText || xmlText.startsWith("<!DOCTYPE html")) return json({ ok: true, items: [] });
    const items = fromXml(xmlText);
    return json({ ok: true, items });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Failed to load NOTAMs." }, 500);
  }
};

