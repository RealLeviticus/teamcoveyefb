// components/MainArea.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Panel } from "@/components/panel";
import PdfViewer from "@/components/PdfViewer";
import { FlightCard, type FlightSummary, type VatsimState } from "@/components/FlightCard";
import { loadSettings, setSimbriefUsername, setVatsimCid, setHoppieLogon } from "@/lib/settings";

const VIEWS = ["flight", "ofp", "map", "notams", "wx", "acars", "checklists_sops", "audio", "settings"] as const;
type ViewKey = (typeof VIEWS)[number];

const LS_PDF = "covey_last_simbrief_pdf";

/* ---------------------- small utilities ---------------------- */
async function parseJsonSafe(res: Response) {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { ok: false, text }; }
}

function haversineNm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const Rnm = 3440.065;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * Rnm * Math.asin(Math.min(1, Math.sqrt(h)));
}

function parseCruiseAltFt(input: any): number | null {
  if (input == null) return null;
  const s = String(input).trim().toUpperCase();
  if (!s) return null;
  if (s.startsWith("FL")) {
    const f = parseInt(s.slice(2), 10);
    return Number.isFinite(f) ? f * 100 : null;
  }
  const n = parseInt(s, 10);
  if (!Number.isFinite(n)) return null;
  return n > 4000 ? n : n * 100;
}

function parseTasKts(input: any): number | null {
  if (input == null) return null;
  const s = String(input).trim().toUpperCase();
  if (!s) return null;
  const m = s.match(/(\d{2,4})/);
  if (!m) return null;
  const v = parseInt(m[1], 10);
  return Number.isFinite(v) ? v : null;
}

function callsignAirlinePrefix(callsign?: string | null): string | null {
  const c = (callsign || "").trim().toUpperCase();
  if (!c) return null;
  const m = c.match(/^[A-Z]{2,3}/);
  return m ? m[0] : null;
}

/* ---------------------- NOTAM types & parsing ---------------------- */
type NotamItem = {
  station: string; // may be empty from source; we resolve it
  id?: string;
  text: string;
  starts?: string;
  ends?: string;
  type?: string; // classification bucket
};

