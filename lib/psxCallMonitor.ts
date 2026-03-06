import net from "node:net";
import { readBackendConfig, resolvePsxTarget, type CallButton } from "@/lib/backendConfig";

type CallDispatchResult =
  | { ok: true; provider: string; providerId?: string; to: string }
  | { ok: false; error: string; to?: string };

type MonitorEvent = {
  ts: string;
  source: "psx" | "simulate";
  code: number;
  button: CallButton | null;
  routedTo: string | null;
  ok: boolean;
  provider?: string;
  providerId?: string;
  note?: string;
};

type MonitorStatus = {
  enabled: boolean;
  started: boolean;
  connected: boolean;
  targetHost: string;
  targetPort: number;
  reconnecting: boolean;
  lastConnectAt: string | null;
  lastDisconnectAt: string | null;
  lastError: string | null;
  lastEvent: MonitorEvent | null;
  recentEvents: MonitorEvent[];
  routes: Partial<Record<CallButton, string>>;
};

const DEFAULT_BUTTON_CODES: Record<CallButton, number> = {
  "1": 0,
  "2": 1,
  "3": 2,
  "4": 3,
  "5": 4,
  "6": 5,
  P: 6,
};

const BUTTONS: CallButton[] = ["1", "2", "3", "4", "5", "6", "P"];

let started = false;
let connected = false;
let reconnecting = false;
let reconnectTimer: NodeJS.Timeout | null = null;
let socket: net.Socket | null = null;
let dataBuffer = "";
let lastError: string | null = null;
let lastConnectAt: string | null = null;
let lastDisconnectAt: string | null = null;
const recentEvents: MonitorEvent[] = [];
let lastEvent: MonitorEvent | null = null;
const lastTriggeredAtMs: Partial<Record<CallButton, number>> = {};

function boolEnv(name: string, defaultValue: boolean): boolean {
  const raw = String(process.env[name] || "").trim().toLowerCase();
  if (!raw) return defaultValue;
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return true;
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  return defaultValue;
}

function nowIso(): string {
  return new Date().toISOString();
}

function enabled(): boolean {
  return boolEnv("EFB_CALL_MONITOR_ENABLED", true);
}

function cooldownSeconds(): number {
  const raw = Number(String(process.env.EFB_CALL_COOLDOWN_SECONDS || "").trim());
  if (Number.isFinite(raw) && raw >= 0) return Math.min(600, Math.max(0, Math.round(raw)));
  return 20;
}

function reconnectDelayMs(): number {
  return 3000;
}

function callProvider(): "twilio" | "webhook" {
  const raw = String(process.env.EFB_CALL_PROVIDER || "").trim().toLowerCase();
  if (raw === "webhook") return "webhook";
  return "twilio";
}

function resolveButtonFromCode(code: number): CallButton | null {
  for (const button of BUTTONS) {
    const envKey = button === "P" ? "EFB_CALL_PANEL_CODE_P" : `EFB_CALL_PANEL_CODE_${button}`;
    const raw = String(process.env[envKey] || "").trim();
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    const resolved = Number.isFinite(parsed) ? parsed : DEFAULT_BUTTON_CODES[button];
    if (resolved === code) return button;
  }
  return null;
}

function resolveCodeForButton(button: CallButton): number {
  const envKey = button === "P" ? "EFB_CALL_PANEL_CODE_P" : `EFB_CALL_PANEL_CODE_${button}`;
  const raw = String(process.env[envKey] || "").trim();
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) ? parsed : DEFAULT_BUTTON_CODES[button];
}

function normalizePhone(raw: string): string | null {
  const value = String(raw || "").trim();
  if (!value) return null;

  if (value.startsWith("+")) {
    const digits = value.slice(1).replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) return null;
    return `+${digits}`;
  }

  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0") && digits.length === 10) {
    return `+61${digits.slice(1)}`;
  }
  if (digits.startsWith("61") && digits.length >= 9) {
    return `+${digits}`;
  }
  if (digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }
  return null;
}

