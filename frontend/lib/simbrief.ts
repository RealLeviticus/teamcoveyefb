// lib/simbrief.ts
import { XMLParser } from "fast-xml-parser";

export type SimbriefData = {
  departureIcao: string;
  departureName: string;
  arrivalIcao: string;
  arrivalName: string;
  atcRoute: string;
  ofpPdfUrl?: string;
  vatsimPrefileUrl?: string;
};

const SB_ENDPOINT = "https://www.simbrief.com/api/xml.fetcher.php";

export class SimbriefError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = "SimbriefError";
    this.status = status;
  }
}

function parseSimbriefStatusFromBody(body: string): string | null {
  const t = (body || "").trim();
  if (!t) return null;
  try {
    const j = JSON.parse(t);
    const status = j?.fetch?.status;
    if (typeof status === "string" && status.trim()) return status.trim();
  } catch {
    // ignore
  }
  const m = t.match(/<status>([^<]+)<\/status>/i);
  if (m?.[1]) return m[1].trim();
  return null;
}

function buildIdKeys(identifier: string): Array<"username" | "userid" | "static_id"> {
  const trimmed = identifier.trim();
  const keys: Array<"username" | "userid" | "static_id"> = [];
  if (/^\d+$/.test(trimmed)) keys.push("userid");
  keys.push("username", "static_id");
  return Array.from(new Set(keys));
}

type SimbriefRawResult = {
  body: string;
  url: string;
  key: "username" | "userid" | "static_id";
};

function timeoutSignal(ms: number): AbortSignal | undefined {
  const a: any = AbortSignal as any;
  if (a && typeof a.timeout === "function") return a.timeout(ms);
  return undefined;
}

async function fetchSimbriefRaw(identifier: string, asJson: boolean): Promise<SimbriefRawResult> {
  const id = identifier.trim();
  if (!id) throw new SimbriefError("No SimBrief username provided.", 400);

  const keys = buildIdKeys(id);
  let lastMessage = "Unable to reach SimBrief.";
  let lastStatus = 502;

  for (const key of keys) {
    const url = `${SB_ENDPOINT}?${key}=${encodeURIComponent(id)}${asJson ? "&json=1" : ""}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "GET",
        cache: "no-store",
        redirect: "follow",
        headers: { "User-Agent": "CoveyEFB/1.0 (+simbrief)" },
        signal: timeoutSignal(15000),
      });
    } catch (e: any) {
      lastMessage = `SimBrief request failed (${key}): ${e?.message || String(e)}`;
      lastStatus = 502;
      continue;
    }

    const body = await res.text();
    if (res.ok && body.trim()) {
      return { body, url, key };
    }

    const statusText = parseSimbriefStatusFromBody(body);
    lastMessage = statusText
      ? `SimBrief ${key} error: ${statusText}`
      : `SimBrief ${key} fetch failed (HTTP ${res.status}).`;
    lastStatus = res.status >= 500 ? 502 : 400;
  }

  throw new SimbriefError(lastMessage, lastStatus);
}

function isPdfFilename(s: string) {
  return /^[A-Za-z0-9._-]+_PDF_\d+\.pdf$/i.test(s) || /^[A-Za-z0-9._-]+\.pdf$/i.test(s);
}

/**
 * Normalise anything SimBrief might give us (filename, relative, or odd absolute)
 * into a canonical absolute URL under https://www.simbrief.com/ofp/flightplans/.
 */
export function normaliseSimbriefPdfUrl(raw: string | undefined): string | undefined {
  if (!raw || typeof raw !== "string") return undefined;
  const s = raw.trim();

  // 1) Already an absolute URL?
  try {
    const u = new URL(s);
    const host = u.hostname.toLowerCase();

    // If it's a bare root like https://www.simbrief.com/<file>.pdf → rewrite to /ofp/flightplans/<file>.pdf
    if (
      (host === "simbrief.com" || host === "www.simbrief.com" || host === "dispatch.simbrief.com") &&
      isPdfFilename(u.pathname.replace(/^\/+/, ""))
    ) {
      const file = u.pathname.split("/").pop()!;
      return `https://www.simbrief.com/ofp/flightplans/${encodeURIComponent(file)}`;
    }

    // If it's already in /ofp/flightplans, keep as-is
    if (/^\/ofp\/flightplans\/.+\.pdf$/i.test(u.pathname)) {
      return u.toString();
    }

    // Otherwise, leave absolute SimBrief URLs alone (validator will try fallbacks)
    return u.toString();
  } catch {
    // Not absolute, continue
  }

  // 2) Site-relative like /ofp/flightplans/<file>.pdf → absolutise
  if (s.startsWith("/ofp/flightplans/") && s.toLowerCase().endsWith(".pdf")) {
    return `https://www.simbrief.com${s}`;
  }

  // 3) Bare filename → canonical path
  if (isPdfFilename(s)) {
    return `https://www.simbrief.com/ofp/flightplans/${encodeURIComponent(s)}`;
  }

  // Unknown form
  return undefined;
}

