"use client";

import React, { useEffect, useState } from "react";
import { Panel } from "@/components/panel";
import { loadSettings, setSimbriefUsername, setVatsimCid, setHoppieLogon, setPsxEnabled } from "@/lib/settings";

export default function SettingsPage() {
  const [username, setUsername] = useState("");
  const [usernameDraft, setUsernameDraft] = useState("");
  const [cid, setCid] = useState("");
  const [cidDraft, setCidDraft] = useState("");
  const [hoppie, setHoppie] = useState("");
  const [hoppieDraft, setHoppieDraft] = useState("");
  const [psxEnabled, setPsxEnabledState] = useState(false);

  useEffect(() => {
    try {
      const s = loadSettings();
      if (s.simbriefUsername) { setUsername(s.simbriefUsername); setUsernameDraft(s.simbriefUsername); }
      if (s.vatsimCid) { setCid(s.vatsimCid); setCidDraft(s.vatsimCid); }
      if (s.hoppieLogon) { setHoppie(s.hoppieLogon); setHoppieDraft(s.hoppieLogon); }
      if (typeof s.psxEnabled === "boolean") setPsxEnabledState(!!s.psxEnabled);
    } catch {}
  }, []);

  const saveUsername = () => {
    const trimmed = usernameDraft.trim();
    setSimbriefUsername(trimmed || undefined);
    setUsername(trimmed);
  };

  const clearUsername = () => {
    setSimbriefUsername(undefined);
    setUsername("");
    setUsernameDraft("");
  };

  const saveCid = () => {
    const cleaned = cidDraft.trim();
    setVatsimCid(cleaned || undefined);
    setCid(cleaned);
  };

  const clearCid = () => {
    setVatsimCid(undefined);
    setCid("");
    setCidDraft("");
  };

  const saveHoppie = () => {
    const code = hoppieDraft.trim();
    setHoppieLogon(code || undefined);
    setHoppie(code);
  };

  const clearHoppie = () => {
    setHoppieLogon(undefined);
    setHoppie("");
    setHoppieDraft("");
  };

  const togglePsx = () => {
    const next = !psxEnabled;
    setPsxEnabled(next);
    setPsxEnabledState(next);
  };

  return (
    <div className="h-full p-4">
      <Panel title="Settings">
        <div className="space-y-4">
          {/* PSX */}
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
            <p className="text-xs opacity-60 mb-2">PSX Integration</p>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={psxEnabled}
                onChange={togglePsx}
              />
              <span>Enable PSX controls and doors view</span>
            </label>
          </div>

          {/* SimBrief */}
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
                <button
                  onClick={saveUsername}
                  className="text-xs px-3 py-1.5 rounded-md border bg-black text-white dark:bg-white dark:text-black border-neutral-200 dark:border-neutral-700"
                >
                  Save
                </button>
                <button
                  onClick={clearUsername}
                  className="text-xs px-3 py-1.5 rounded-md border bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700"
                >
                  Clear
                </button>
              </div>
              {username && (
                <p className="mt-1 text-xs opacity-60">
                  Current: <span className="font-medium">{username}</span>
                </p>
              )}
            </div>
            <hr className="border-neutral-200 dark:border-neutral-800 my-3" />
            <p className="text-xs opacity-70">
              Username is stored locally. Flight summary, VATSIM status, and the OFP link are prefetched in the background.
            </p>
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
                <button
                  onClick={saveCid}
                  className="text-xs px-3 py-1.5 rounded-md border bg-black text-white dark:bg-white dark:text-black border-neutral-200 dark:border-neutral-700"
                >
                  Save
                </button>
                <button
                  onClick={clearCid}
                  className="text-xs px-3 py-1.5 rounded-md border bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700"
                >
                  Clear
                </button>
              </div>
              {cid && (
                <p className="mt-1 text-xs opacity-60">
                  Current CID: <span className="font-medium">{cid}</span>
                </p>
              )}
            </div>
            <hr className="border-neutral-200 dark:border-neutral-800 my-3" />
            <p className="text-xs opacity-70">
              When online, the Flight Card mirrors VATSIM Radar fields and overrides SimBrief where possible.
            </p>
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
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className="flex-1 rounded-md border px-3 py-1.5 text-sm bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700"
                />
              </div>
              {hoppieDraft.trim() && hoppieDraft.trim().length < 4 && (
                <p className="text-xs text-yellow-600 mt-1">
                  That looks short – ensure you pasted the full logon code.
                </p>
              )}
              <p className="text-[11px] opacity-60 mt-1">
                Learn more in Hoppie’s docs:{" "}
                <a
                  href="https://www.hoppie.nl/acars/system/tech.html"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline"
                >
                  ACARS server API
                </a>
              </p>
              <div className="flex gap-2 items-center mt-2">
                <button
                  onClick={saveHoppie}
                  className="text-xs px-3 py-1.5 rounded-md border bg-black text-white dark:bg-white dark:text-black border-neutral-200 dark:border-neutral-700"
                >
                  Save
                </button>
                <button
                  onClick={clearHoppie}
                  className="text-xs px-3 py-1.5 rounded-md border bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700"
                >
                  Clear
                </button>
              </div>
              {hoppie && (
                <p className="mt-1 text-xs opacity-60">
                  Current logon: <span className="font-medium">{hoppie}</span>
                </p>
              )}
            </div>
            <hr className="border-neutral-200 dark:border-neutral-800 my-3" />
            <p className="text-xs opacity-70">
              Used for ACARS send/inbox. Case-sensitive; may include letters and digits. Stored locally on this device.
            </p>
          </div>
        </div>
      </Panel>
    </div>
  );
}
