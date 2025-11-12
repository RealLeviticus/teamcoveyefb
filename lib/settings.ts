// lib/settings.ts
export type AppSettings = {
  vatsimCid?: string;        // numeric string
  simbriefUsername?: string; // optional centralised username
  hoppieLogon?: string;      // Hoppie ACARS logon code
  hoppieCallsign?: string;   // default ACARS callsign
};

const KEY = "dispatch.settings.v1";

// Legacy keys already used elsewhere
const LEGACY_CID_KEY = "covey_vatsim_cid";
const LEGACY_USER_KEY = "covey_simbrief_username";

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return {};
  const current = safeParse<AppSettings>(localStorage.getItem(KEY)) ?? {};

  // Migrate legacy CID if needed
  const legacyCid = localStorage.getItem(LEGACY_CID_KEY)?.trim();
  if (!current.vatsimCid && legacyCid) {
    current.vatsimCid = legacyCid;
    localStorage.setItem(KEY, JSON.stringify(current));
    // keep legacy for backward-compat, do NOT remove here
  }

  // Migrate legacy username if needed
  const legacyUser = localStorage.getItem(LEGACY_USER_KEY)?.trim();
  if (!current.simbriefUsername && legacyUser) {
    current.simbriefUsername = legacyUser;
    localStorage.setItem(KEY, JSON.stringify(current));
  }

  return current;
}

/** Overwrite central store with a merge, then persist. */
export function saveSettings(next: Partial<AppSettings>) {
  if (typeof window === "undefined") return;
  const existing = loadSettings();
  const merged: AppSettings = { ...existing, ...next };
  localStorage.setItem(KEY, JSON.stringify(merged));
  // Keep legacy keys in sync for any old code
  if ("vatsimCid" in next) {
    const v = next.vatsimCid?.trim();
    if (v) localStorage.setItem(LEGACY_CID_KEY, v);
    else localStorage.removeItem(LEGACY_CID_KEY);
  }
  if ("simbriefUsername" in next) {
    const u = next.simbriefUsername?.trim();
    if (u) localStorage.setItem(LEGACY_USER_KEY, u);
    // (we keep legacy username since other parts might read it)
  }
}

/** Convenience helpers */
export const setVatsimCid = (cid?: string) => saveSettings({ vatsimCid: cid?.trim() || undefined });
export const setSimbriefUsername = (u?: string) =>
  saveSettings({ simbriefUsername: u?.trim() || undefined });
export const setHoppieLogon = (l?: string) =>
  saveSettings({ hoppieLogon: l?.trim() || undefined });
export const setHoppieCallsign = (c?: string) =>
  saveSettings({ hoppieCallsign: c?.trim() || undefined });