export async function fetchSimbriefXml(username: string): Promise<string> {
  const { body } = await fetchSimbriefRaw(username, false);
  if (!body.trim()) throw new Error("SimBrief returned empty body.");

  const head = body.trim().slice(0, 64).toLowerCase();
  if (head.startsWith("<!doctype") || head.startsWith("<html")) {
    throw new Error("SimBrief responded with HTML (login/CF/error page).");
  }
  return body;
}

export async function fetchSimbriefJson(identifier: string): Promise<any> {
  const { body } = await fetchSimbriefRaw(identifier, true);
  let parsed: any;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new SimbriefError("SimBrief returned invalid JSON.", 502);
  }
  const statusText = parseSimbriefStatusFromBody(body);
  if (statusText && /^error\b/i.test(statusText)) {
    throw new SimbriefError(`SimBrief error: ${statusText}`, 400);
  }
  return parsed;
}

export function parseSimbrief(xml: string): SimbriefData {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
  const rootDoc = parser.parse(xml) as any;
  const root = rootDoc?.OFP ?? rootDoc;

  const departureIcao = root?.origin?.icao_code ?? "";
  const departureName = root?.origin?.name ?? "";
  const arrivalIcao = root?.destination?.icao_code ?? "";
  const arrivalName = root?.destination?.name ?? "";
  const atcRoute = root?.general?.route ?? "";

  // files.pdf may be object or array — choose the best (latest by plan_id or highest numeric suffix)
  let ofpPdfUrl: string | undefined;
  const files = root?.files;
  if (files?.pdf) {
    const pdfArr = Array.isArray(files.pdf) ? files.pdf : [files.pdf];
    const planIdDigits: string | null = (() => {
      const raw = String(
        root?.general?.plan_id ?? root?.general?.unix_time ?? root?.params?.time_generated ?? ""
      );
      const onlyDigits = raw.replace(/[^\d]/g, "");
      return onlyDigits.length ? onlyDigits : null;
    })();

    type Cand = { href: string; suffix?: number };
    const cands: Cand[] = [];
    for (const p of pdfArr) {
      const link = p?.link || p?.href || p?.url;
      if (!link || typeof link !== "string") continue;
      const norm = normaliseSimbriefPdfUrl(String(link));
      if (!norm) continue;
      const m = norm.match(/_PDF_(\d+)\.pdf/i);
      const suf = m ? Number(m[1]) : undefined;
      cands.push({ href: norm, suffix: suf });
    }

    let chosen: Cand | undefined;
    if (planIdDigits) {
      chosen = cands.find((c) => new RegExp(`_PDF_${planIdDigits}\\.pdf$`, "i").test(c.href));
    }
    if (!chosen) {
      // pick the one with the largest numeric suffix if available
      chosen = cands.slice().sort((a, b) => (b.suffix || 0) - (a.suffix || 0))[0];
    }
    if (!chosen) {
      chosen = cands[0];
    }
    if (chosen) ofpPdfUrl = chosen.href;
  }

  // prefile.vatsim may be object or array
  let vatsimPrefileUrl: string | undefined;
  const pre = root?.prefile;
  if (pre?.vatsim) {
    const va = Array.isArray(pre.vatsim) ? pre.vatsim : [pre.vatsim];
    const withLink = va.find((p: any) => p?.link);
    if (withLink?.link) vatsimPrefileUrl = normaliseSimbriefPdfUrl(withLink.link);
  }

  return {
    departureIcao,
    departureName,
    arrivalIcao,
    arrivalName,
    atcRoute,
    ofpPdfUrl,
    vatsimPrefileUrl,
  };
}

export function requireUsername(url: URL): string {
  const u = url.searchParams.get("username")?.trim() || "";
  if (!u) throw new Error("Pass ?username=YourSimBriefName");
  return u;
}