function resolveCallRoutes(): Partial<Record<CallButton, string>> {
  const cfg = readBackendConfig();
  const out: Partial<Record<CallButton, string>> = {};

  for (const button of BUTTONS) {
    const envKey = button === "P" ? "EFB_CALL_ROUTE_P" : `EFB_CALL_ROUTE_${button}`;
    const envValue = String(process.env[envKey] || "").trim();
    const cfgValue = String(cfg.callRoutes?.[button] || "").trim();
    const selected = envValue || cfgValue;
    if (selected) out[button] = selected;
  }

  if (!out.P) out.P = "0401 495 110";

  return out;
}

function pushEvent(event: MonitorEvent) {
  lastEvent = event;
  recentEvents.unshift(event);
  while (recentEvents.length > 20) recentEvents.pop();
}

async function dispatchViaTwilio(button: CallButton, to: string): Promise<CallDispatchResult> {
  const sid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const token = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  const from = String(process.env.TWILIO_FROM_NUMBER || "").trim();
  if (!sid || !token || !from) {
    return {
      ok: false,
      error: "Twilio not configured (need TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER)",
    };
  }

  const twiml =
    String(process.env.EFB_CALL_TWIML || "").trim() ||
    `<Response><Say>Team Covey call panel button ${button} pressed.</Say></Response>`;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Calls.json`;
  const form = new URLSearchParams();
  form.set("To", to);
  form.set("From", from);
  form.set("Twiml", twiml);

  const auth = Buffer.from(`${sid}:${token}`, "utf8").toString("base64");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: form.toString(),
    cache: "no-store",
  });

  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {}

  if (!res.ok) {
    return {
      ok: false,
      error:
        String(parsed?.message || "").trim() ||
        `Twilio call failed (${res.status}): ${text.slice(0, 200)}`,
      to,
    };
  }

  return {
    ok: true,
    provider: "twilio",
    providerId: String(parsed?.sid || ""),
    to,
  };
}

async function dispatchViaWebhook(button: CallButton, to: string): Promise<CallDispatchResult> {
  const url = String(process.env.EFB_CALL_WEBHOOK_URL || "").trim();
  if (!url) return { ok: false, error: "Webhook provider selected but EFB_CALL_WEBHOOK_URL is missing" };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "psx_call_button", button, to, ts: nowIso() }),
    cache: "no-store",
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    return { ok: false, error: `Webhook call failed (${res.status}): ${txt.slice(0, 200)}`, to };
  }
  return { ok: true, provider: "webhook", to };
}

async function dispatchCall(button: CallButton, to: string): Promise<CallDispatchResult> {
  const provider = callProvider();
  if (provider === "webhook") return dispatchViaWebhook(button, to);
  return dispatchViaTwilio(button, to);
}

async function handleButtonPress(code: number, source: "psx" | "simulate") {
  const button = resolveButtonFromCode(code);
  if (!button) {
    pushEvent({
      ts: nowIso(),
      source,
      code,
      button: null,
      routedTo: null,
      ok: false,
      note: `Unknown call panel code ${code}`,
    });
    return;
  }

  const cooldownMs = cooldownSeconds() * 1000;
  const now = Date.now();
  const last = lastTriggeredAtMs[button] || 0;
  if (cooldownMs > 0 && now - last < cooldownMs) {
    pushEvent({
      ts: nowIso(),
      source,
      code,
      button,
      routedTo: null,
      ok: false,
      note: `Cooldown active (${button})`,
    });
    return;
  }

  const route = resolveCallRoutes()[button];
  if (!route) {
    pushEvent({
      ts: nowIso(),
      source,
      code,
      button,
      routedTo: null,
      ok: false,
      note: `No route for button ${button}`,
    });
    return;
  }

  const normalized = normalizePhone(route);
  if (!normalized) {
    pushEvent({
      ts: nowIso(),
      source,
      code,
      button,
      routedTo: route,
      ok: false,
      note: `Invalid phone number for button ${button}: ${route}`,
    });
    return;
  }

  lastTriggeredAtMs[button] = now;
  let sent: CallDispatchResult;
  try {
    sent = await dispatchCall(button, normalized);
  } catch (err: any) {
    const msg = err?.message || String(err);
    lastError = msg;
    pushEvent({
      ts: nowIso(),
      source,
      code,
      button,
      routedTo: normalized,
      ok: false,
      note: `Dispatch error: ${msg}`,
    });
    return;
  }
  if (!sent.ok) {
    lastError = sent.error;
    pushEvent({
      ts: nowIso(),
      source,
      code,
      button,
      routedTo: normalized,
      ok: false,
      note: sent.error,
    });
    return;
  }

  pushEvent({
    ts: nowIso(),
    source,
    code,
    button,
    routedTo: normalized,
    ok: true,
    provider: sent.provider,
    providerId: sent.providerId,
  });
}

function onData(chunk: Buffer) {
  dataBuffer += chunk.toString("utf8");
  while (true) {
    const idx = dataBuffer.indexOf("\n");
    if (idx < 0) break;
    const line = dataBuffer.slice(0, idx).replace(/\r/g, "").trim();
    dataBuffer = dataBuffer.slice(idx + 1);
    if (!line) continue;
    const match = /^Qh413=(-?\d+)$/.exec(line);
    if (!match) continue;
    const code = Number.parseInt(match[1], 10);
    if (!Number.isFinite(code) || code < 0) continue; // ignore release or invalid
    void handleButtonPress(code, "psx");
  }
}

function scheduleReconnect() {
  if (!started || !enabled()) return;
  if (reconnectTimer) return;
  reconnecting = true;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnecting = false;
    connect();
  }, reconnectDelayMs());
}

function connect() {
  if (!started || !enabled()) return;
  if (socket) {
    try {
      socket.destroy();
    } catch {}
    socket = null;
  }

  const { host, port } = resolvePsxTarget();
  const s = new net.Socket();
  socket = s;
  s.setKeepAlive(true);
  s.setNoDelay(true);
  s.setTimeout(0);

  s.on("connect", () => {
    connected = true;
    lastConnectAt = nowIso();
    lastError = null;
    dataBuffer = "";
    try {
      // Request PSX variable stream updates on this socket.
      s.write("bang\r\n", "utf8");
    } catch (err: any) {
      lastError = err?.message || String(err);
    }
  });

  s.on("data", onData);

  s.on("error", (err) => {
    connected = false;
    lastDisconnectAt = nowIso();
    lastError = err?.message || String(err);
  });

  s.on("close", () => {
    connected = false;
    lastDisconnectAt = nowIso();
    scheduleReconnect();
  });

  try {
    s.connect(port, host);
  } catch (err: any) {
    connected = false;
    lastDisconnectAt = nowIso();
    lastError = err?.message || String(err);
    scheduleReconnect();
  }
}

export function startPsxCallMonitor(): MonitorStatus {
  if (!enabled()) {
    return getPsxCallMonitorStatus();
  }
  if (!started) {
    started = true;
    connect();
  }
  return getPsxCallMonitorStatus();
}

export function getPsxCallMonitorStatus(): MonitorStatus {
  const { host, port } = resolvePsxTarget();
  return {
    enabled: enabled(),
    started,
    connected,
    targetHost: host,
    targetPort: port,
    reconnecting,
    lastConnectAt,
    lastDisconnectAt,
    lastError,
    lastEvent,
    recentEvents: [...recentEvents],
    routes: resolveCallRoutes(),
  };
}

export async function simulatePsxCallButton(button: CallButton): Promise<MonitorEvent> {
  const code = resolveCodeForButton(button);
  await handleButtonPress(code, "simulate");
  return (
    lastEvent || {
      ts: nowIso(),
      source: "simulate",
      code,
      button,
      routedTo: null,
      ok: false,
      note: "Simulation failed",
    }
  );
}