function classifyNotam(text: string): string {
  const t = (text || "").toUpperCase();
  if (/\b(RWY|RUNWAY|QMR|RWY\d{2}[LRC]?|THR|STOPWAY|RESA|ARREST)\b/.test(t)) return "Runway";
  if (/\b(TWY|TAXIWAY|QMX|HOLD(?:ING)? POINT|HST)\b/.test(t)) return "Taxiway";
  if (/\b(APRON|STAND|GATE|BAY|RAMP)\b/.test(t)) return "Apron/Stand";
  if (/\b(ILS|LLZ|LOC|GS|DME|VOR|DVOR|NDB|TACAN|VORTAC|RNAV|RNP|GNSS|PAPI|VASIS?)\b/.test(t)) return "Nav Aids";
  if (/\b(ATIS|TWR|APP|ACC|AFIS|FIS|RADAR|COM|FREQ|CPDLC|DATALINK|RCO)\b/.test(t)) return "Comms/ATC";
  if (/\b(CTR|TMA|AIRSPACE|PROHIBITED|RESTRICTED|DANGER|TRA|TEMP(?:ORARY)? RESERVED)\b/.test(t)) return "Airspace";
  if (/\b(OBST|CRANE|WIP|WORK IN PROGRESS|BIRD|SNOW|ICE|BRAKING ACTION|ARFF|RFFS?|AD\s?CLSD|AERODROME)\b/.test(t)) return "Aerodrome";
  return "Other";
}
/** Keep the VATSIM web map mounted so it never reloads when switching tabs. */
function MapPane({ visible }: { visible: boolean }) {
  return (
    <div
      className={[
        "h-full w-full rounded-lg border border-neutral-200 dark:border-neutral-800",
        visible ? "block" : "block opacity-0 pointer-events-none absolute inset-0",
      ].join(" ")}
    >
      <iframe
        src="https://map.vatsim.net/"
        title="VATSIM Radar"
        className="w-full h-full rounded-lg"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}

/** Client fallback: parse NOTAMs from OFP XML if server returned nothing. */
function parseNotamsFromOfpXml(xmlText: string): NotamItem[] {
  try {
    const dom = new DOMParser().parseFromString(xmlText, "application/xml");
    const nodes = Array.from(dom.getElementsByTagName("notam"));
    const items: NotamItem[] = nodes.map((n) => {
      const station =
        n.getAttribute("icao") ||
        n.getAttribute("station") ||
        n.getElementsByTagName("station")?.[0]?.textContent ||
        "";
      const id =
        n.getAttribute("id") ||
        n.getElementsByTagName("id")?.[0]?.textContent ||
        undefined;
      const starts =
        n.getAttribute("from") ||
        n.getElementsByTagName("from")?.[0]?.textContent ||
        undefined;
      const ends =
        n.getAttribute("to") ||
        n.getElementsByTagName("to")?.[0]?.textContent ||
        undefined;
      const text =
        n.getElementsByTagName("text")?.[0]?.textContent?.trim() ||
        n.textContent?.trim() ||
        "";
      return {
        station: (station || "OTHER").toUpperCase(),
        id,
        text,
        starts,
        ends,
        type: classifyNotam(text),
      };
    });

    if (items.length === 0) {
      const candidates = ["origin_notams", "dest_notams", "alternate_notams", "notams", "airport_notams"];
      for (const tag of candidates) {
        const els = Array.from(dom.getElementsByTagName(tag));
        for (const el of els) {
          const raw = el.textContent || "";
          const lines = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
          const blocks: string[] = [];
          let buf: string[] = [];
          for (const ln of lines) {
            if (/^[-=]{3,}$/.test(ln)) continue;
            if (ln === "") { if (buf.length) { blocks.push(buf.join("\n")); buf = []; } continue; }
            buf.push(ln);
          }
          if (buf.length) blocks.push(buf.join("\n"));
          for (const b of blocks) {
            const m = b.match(/\b[A-Z]{4}\b/);
            items.push({ station: (m?.[0] || "OTHER").toUpperCase(), text: b, type: classifyNotam(b) });
          }
        }
      }
    }

    return items
      .map((x) => ({ ...x, id: x.id || undefined, text: x.text.trim(), type: x.type || classifyNotam(x.text) }))
      .filter((x) => x.text.length > 0);
  } catch {
    return [];
  }
}

/* ---------------------- station resolution / OTHER grouping ---------------------- */
function normaliseICAO(v?: string | null) {
  return (v || "").trim().toUpperCase();
}

/** Parse "ALTN" strings like "YMEN", "YMEN YWOL", "YMEN/YWOL", "YMEN, YWOL". */
function splitAlternates(alts?: string | null): string[] {
  const raw = normaliseICAO(alts);
  if (!raw) return [];
  return raw
    .split(/[\s,\/;|]+/)
    .map((x) => x.trim())
    .filter((x) => /^[A-Z]{4}$/.test(x));
}

/** Split an airport name into matchable keywords (drop generic words). */
function nameKeywords(name?: string | null): string[] {
  if (!name) return [];
  const generic = new Set(["AIRPORT", "AERODROME", "INTL", "INTERNATIONAL", "FIELD", "AP", "APT"]);
  return name
    .replace(/[()]/g, " ")
    .split(/[\s\-\/,]+/)
    .map((w) => w.trim().toUpperCase())
    .filter((w) => w.length >= 3 && !generic.has(w));
}

type WhitelistItem = { code: string; names: string[]; rank: number }; // rank: 0 origin, 1 destination, 2+ alternates (in order)

/** Build whitelist with ICAO + name keywords for origin/dest/all alternates. */
function buildWhitelist(flight: FlightSummary | null): WhitelistItem[] {
  const wl: WhitelistItem[] = [];
  if (!flight) return wl;

  const o = normaliseICAO(flight.origin?.icao);
  const d = normaliseICAO(flight.destination?.icao);
  const altCodes = splitAlternates(flight.alternate);

  if (o) wl.push({ code: o, names: nameKeywords(flight.origin?.name), rank: 0 });
  if (d) wl.push({ code: d, names: nameKeywords(flight.destination?.name), rank: 1 });

  altCodes.forEach((code, i) => {
    // We likely don't have names for alternates in your summary, but the code match is still helpful.
    wl.push({ code, names: [], rank: 2 + i });
  });

  return wl;
}

/** Common 4-letter uppercase words that are NOT ICAO codes (stoplist to keep OTHER clean). */
const UPPER_STOPWORDS = new Set([
  "ACFT", "WILL", "NOTE", "PAGE", "READ", "WITH", "ONLY", "INTO", "BLUE", "FIRE", "EAST", "FLOW", "GRID",
  "HIGH", "HLDG", "OBST", "TKOF", "TODA", "AREA", "PLAN", "PORT", "WIND", "INFO", "BIRD", "CLSD", "RUNS",
]);

/** Find a non-whitelisted ICAO-like token in text for OTHER sub-grouping. */
function firstIcaoLike(text: string, exclude: Set<string>): string | null {
  const t = (text || "").toUpperCase();
  const m = t.match(/\b[A-Z]{4}\b/g);
  if (!m) return null;
  for (const code of m) {
    if (exclude.has(code)) continue;
    if (UPPER_STOPWORDS.has(code)) continue;
    return code;
  }
  return null;
}

/** Does text contain any of the airport name keywords (whole-word)? */
function textMentionsName(text: string, keywords: string[]): boolean {
  if (!keywords.length) return false;
  const T = text.toUpperCase();
  return keywords.some((kw) => new RegExp(`\\b${kw}\\b`, "i").test(T));
}

/** Resolve which airport a NOTAM belongs to, using station, ICAO in text, or names. */
function resolveToWhitelistedStation(n: NotamItem, wl: WhitelistItem[]): string | null {
  const text = n.text || "";
  const station = normaliseICAO(n.station);
  const codes = new Set(wl.map((w) => w.code));

  // 1) Direct station match
  if (station && codes.has(station)) return station;

  // 2) Any whitelisted ICAO in body
  for (const w of wl) {
    if (w.code && text.toUpperCase().includes(w.code)) return w.code;
  }

  // 3) Any whitelisted airport name keywords in body (choose highest priority rank)
  const matches = wl.filter((w) => textMentionsName(text, w.names));
  if (matches.length) {
    matches.sort((a, b) => a.rank - b.rank);
    return matches[0].code;
  }

  return null;
}

/** Guess an OTHER subgrouping key (ICAO first, else a coarse name token). */
function inferOtherPlaceKey(n: NotamItem, wl: WhitelistItem[]): string {
  const text = n.text || "";
  const exclude = new Set(wl.map((w) => w.code));
  const code = firstIcaoLike(text, exclude);
  if (code) return code;

  // Try a simple uppercase "name-ish" token that isn't a stopword
  const tokens = text.toUpperCase().split(/[^A-Z]+/).filter((t) => t.length >= 4 && !UPPER_STOPWORDS.has(t));
  if (tokens.length) return tokens[0];

  return "Misc";
}

/* ---------------------- Component ---------------------- */
export function MainArea() {
  const [view, setView] = useState<ViewKey>("flight");
  const [fading, setFading] = useState(false);

  // Settings
  const [username, setUsername] = useState("");
  const [usernameDraft, setUsernameDraft] = useState("");
  const [cid, setCid] = useState("");
  const [cidDraft, setCidDraft] = useState("");
  const [hoppie, setHoppie] = useState("");
  const [hoppieDraft, setHoppieDraft] = useState("");

  // OFP PDF
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [loadingPDF, setLoadingPDF] = useState(false);

  // SimBrief
  const [flight, setFlight] = useState<FlightSummary | null>(null);
  const [flightError, setFlightError] = useState<string | null>(null);
  const [loadingFlight, setLoadingFlight] = useState(false);

  // VATSIM
  const [vatsim, setVatsim] = useState<VatsimState | null>(null);
  const vatsimTimer = useRef<number | null>(null);
  const gsHistoryRef = useRef<number[]>([]);
  const altHistoryRef = useRef<number[]>([]);

  // NOTAMs
  const [notams, setNotams] = useState<NotamItem[] | null>(null);
  const [loadingNotams, setLoadingNotams] = useState(false);
  const [notamError, setNotamError] = useState<string | null>(null);

  // METAR/TAF (WX) for origin/destination/alternate
  type WxReport = { metar?: string; taf?: string; metarTime?: string | null; tafTime?: string | null };
  const [wx, setWx] = useState<Record<string, WxReport> | null>(null);
  const [loadingWx, setLoadingWx] = useState(false);
  const [wxError, setWxError] = useState<string | null>(null);

  // ACARS
  const [acarsLogon, setAcarsLogon] = useState("");
  const [acarsFrom, setAcarsFrom] = useState("");
  const [acarsTo, setAcarsTo] = useState("ATC");
  const [acarsText, setAcarsText] = useState("");
  const [acarsSending, setAcarsSending] = useState(false);
  const [acarsError, setAcarsError] = useState<string | null>(null);
  const [acarsType, setAcarsType] = useState<'telex' | 'cpdlc' | 'ping' | 'posreq' | 'position'>("telex");
  const [acarsInbox, setAcarsInbox] = useState<Array<{ time?: string; from?: string; to?: string; text: string }>>([]);
  const [acarsShowComposer, setAcarsShowComposer] = useState(false);
  const seenAcarsKeysRef = useRef<Set<string>>(new Set());
  const [acarsUnread, setAcarsUnread] = useState(0);

  const acarsInboxKey = React.useMemo(() => {
    const log = (acarsLogon || '').trim();
    const from = (acarsFrom || '').trim();
    return log && from ? `acars_inbox_${log}_${from}` : null;
  }, [acarsLogon, acarsFrom]);

  useEffect(() => {
    const s = loadSettings();
    if (s.hoppieLogon) setAcarsLogon(s.hoppieLogon);
  }, []);

  // Prefer online VATSIM callsign; fall back to flight summary callsign
  useEffect(() => {
    const vCall = (vatsim?.callsign || "").trim();
    const fCall = (flight?.callsign || "").trim();
    const next = vCall || fCall || "";
    if (next) setAcarsFrom(next.toUpperCase());
  }, [vatsim?.callsign, flight?.callsign]);

  async function acarsSend() {
    try {
      setAcarsSending(true); setAcarsError(null);
      const res = await fetch('/api/acars/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logon: acarsLogon, from: acarsFrom, to: acarsTo, type: acarsType, text: acarsText })
      });
      const j = await res.json();
      if (!res.ok || !j?.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      setAcarsText("");
    } catch (e: any) {
      setAcarsError(e?.message || 'Failed to send');
    } finally { setAcarsSending(false); }
  }

  // Quick templates/actions
  function useTemplatePdc() {
    setAcarsType('cpdlc');
    setAcarsText((t) => t || 'REQUEST CLEARANCE');
  }
  function useTemplateCpdlcLogon() {
    setAcarsType('cpdlc');
    setAcarsText('REQUEST LOGON');
  }
  function useTemplatePosition() {
    setAcarsType('position');
    const lat = vatsim?.lat ?? null;
    const lon = vatsim?.lon ?? null;
    const alt = vatsim?.altitudeFt ?? null;
    const gs = vatsim?.groundspeed ?? null;
    const hdg = vatsim?.headingDeg ?? null;
    const pos = ((): string => {
      if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) return 'N00.000 E000.000';
      const ns = lat >= 0 ? 'N' : 'S';
      const ew = lon >= 0 ? 'E' : 'W';
      return `${ns}${Math.abs(lat).toFixed(3)} ${ew}${Math.abs(lon).toFixed(3)}`;
    })();
    const parts = [pos];
    if (alt != null) parts.push(`ALT ${Math.round(alt)}FT`);
    if (gs != null) parts.push(`GS ${Math.round(gs)}`);
    if (hdg != null) parts.push(`HDG ${Math.round(hdg)}`);
    setAcarsText(parts.join(' '));
  }

  async function acarsLoadInbox() {
    try {
      setAcarsError(null);
      const qs = new URLSearchParams({ logon: acarsLogon, from: acarsFrom }).toString();
      const res = await fetch(`/api/acars/inbox?${qs}`, { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok || !j?.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      const msgs: Array<{ time?: string; from?: string; to?: string; text: string }> = Array.isArray(j.messages) ? j.messages : [];
      // Merge with cache and persist
      let merged = msgs;
      try {
        if (acarsInboxKey) {
          const existingRaw = localStorage.getItem(acarsInboxKey);
          const existing: Array<{ time?: string; from?: string; to?: string; text: string }> = existingRaw ? JSON.parse(existingRaw) : [];
          const seen = new Set<string>();
          const keyOf = (m: any) => `${m.time || ''}|${m.from || ''}|${m.to || ''}|${m.text || ''}`;
          for (const m of existing) seen.add(keyOf(m));
          const combined = [...existing];
          for (const m of msgs) {
            const k = keyOf(m);
            if (!seen.has(k)) { seen.add(k); combined.push(m); }
          }
          // Keep last 200
          merged = combined.slice(-200);
          localStorage.setItem(acarsInboxKey, JSON.stringify(merged));
        }
      } catch {}
      setAcarsInbox(merged);
      // Unread + sound
      let newCount = 0;
      for (const m of msgs) {
        const key = `${m.time || ''}|${m.from || ''}|${m.to || ''}|${m.text || ''}`;
        if (!seenAcarsKeysRef.current.has(key)) {
          seenAcarsKeysRef.current.add(key);
          newCount++;
        }
      }
      if (newCount > 0) {
        if (view === 'acars') setAcarsUnread(0); else setAcarsUnread((u) => u + newCount);
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'sine';
          o.frequency.value = 880;
          o.connect(g); g.connect(ctx.destination);
          const now = ctx.currentTime;
          g.gain.setValueAtTime(0.0001, now);
          g.gain.exponentialRampToValueAtTime(0.1, now + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
          o.start(now); o.stop(now + 0.25);
        } catch {}
      }
    } catch (e: any) {
      setAcarsError(e?.message || 'Failed to load inbox');
    }
  }

  // Background poll for inbox (every 20s) when logon + callsign present
  useEffect(() => {
    let timer: number | undefined;
    const canPoll = Boolean(acarsLogon && acarsFrom);
    const tick = () => { if (canPoll) void acarsLoadInbox(); };
    if (canPoll) {
      // Load cache immediately if present
      try {
        if (acarsInboxKey) {
          const existingRaw = localStorage.getItem(acarsInboxKey);
          if (existingRaw) {
            const arr = JSON.parse(existingRaw);
            if (Array.isArray(arr)) setAcarsInbox(arr);
          }
        }
      } catch {}
      timer = window.setInterval(tick, 20000);
      // initial fetch
      void acarsLoadInbox();
    }
    return () => { if (timer) window.clearInterval(timer); };
  }, [acarsLogon, acarsFrom, acarsInboxKey]);

  // Clear unread when opening ACARS tab
  useEffect(() => { if (view === 'acars') setAcarsUnread(0); }, [view]);

  // Expand/collapse
  const [openStations, setOpenStations] = useState<Set<string>>(new Set());
  const [openTypes, setOpenTypes] = useState<Set<string>>(new Set()); // key: `${station}|${type}`
  const [openOtherPlaces, setOpenOtherPlaces] = useState<Set<string>>(new Set()); // inside OTHER: place buttons

  // PDF zoom
  const [zoom, setZoom] = useState<number>(1);

  // Load settings + cached PDF on mount
  useEffect(() => {
    try {
      const s = loadSettings();
      if (s.simbriefUsername) { setUsername(s.simbriefUsername); setUsernameDraft(s.simbriefUsername); }
      if (s.vatsimCid) { setCid(s.vatsimCid); setCidDraft(s.vatsimCid); }
      if (s.hoppieLogon) { setHoppie(s.hoppieLogon); setHoppieDraft(s.hoppieLogon); }
      const cached = localStorage.getItem(LS_PDF);
      if (cached) setPdfUrl(cached);
    } catch {}
  }, []);

  const qs = useMemo(() => (username ? `?username=${encodeURIComponent(username)}` : ""), [username]);

  /* ---------------------- OFP PDF ---------------------- */
  async function resolveLatestPdf(force = false, opts: { silent?: boolean } = {}) {
    const { silent = false } = opts;
    if (!force && pdfUrl) return;
    if (!username) { if (!silent) setPdfError("Please set your SimBrief username in Settings."); return; }

    if (!silent) { setLoadingPDF(true); setPdfError(null); }
    try {
      const res = await fetch(`/api/simbrief/ofp-latest-pdf${qs}`, { cache: "no-store" });
      const j = await parseJsonSafe(res);
      if (!res.ok || !j?.ok || !j?.url) throw new Error(j?.error || "Invalid server response.");
      const val = await fetch(`/api/simbrief/validate-pdf?url=${encodeURIComponent(j.url)}`);
      const vj = await parseJsonSafe(val);
      if (!val.ok || !vj?.ok) throw new Error(vj?.error || "PDF could not be validated.");
      setPdfUrl(vj.url); localStorage.setItem(LS_PDF, vj.url);
    } catch (e: any) {
      if (!silent) {
        const cached = localStorage.getItem(LS_PDF);
        if (cached) { setPdfUrl(cached); setPdfError(`${e?.message || "Failed"} — showing last known PDF.`); }
        else setPdfError(e?.message || "Failed to load OFP PDF.");
      }
    } finally { if (!silent) setLoadingPDF(false); }
  }

  /* ---------------------- SimBrief summary ---------------------- */
  async function resolveFlightSummary(silent = true) {
    if (!username) return;
    if (!silent) { setLoadingFlight(true); setFlightError(null); }
    try {
      const res = await fetch(`/api/simbrief/summary${qs}`, { cache: "no-store" });
      const j = await parseJsonSafe(res);
      if (!res.ok || !j?.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      setFlight({
        origin: j.origin ?? null,
        destination: j.destination ?? null,
        alternate: j.alternate ?? null, // could contain multiple ICAOs; we handle it
        schedOut: j.schedOut ?? null,
        schedIn: j.schedIn ?? null,
        companyRoute: j.companyRoute ?? null,
        zfw: j.zfw ?? null,
        costIndex: j.costIndex ?? null,
        avgWind: j.avgWind ?? null,
        cruiseAlt: j.cruiseAlt ?? null,
        route: j.route ?? null,
        callsign: j.callsign ?? null,
        plannedDistanceNm: j.plannedDistanceNm ?? null,
        plannedEte: j.plannedEte ?? null,
        plannedFuel: j.plannedFuel ?? null,
      });
    } catch (e: any) {
      setFlightError(e?.message || "Failed to load flight summary.");
    } finally { if (!silent) setLoadingFlight(false); }
  }

  /* ---------------------- VATSIM polling ---------------------- */
  function derivePhase(gs: number | null, alt: number | null, cruiseFt: number | null): VatsimState["phase"] {
    if ((gs ?? 0) < 30 && (alt ?? 0) < 100) return "ground";
    if (cruiseFt && alt != null) {
      if (alt < cruiseFt - 1500 && (gs ?? 0) > 200) return "climb";
      if (alt > cruiseFt + 1500 && (gs ?? 0) > 200) return "descent";
      if (Math.abs(alt - cruiseFt) <= 1500) return "cruise";
    }
    return "unknown";
  }

  async function pollVatsimOnce() {
    const cidTrim = cid.trim();
    const callsignTrim = flight?.callsign?.trim();
    if (!cidTrim && !callsignTrim) { setVatsim({ online: false }); return; }

    try {
      const url = cidTrim
        ? `/api/vatsim/online?cid=${encodeURIComponent(cidTrim)}`
        : `/api/vatsim/pilot?callsign=${encodeURIComponent(callsignTrim!)}`;

      const res = await fetch(url, { cache: "no-store" });
      const j = await parseJsonSafe(res);
      if (!res.ok || !j?.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      if (!j.online) { setVatsim({ online: false }); return; }

      const pilot = j.pilot || j || {};
      const fp = pilot.flight_plan || pilot.fp || {};

      const lat = Number(pilot.latitude ?? pilot.lat ?? NaN);
      const lon = Number(pilot.longitude ?? pilot.lon ?? NaN);
      const gs = Number(pilot.groundspeed ?? pilot.ground_speed ?? pilot.gs ?? 0) || 0;
      const altFt = Number(pilot.altitude ?? pilot.altitude_ft ?? pilot.alt ?? 0) || 0;
      const hdg = Number(pilot.heading ?? pilot.heading_deg ?? pilot.hdg ?? 0) || 0;

      const squawk = (pilot.transponder ?? pilot.squawk ?? null) ? String(pilot.transponder ?? pilot.squawk) : null;
      const com = pilot.frequency ?? pilot.com ?? null;

      const depIcao = (fp.departure ?? fp.dep ?? pilot.departure)?.toString()?.toUpperCase() || null;
      const arrIcao = (fp.arrival ?? fp.arr ?? pilot.arrival)?.toString()?.toUpperCase() || null;
      const altIcao = (fp.alternate ?? fp.altn ?? fp.alternate_icao ?? "").toString().toUpperCase() || null;

      const vCallsign = (fp.callsign ?? pilot.callsign ?? "").toString().trim() || null;
      const vRoute = (fp.route ?? pilot.route ?? "").toString().trim() || null;

      const acType = (fp.aircraft ?? fp.aircraft_faa ?? fp.aircraft_icao ?? pilot.aircraft ?? "").toString().trim() || null;
      const tasKts = parseTasKts(fp.tas ?? fp.cruise_tas ?? fp.true_air_speed ?? null);
      const cruiseAltFt = parseCruiseAltFt(fp.altitude ?? fp.cruise_altitude ?? null);

      const pilotName = (pilot.name ?? pilot.realname ?? "").toString() || null;
      const pilotCid = (pilot.cid ?? pilot.vatsim_cid ?? "").toString() || null;
      const airline = (pilot.airline ?? callsignAirlinePrefix(vCallsign) ?? "").toString() || null;

      let remainingNm: number | null = null, flownNm: number | null = null, etaText: string | null = null;
      const destLat = flight?.destination?.lat ?? null;
      const destLon = flight?.destination?.lon ?? null;
      const total = flight?.plannedDistanceNm ?? null;

      if (destLat != null && destLon != null && Number.isFinite(lat) && Number.isFinite(lon)) {
        remainingNm = haversineNm({ lat, lon }, { lat: Number(destLat), lon: Number(destLon) });
        if (total != null) flownNm = Math.max(0, total - remainingNm);
        if (gs > 20 && remainingNm != null) {
          const mins = Math.round((remainingNm / gs) * 60);
          etaText = `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
        }
      }

      const phase = derivePhase(gs, altFt, cruiseAltFt);
      gsHistoryRef.current.push(gs); if (gsHistoryRef.current.length > 10) gsHistoryRef.current.shift();
      altHistoryRef.current.push(altFt); if (altHistoryRef.current.length > 10) altHistoryRef.current.shift();

      setVatsim({
        online: true,
        lat: Number.isFinite(lat) ? lat : null,
        lon: Number.isFinite(lon) ? lon : null,
        groundspeed: gs,
        altitudeFt: altFt,
        headingDeg: hdg,
        remainingNm,
        flownNm,
        etaText,
        phase,
        squawk,
        com,
        pilotName,
        pilotCid,
        airline,
        callsign: vCallsign,
        route: vRoute,
        origin: depIcao ? { icao: depIcao, name: "", lat: null, lon: null } : undefined,
        destination: arrIcao ? { icao: arrIcao, name: "", lat: null, lon: null } : undefined,
        alternateIcao: altIcao || undefined,
        aircraft: acType,
        tasKts,
        cruiseAltFt,
        gsHistory: [...gsHistoryRef.current],
        altHistory: [...altHistoryRef.current],
      });
    } catch {
      setVatsim({ online: false });
    }
  }

  useEffect(() => {
    const keyAvailable = Boolean(cid?.trim() || flight?.callsign?.trim());
    if (view !== "flight" || !keyAvailable) {
      if (vatsimTimer.current) { window.clearInterval(vatsimTimer.current); vatsimTimer.current = null; }
      return;
    }
    void pollVatsimOnce();
    vatsimTimer.current = window.setInterval(() => void pollVatsimOnce(), 15_000);
    return () => { if (vatsimTimer.current) { window.clearInterval(vatsimTimer.current); vatsimTimer.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, flight?.callsign, cid]);

  // Prefetch when username known
  useEffect(() => {
    if (username) { resolveFlightSummary(true); resolveLatestPdf(false, { silent: true }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  // If opening OFP without URL yet, fetch it
  useEffect(() => {
    if (view === "ofp" && username && !pdfUrl) resolveLatestPdf(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, username]);

  /* ---------------------- NOTAMs loader ---------------------- */
  const fetchNotams = React.useCallback(async () => {
    if (!username?.trim()) {
      setNotams(null);
      setNotamError("Please set your SimBrief username in Settings.");
      return;
    }
    setLoadingNotams(true);
    setNotamError(null);
    try {
      // Primary: server-side parsed NOTAMs
      const res = await fetch(`/api/simbrief/ofp-notams?username=${encodeURIComponent(username)}`, { cache: "no-store" });
      const j = await parseJsonSafe(res);
      let items: NotamItem[] = [];
      if (res.ok && j?.ok && Array.isArray(j.items)) items = j.items;

      // Fallback: client-side XML scan
      if (!items.length) {
        const xmlRes = await fetch(`/api/simbrief/ofp-xml?username=${encodeURIComponent(username)}`, { cache: "no-store" });
        if (xmlRes.ok) {
          const xmlText = await xmlRes.text();
          const parsed = parseNotamsFromOfpXml(xmlText);
          if (parsed.length) items = parsed;
        }
      }

      items = items.map((n) => ({ ...n, type: n.type || classifyNotam(n.text) }));
      setNotams(items);
      if (!items.length) setNotamError("No NOTAMs found in the latest OFP.");
    } catch (e: any) {
      setNotamError(e?.message || "Failed to load NOTAMs.");
      setNotams(null);
    } finally {
      setLoadingNotams(false);
    }
  }, [username]);

  // Load NOTAMs when entering the tab
  useEffect(() => {
    if (view === "notams") void fetchNotams();
  }, [view, fetchNotams]);

  // Load METAR/TAF when entering WX view
  const loadWx = React.useCallback(async () => {
    try {
      setLoadingWx(true); setWxError(null);
      const stations = [
        flight?.origin?.icao,
        flight?.destination?.icao,
        (flight as any)?.alternate || null,
      ]
        .map((x) => (typeof x === "string" ? x.trim().toUpperCase() : ""))
        .filter((x) => /^[A-Z]{4}$/.test(x));
      const uniq = Array.from(new Set(stations));
      if (!uniq.length) { setWx(null); return; }
      const res = await fetch(`/api/wx/metar-taf?stations=${encodeURIComponent(uniq.join(","))}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok || !j?.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      setWx(j.data || {});
    } catch (e: any) {
      setWxError(e?.message || "Failed to load METAR/TAF");
      setWx(null);
    } finally { setLoadingWx(false); }
  }, [flight]);

  useEffect(() => {
    if (view === "wx") void loadWx();
  }, [view, loadWx]);

  /* ---------------------- Grouping ---------------------- */
  type Grouped =
    | { stations: Map<string, Map<string, NotamItem[]>>; otherPlaces: Map<string, Map<string, NotamItem[]>> };

  const groupedNotams: Grouped = React.useMemo(() => {
    const result: Grouped = { stations: new Map(), otherPlaces: new Map() };
    if (!notams) return result;

    const typeOrder = ["Runway", "Taxiway", "Apron/Stand", "Nav Aids", "Comms/ATC", "Airspace", "Aerodrome", "Other"];
    const wl = buildWhitelist(flight);

    // Assign each NOTAM
    for (const n of notams) {
      const resolved = resolveToWhitelistedStation(n, wl);

      if (resolved) {
        // Goes to real station (origin/dest/alternate)
        if (!result.stations.has(resolved)) result.stations.set(resolved, new Map());
        const inner = result.stations.get(resolved)!;
        const type = n.type || classifyNotam(n.text);
        if (!inner.has(type)) inner.set(type, []);
        inner.get(type)!.push({ ...n, station: resolved, type });
      } else {
        // Goes to OTHER – but subgroup by inferred place (ICAO-or-name)
        const placeKey = inferOtherPlaceKey(n, wl);
        if (!result.otherPlaces.has(placeKey)) result.otherPlaces.set(placeKey, new Map());
        const inner = result.otherPlaces.get(placeKey)!;
        const type = n.type || classifyNotam(n.text);
        if (!inner.has(type)) inner.set(type, []);
        inner.get(type)!.push({ ...n, station: "OTHER", type });
      }
    }

    // Sort items and order types for both real stations and OTHER places
    const orderBuckets = (m: Map<string, Map<string, NotamItem[]>>) => {
      for (const [, inner] of m) {
        for (const [t, arr] of inner) {
          arr.sort((a, b) => {
            const an = a.id ? parseInt(a.id.replace(/\D/g, ""), 10) : NaN;
            const bn = b.id ? parseInt(b.id.replace(/\D/g, ""), 10) : NaN;
            if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
            if (a.id && b.id) return a.id.localeCompare(b.id);
            if (a.id) return -1;
            if (b.id) return 1;
            return a.text.localeCompare(b.text);
          });
        }
        const ordered = new Map<string, NotamItem[]>();
        [...typeOrder, ...[...inner.keys()].sort()].forEach((t) => {
          if (inner.has(t) && !ordered.has(t)) ordered.set(t, inner.get(t)!);
        });
        inner.clear();
        for (const [k, v] of ordered) inner.set(k, v);
      }
    };
    orderBuckets(result.stations);
    orderBuckets(result.otherPlaces);

    // Sort station order: origin, destination, then alternates (in given order)
    const preferred = wl.map((w) => w.code);
    const stationsOrdered = new Map(
      [...result.stations.entries()].sort(([a], [b]) => {
        const ia = preferred.indexOf(a);
        const ib = preferred.indexOf(b);
        if (ia !== -1 || ib !== -1) {
          if (ia === -1) return 1;
          if (ib === -1) return -1;
          return ia - ib;
        }
        return a.localeCompare(b);
      }),
    );
    result.stations = stationsOrdered;

    // Sort OTHER places alphabetically, but keep FIR codes like YMMM grouped naturally
    result.otherPlaces = new Map([...result.otherPlaces.entries()].sort(([a], [b]) => a.localeCompare(b)));

    return result;
  }, [notams, flight]);

  /* ---------------------- UI helpers ---------------------- */
  const changeView = (v: ViewKey) => { if (v === view) return; setFading(true); setTimeout(() => { setView(v); setFading(false); }, 120); };
  const saveUsername = () => {
    const trimmed = usernameDraft.trim();
    setSimbriefUsername(trimmed || undefined);
    setUsername(trimmed);
    localStorage.removeItem(LS_PDF);
    setPdfUrl(null);
    resolveFlightSummary(true);
    resolveLatestPdf(true, { silent: true });
    if (view === "notams") void fetchNotams();
  };
  const clearUsername = () => {
    setSimbriefUsername(undefined);
    setUsername(""); setUsernameDraft("");
    localStorage.removeItem(LS_PDF);
    setPdfUrl(null);
    setFlight(null); setFlightError(null);
    setVatsim(null);
    gsHistoryRef.current = [];
    altHistoryRef.current = [];
    if (view === "notams") { setNotams(null); setNotamError("Please set your SimBrief username in Settings."); }
  };
  const saveCid = () => { const cleaned = cidDraft.trim(); setVatsimCid(cleaned || undefined); setCid(cleaned); if (view === "flight") void pollVatsimOnce(); };
  const clearCid = () => { setVatsimCid(undefined); setCid(""); setCidDraft(""); if (view === "flight") void pollVatsimOnce(); };

  // Hoppie ACARS logon
  const saveHoppie = () => {
    const code = hoppieDraft.trim();
    setHoppieLogon(code || undefined);
    setHoppie(code);
    setAcarsLogon(code);
  };
  const clearHoppie = () => {
    setHoppieLogon(undefined);
    setHoppie("");
    setHoppieDraft("");
    setAcarsLogon("");
  };

  const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
  const zoomOut = () => setZoom((z) => clamp(Math.round((z - 0.1) * 100) / 100, 0.5, 3));
  const zoomIn = () => setZoom((z) => clamp(Math.round((z + 0.1) * 100) / 100, 0.5, 3));
  const zoomReset = () => setZoom(1);

  const shellClass = view === "ofp" ? "h-full rounded-lg p-0 bg-transparent overflow-hidden"
                                    : "h-full rounded-lg bg-neutral-50 dark:bg-neutral-900/40 p-3 overflow-hidden";
  const innerClass = view === "ofp" ? "h-full p-0 m-0 rounded-none border-0 overflow-hidden"
                                    : "h-full rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 overflow-auto";

  const labelFor = (v: ViewKey) =>
    v === "ofp" ? "OFP"
    : v === "map" ? "Map"
    : v === "notams" ? "NOTAM"
    : v === "wx" ? "METAR/TAF"
    : v === "acars" ? "ACARS"
    : v === "checklists_sops" ? "Checklists & SOPs"
    : v === "audio" ? "Audio"
    : v === "settings" ? "Settings"
    : "Flight";

  const toggleStation = (sta: string) => {
    const s = new Set(openStations);
    if (s.has(sta)) s.delete(sta); else s.add(sta);
    setOpenStations(s);
  };
  const toggleType = (sta: string, type: string) => {
    const key = `${sta}|${type}`;
    const s = new Set(openTypes);
    if (s.has(key)) s.delete(key); else s.add(key);
    setOpenTypes(s);
  };
  const toggleOtherPlace = (place: string) => {
    const s = new Set(openOtherPlaces);
    if (s.has(place)) s.delete(place); else s.add(place);
    setOpenOtherPlaces(s);
  };

  /* ---------------------- Render ---------------------- */
  return (
    <Panel
      title="Main Area"
      actions={
        <nav className="flex items-center gap-2">
          {VIEWS.map((v) => {
            const active = view === v && !fading;
            return (
              <button
                key={v}
                onClick={() => changeView(v)}
                className={[
                  "text-xs px-3 py-1.5 rounded-md border transition",
                  active ? "bg-black text-white dark:bg-white dark:text-black"
                         : "bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900",
                  "border-neutral-200 dark:border-neutral-700",
                ].join(" ")}
              >
                {v === 'acars' ? (
                  <span className="inline-flex items-center gap-1">
                    <span aria-hidden>✉️</span>
                    <span>ACARS</span>
                    {acarsUnread > 0 && (
                      <span className="ml-1 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full text-[10px] font-semibold bg-red-600 text-white">
                        {acarsUnread}
                      </span>
                    )}
                  </span>
                ) : labelFor(v)}
              </button>
            );
          })}
        </nav>
      }
      className="flex-1 min-h-0"
    >
      <div className={shellClass}>
        <div className={[innerClass, "transition-opacity duration-150 relative", fading ? "opacity-0" : "opacity-100"].join(" ")}>

          {/* Flight */}
          {view === "flight" && (
            <div className="h-full overflow-auto">
              <FlightCard
                data={flight}
                loading={loadingFlight}
                error={flightError || undefined}
                vatsim={vatsim || undefined}
                className="w-full"
              />
            </div>
          )}

          {/* OFP */}
          {view === "ofp" && (
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between px-3 py-2">
                <p className="text-xs opacity-60">OFP PDF (latest{username ? ` — ${username}` : ""})</p>
                <div className="flex items-center gap-1">
                  <button onClick={zoomOut} className="text-xs px-2 py-1 rounded-md border bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700">−</button>
                  <button onClick={zoomReset} className="text-xs px-2 py-1 rounded-md border bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700">{Math.round(zoom * 100)}%</button>
                  <button onClick={zoomIn} className="text-xs px-2 py-1 rounded-md border bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700">+</button>
                  <button onClick={() => resolveLatestPdf(true)} disabled={loadingPDF} className="ml-2 text-xs px-2 py-1 rounded-md border bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700">{loadingPDF ? "Refreshing…" : "Refresh"}</button>
                </div>
              </div>
              {loadingPDF && <div className="px-3 pb-2 text-sm">Resolving PDF link…</div>}
              {pdfError && (
                <div className="px-3 pb-2 space-y-2">
                  <p className="text-red-500 text-sm">Error: {pdfError}</p>
                  <p className="text-xs opacity-70">
                    If the server can’t see your SimBrief session, click{" "}
                    <a href="https://dispatch.simbrief.com/briefing/latest" target="_blank" rel="noreferrer" className="underline">View PDF</a>{" "}
                    once to generate a public link.
                  </p>
                </div>
              )}
              <div className="flex-1 min-h-0 overflow-auto">
                {pdfUrl ? <PdfViewer key={pdfUrl + ":" + zoom} src={pdfUrl} zoom={zoom} className="h-full" style={{ width: "100%" }} /> :
                  !loadingPDF && <div className="h-full flex items-center justify-center opacity-70 text-sm">
                    {username ? "No PDF link found for the latest OFP." : "Please set your SimBrief username in Settings."}
                  </div>}
              </div>
            </div>
          )}

          {/* Map */}
          <div className={view === "map" ? "h-full relative" : "h-0"}>
            <MapPane visible={view === "map"} />
          </div>

          {/* NOTAMs */}
          {view === "notams" && (
            <div className="h-full overflow-hidden">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-full">
                <div className="lg:col-span-2 h-full overflow-auto">
              <div className="mb-3 flex items-center justify-end hidden">
                <p className="text-xs opacity-60">
                  {username ? `Source: SimBrief — ${username}` : "No SimBrief username set."}
                </p>
                <button
                  onClick={() => fetchNotams()}
                  className="text-xs px-2 py-1 rounded-md border bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700"
                >
                  Refresh
                </button>
              </div>

              {loadingNotams && <div className="text-sm">Loading NOTAMs…</div>}
              {notamError && <div className="text-sm text-red-600">{notamError}</div>}

              {!loadingNotams && !notamError && (
                <>
                  {(!notams || notams.length === 0) && (
                    <div className="text-sm opacity-70">No NOTAMs found in the OFP.</div>
                  )}

                  {/* Airport buttons (real stations) */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    {Array.from(groupedNotams.stations.keys()).map((sta) => {
                      const typeMap = groupedNotams.stations.get(sta)!;
                      const count = Array.from(typeMap.values()).reduce((s, arr) => s + arr.length, 0);
                      const active = openStations.has(sta);
                      return (
                        <button
                          key={sta}
                          onClick={() => toggleStation(sta)}
                          className={[
                            "text-sm font-medium px-4 py-2 rounded-md border transition",
                            active ? "bg-black text-white dark:bg-white dark:text-black"
                                   : "bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900",
                            "border-neutral-200 dark:border-neutral-700",
                          ].join(" ")}
                          title={`${count} NOTAM${count !== 1 ? "s" : ""}`}
                        >
                          {sta} ({count})
                        </button>
                      );
                    })}

                    {/* OTHER */}
                    {groupedNotams.otherPlaces.size > 0 && (
                      <button
                        onClick={() => toggleStation("OTHER")}
                        className={[
                          "text-sm font-medium px-4 py-2 rounded-md border transition",
                          openStations.has("OTHER") ? "bg-black text-white dark:bg-white dark:text-black"
                                                    : "bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900",
                          "border-neutral-200 dark:border-neutral-700",
                        ].join(" ")}
                      >
                        OTHER / FIR / Misc ({Array.from(groupedNotams.otherPlaces.values()).reduce((s, m) => s + Array.from(m.values()).reduce((x, a) => x + a.length, 0), 0)})
                      </button>
                    )}
                  </div>

                  {/* Expanded real stations */}
                  {Array.from(groupedNotams.stations.entries()).map(([station, typeMap]) => {
                    if (!openStations.has(station)) return null;

                    return (
                      <section key={station} className="mb-6 rounded-lg border border-neutral-200 dark:border-neutral-800">
                        <header className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60">
                          <h3 className="text-sm font-semibold">{station}</h3>
                          <p className="text-xs opacity-60">
                            {Array.from(typeMap.values()).reduce((s, arr) => s + arr.length, 0)} NOTAMs
                          </p>
                        </header>

                        {/* Type buttons */}
                        <div className="p-3 flex flex-wrap gap-2">
                          {Array.from(typeMap.entries()).map(([type, items]) => {
                            const key = `${station}|${type}`;
                            const active = openTypes.has(key);
                            return (
                              <button
                                key={key}
                                onClick={() => toggleType(station, type)}
                                className={[
                                  "text-xs px-3 py-1.5 rounded-md border transition",
                                  active ? "bg-black text-white dark:bg-white dark:text-black"
                                         : "bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900",
                                  "border-neutral-200 dark:border-neutral-700",
                                ].join(" ")}
                                title={`${items.length} NOTAM${items.length !== 1 ? "s" : ""}`}
                              >
                                {type} ({items.length})
                              </button>
                            );
                          })}
                        </div>

                        {/* Expanded lists */}
                        {Array.from(typeMap.entries()).map(([type, items]) => {
                          const key = `${station}|${type}`;
                          if (!openTypes.has(key)) return null;
                          return (
                            <div key={key} className="border-t border-neutral-200 dark:border-neutral-800">
                              <div className="px-3 py-2 bg-neutral-50/60 dark:bg-neutral-900/40">
                                <h4 className="text-xs font-semibold">{type} <span className="opacity-60 font-normal">({items.length})</span></h4>
                              </div>
                              <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
                                {items.map((n, i) => (
                                  <li key={(n.id || "") + i} className="p-3">
                                    <div className="text-xs mb-1 opacity-70">
                                      {n.id ? <span className="font-medium">{n.id}</span> : <span className="font-medium">NOTAM</span>}
                                      {n.starts || n.ends ? (
                                        <span className="ml-2">
                                          {n.starts ? `From ${n.starts}` : ""}{n.starts && n.ends ? " → " : ""}{n.ends ? `Until ${n.ends}` : ""}
                                        </span>
                                      ) : null}
                                    </div>
                                    <div className="text-sm whitespace-pre-wrap leading-relaxed">{n.text}</div>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          );
                        })}
                      </section>
                    );
                  })}

                  {/* OTHER expanded: sub-places -> types -> items */}
                  {openStations.has("OTHER") && (
                    <section className="mb-6 rounded-lg border border-neutral-200 dark:border-neutral-800">
                      <header className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60">
                        <h3 className="text-sm font-semibold">OTHER / FIR / Misc</h3>
                        <p className="text-xs opacity-60">
                          {Array.from(groupedNotams.otherPlaces.values()).reduce((s, m) => s + Array.from(m.values()).reduce((x, a) => x + a.length, 0), 0)} NOTAMs
                        </p>
                      </header>

                      {/* OTHER place buttons */}
                      <div className="p-3 flex flex-wrap gap-2">
                        {Array.from(groupedNotams.otherPlaces.entries()).map(([place, typeMap]) => {
                          const count = Array.from(typeMap.values()).reduce((s, arr) => s + arr.length, 0);
                          const active = openOtherPlaces.has(place);
                          return (
                            <button
                              key={place}
                              onClick={() => toggleOtherPlace(place)}
                              className={[
                                "text-xs px-3 py-1.5 rounded-md border transition",
                                active ? "bg-black text-white dark:bg-white dark:text-black"
                                       : "bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900",
                                "border-neutral-200 dark:border-neutral-700",
                              ].join(" ")}
                              title={`${count} NOTAM${count !== 1 ? "s" : ""}`}
                            >
                              {place} ({count})
                            </button>
                          );
                        })}
                      </div>

                      {/* Expanded OTHER sub-places */}
                      {Array.from(groupedNotams.otherPlaces.entries()).map(([place, typeMap]) => {
                        if (!openOtherPlaces.has(place)) return null;

                        return (
                          <div key={place} className="border-t border-neutral-200 dark:border-neutral-800">
                            <div className="px-3 py-2 bg-neutral-50/60 dark:bg-neutral-900/40">
                              <h4 className="text-xs font-semibold">{place}</h4>
                            </div>

                            {/* Type buttons inside this place */}
                            <div className="p-3 flex flex-wrap gap-2">
                              {Array.from(typeMap.entries()).map(([type, items]) => {
                                const key = `OTHER:${place}|${type}`;
                                const active = openTypes.has(key);
                                return (
                                  <button
                                    key={key}
                                    onClick={() => {
                                      const s = new Set(openTypes);
                                      if (s.has(key)) s.delete(key); else s.add(key);
                                      setOpenTypes(s);
                                    }}
                                    className={[
                                      "text-xs px-3 py-1.5 rounded-md border transition",
                                      active ? "bg-black text-white dark:bg-white dark:text-black"
                                             : "bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900",
                                      "border-neutral-200 dark:border-neutral-700",
                                    ].join(" ")}
                                  >
                                    {type} ({items.length})
                                  </button>
                                );
                              })}
                            </div>

                            {/* Lists */}
                            {Array.from(typeMap.entries()).map(([type, items]) => {
                              const key = `OTHER:${place}|${type}`;
                              if (!openTypes.has(key)) return null;
                              return (
                                <div key={key} className="border-t border-neutral-200 dark:border-neutral-800">
                                  <div className="px-3 py-2 bg-neutral-50/60 dark:bg-neutral-900/40">
                                    <h5 className="text-xs font-semibold">{type} <span className="opacity-60 font-normal">({items.length})</span></h5>
                                  </div>
                                  <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
                                    {items.map((n, i) => (
                                      <li key={(n.id || "") + i} className="p-3">
                                        <div className="text-xs mb-1 opacity-70">
                                          {n.id ? <span className="font-medium">{n.id}</span> : <span className="font-medium">NOTAM</span>}
                                          {n.starts || n.ends ? (
                                            <span className="ml-2">
                                              {n.starts ? `From ${n.starts}` : ""}{n.starts && n.ends ? " → " : ""}{n.ends ? `Until ${n.ends}` : ""}
                                            </span>
                                          ) : null}
                                        </div>
                                        <div className="text-sm whitespace-pre-wrap leading-relaxed">{n.text}</div>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </section>
                  )}
                </>
              )}
                </div>

                {false && (
                  <div className="lg:col-span-1 h-full overflow-auto"></div>
                )}
              </div>
            </div>
          )}

          {/* METAR & TAF */}
          {view === "wx" && (
            <div className="h-full overflow-auto">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs opacity-60">METAR & TAF</p>
                <button
                  onClick={() => void loadWx()}
                  className="text-xs px-2 py-1 rounded-md border bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700"
                >
                  Refresh
                </button>
              </div>
              {loadingWx && <div className="text-sm">Loading weather…</div>}
              {wxError && <div className="text-sm text-red-600">{wxError}</div>}
              {!loadingWx && !wxError && (
                <div className="space-y-3">
                  {(!wx || Object.keys(wx).length === 0) && (
                    <div className="text-sm opacity-70">No stations.</div>
                  )}
                  {Object.entries(wx || {}).map(([sta, r]) => (
                    <section key={sta} className="rounded-lg border border-neutral-200 dark:border-neutral-800">
                      <header className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60">
                        <h3 className="text-sm font-semibold">{sta}</h3>
                      </header>
                      <div className="p-3 space-y-2">
                        {r.metar && (
                          <div>
                            <div className="text-xs opacity-60 mb-1">METAR {r.metarTime ? `(${r.metarTime})` : ""}</div>
                            <pre className="text-xs whitespace-pre-wrap leading-snug">{r.metar}</pre>
                          </div>
                        )}
                        {r.taf && (
                          <div>
                            <div className="text-xs opacity-60 mb-1">TAF {r.tafTime ? `(${r.tafTime})` : ""}</div>
                            <pre className="text-xs whitespace-pre-wrap leading-snug">{r.taf}</pre>
                          </div>
                        )}
                        {!r.metar && !r.taf && (
                          <div className="text-xs opacity-70">No data.</div>
                        )}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ACARS */}
          {view === "acars" && (
            <div className="h-full overflow-auto">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-xs opacity-60">From: {acarsFrom || '—'} {vatsim?.online ? '(VATSIM)' : ''} · Logon: {acarsLogon || 'Not set (Settings)'}</div>
                <div className="flex gap-2">
                  <button onClick={()=> setAcarsShowComposer((v)=>!v)} className="text-xs px-2 py-1 rounded-md border bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700">{acarsShowComposer ? 'Close' : '+ New Message'}</button>
                  <button onClick={()=>void acarsLoadInbox()} className="text-xs px-2 py-1 rounded-md border bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700">Refresh Inbox</button>
                </div>
              </div>

              <div className="mb-3 flex items-center justify-end">
                <div className="flex gap-2">
                  <button onClick={()=> setAcarsShowComposer((v)=>!v)} className="text-xs px-2 py-1 rounded-md border bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700">{acarsShowComposer ? 'Close' : '+ New Message'}</button>
                </div>
              </div>

              {acarsShowComposer && (
                <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 mb-4">
                  <h3 className="text-sm font-semibold mb-2">New Message</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
                    <div className="md:col-span-2">
                      <label className="block text-xs opacity-70 mb-1">To (station/callsign)</label>
                      <input value={acarsTo} onChange={(e)=>setAcarsTo(e.target.value.toUpperCase())} className="w-full rounded-md border px-3 py-1.5 text-sm bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700" />
                    </div>
                    <div>
                      <label className="block text-xs opacity-70 mb-1">Type</label>
                      <select value={acarsType} onChange={(e)=>setAcarsType(e.target.value as any)} className="w-full rounded-md border px-3 py-1.5 text-sm bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700">
                        <option value="telex">Telex</option>
                        <option value="cpdlc">CPDLC</option>
                        <option value="position">Position</option>
                        <option value="posreq">PosReq</option>
                        <option value="ping">Ping</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-2">
                    <button onClick={useTemplatePdc} className="text-[11px] px-2 py-1 rounded-md border bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700">+ Request PDC</button>
                    <button onClick={useTemplateCpdlcLogon} className="text-[11px] px-2 py-1 rounded-md border bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700">+ CPDLC Logon</button>
                    <button onClick={useTemplatePosition} className="text-[11px] px-2 py-1 rounded-md border bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700">+ Position Report</button>
                  </div>
                  <label className="block text-xs opacity-70 mb-1">Text</label>
                  <textarea value={acarsText} onChange={(e)=>setAcarsText(e.target.value)} rows={6} className="w-full rounded-md border px-3 py-1.5 text-sm bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700 mb-2"></textarea>
                  <div className="flex items-center gap-2">
                    <button onClick={()=>void acarsSend()} disabled={acarsSending} className="text-xs px-3 py-1.5 rounded-md border bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700">{acarsSending ? 'Sending…' : 'Send'}</button>
                    {acarsError && <span className="text-xs text-red-600">{acarsError}</span>}
                  </div>
                </section>
              )}

              {!acarsShowComposer && (
              <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Inbox</h3>
                  <button onClick={()=>void acarsLoadInbox()} className="text-xs px-2 py-1 rounded-md border bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700">Refresh</button>
                </div>
                {acarsInbox.length === 0 && <div className="text-xs opacity-70">No messages.</div>}
                <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {acarsInbox.map((m, i) => (
                    <li key={i} className="py-2">
                      <div className="text-[11px] opacity-60 font-semibold">FROM: {m.from || '-'}</div>
                      <div className="text-sm whitespace-pre-wrap mt-1">{m.text}</div>
                    </li>
                  ))}
                </ul>
              </section>
              )}
            </div>
          )}
          {/* Checklists & SOPs */}
          {view === "checklists_sops" && (
            <div className="h-full overflow-auto">
              <div className="max-w-3xl mx-auto space-y-4">
                <h3 className="text-sm font-semibold">Checklists & SOPs</h3>
                <ul className="list-disc pl-5 text-sm opacity-80 space-y-1">
                  <li>Normal checklists</li>
                  <li>Abnormals & emergencies</li>
                  <li>Company/crew SOP highlights</li>
                </ul>
              </div>
            </div>
          )}

          {/* Audio */}
          {view === "audio" && <div className="h-full flex items-center justify-center opacity-70"><p>Audio — ATIS/TTS, briefings, or recorded calls.</p></div>}

          {/* Settings */}
          {view === "settings" && (
            <div className="space-y-4">
              {/* SimBrief username */}
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
                <div className="mb-2">
                  <p className="text-xs opacity-60 mb-2">SimBrief Settings</p>
                  <div className="flex gap-2 items-center">
                    <input
                      value={usernameDraft}
                      onChange={(e) => setUsernameDraft(e.target.value)}
                      placeholder="Enter SimBrief username"
                      className="flex-1 rounded-md border px-3 py-1.5 text-sm bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700"
                    />
                    <button onClick={saveUsername} className="text-xs px-3 py-1.5 rounded-md border bg-black text-white dark:bg-white dark:text-black border-neutral-200 dark:border-neutral-700">Save</button>
                    <button onClick={clearUsername} className="text-xs px-3 py-1.5 rounded-md border bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700">Clear</button>
                  </div>
                  {username && <p className="mt-1 text-xs opacity-60">Current: <span className="font-medium">{username}</span></p>}
                </div>
                <hr className="border-neutral-200 dark:border-neutral-800 my-3" />
                <p className="text-xs opacity-70">Username is stored locally. Flight summary, VATSIM status, and the OFP link are prefetched in the background.</p>
              </div>

              {/* VATSIM CID */}
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
                <div className="mb-2">
                  <p className="text-xs opacity-60 mb-2">VATSIM Settings</p>
                  <div className="flex gap-2 items-center">
                    <input
                      value={cidDraft}
                      onChange={(e) => setCidDraft(e.target.value)}
                      placeholder="Enter VATSIM CID (digits)"
                      inputMode="numeric"
                      className="flex-1 rounded-md border px-3 py-1.5 text-sm bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700"
                    />
                    <button onClick={saveCid} className="text-xs px-3 py-1.5 rounded-md border bg-black text-white dark:bg-white dark:text-black border-neutral-200 dark:border-neutral-700">Save</button>
                    <button onClick={clearCid} className="text-xs px-3 py-1.5 rounded-md border bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700">Clear</button>
                  </div>
                  {cid && <p className="mt-1 text-xs opacity-60">Current CID: <span className="font-medium">{cid}</span></p>}
                </div>
                <hr className="border-neutral-200 dark:border-neutral-800 my-3" />
                <p className="text-xs opacity-70">When online, the Flight Card mirrors VATSIM Radar fields and overrides SimBrief where possible.</p>
              </div>

              {/* Hoppie ACARS */}
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
                <div className="mb-2">
                  <p className="text-xs opacity-60 mb-2">ACARS (Hoppie) Settings</p>
                  <div className="flex gap-2 items-center">
                    <input
                      value={hoppieDraft}
                      onChange={(e) => setHoppieDraft(e.target.value)}
                      placeholder="Enter Hoppie logon code (case-sensitive)"
                      autoCapitalize="off" autoCorrect="off" spellCheck={false}
                      className="flex-1 rounded-md border px-3 py-1.5 text-sm bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700"
                    />
                  </div>
                  {hoppieDraft.trim() && hoppieDraft.trim().length < 4 && (
                    <p className="text-xs text-yellow-600 mt-1">That looks short — ensure you pasted the full logon code.</p>
                  )}
                  <p className="text-[11px] opacity-60 mt-1">
                    Learn more in Hoppie’s docs: <a href="https://www.hoppie.nl/acars/system/tech.html" target="_blank" rel="noreferrer noopener" className="underline">ACARS server API</a>
                  </p>
                  <div className="flex gap-2 items-center mt-2">
                    <button onClick={saveHoppie} className="text-xs px-3 py-1.5 rounded-md border bg-black text-white dark:bg-white dark:text-black border-neutral-200 dark:border-neutral-700">Save</button>
                    <button onClick={clearHoppie} className="text-xs px-3 py-1.5 rounded-md border bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700">Clear</button>
                  </div>
                  {hoppie && <p className="mt-1 text-xs opacity-60">Current logon: <span className="font-medium">{hoppie}</span></p>}
                </div>
                <hr className="border-neutral-200 dark:border-neutral-800 my-3" />
                <p className="text-xs opacity-70">Used for ACARS send/inbox. Case-sensitive; may include letters and digits. Stored locally on this device.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

export default MainArea;
