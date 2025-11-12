"use client";

import { useEffect, useState } from "react";
import { loadSettings, saveSettings, setHoppieLogon, setGsxRemoteUrl } from "@/lib/settings";

export function SettingsPanel() {
  const [cid, setCid] = useState("");
  const [hoppieLogon, setLogon] = useState("");
  const [gsxUrl, setGsxUrl] = useState("");

  useEffect(() => {
    const s = loadSettings();
    setCid(s.vatsimCid ?? "");
    setLogon(s.hoppieLogon ?? "");
    setGsxUrl(s.gsxRemoteUrl ?? "");
  }, []);

  function onSave() {
    const cleaned = cid.trim();
    saveSettings({ vatsimCid: cleaned || undefined });
  }

  function onSaveHoppie() {
    setHoppieLogon(hoppieLogon);
  }

  function onSaveGsx() {
    const cleaned = gsxUrl.trim();
    setGsxRemoteUrl(cleaned || undefined);
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm opacity-80">VATSIM CID</label>
      <input
        value={cid}
        onChange={(e) => setCid(e.target.value)}
        placeholder="e.g. 1234567"
        className="w-full rounded-lg bg-neutral-900 px-3 py-2 outline-none ring-1 ring-neutral-700"
        inputMode="numeric"
      />
      <button
        onClick={onSave}
        className="rounded-lg px-3 py-2 bg-blue-600 hover:bg-blue-500"
      >
        Save
      </button>

      <hr className="border-neutral-200 dark:border-neutral-800 my-3" />
  <label className="block text-sm opacity-80">Hoppie Logon Code</label>
  <input
    value={hoppieLogon}
    onChange={(e) => setLogon(e.target.value)}
    placeholder="Enter Hoppie logon code (case-sensitive)"
    autoCapitalize="off" autoCorrect="off" spellCheck={false}
    className="w-full rounded-lg bg-neutral-900 px-3 py-2 outline-none ring-1 ring-neutral-700"
  />
  {hoppieLogon.trim() && hoppieLogon.trim().length < 4 && (
    <div className="text-xs text-yellow-500 mt-1">That looks short — ensure you pasted the full logon code.</div>
  )}
  <div className="text-[11px] opacity-60 mt-1">
    Learn more: <a href="https://www.hoppie.nl/acars/system/tech.html" target="_blank" rel="noreferrer noopener" className="underline">Hoppie ACARS server API</a>
  </div>
      <button
        onClick={onSaveHoppie}
        className="rounded-lg px-3 py-2 bg-blue-600 hover:bg-blue-500"
      >
        Save Hoppie Logon
      </button>

      <hr className="border-neutral-200 dark:border-neutral-800 my-3" />
      <label className="block text-sm opacity-80">GSX Remote URL</label>
      <input
        value={gsxUrl}
        onChange={(e) => setGsxUrl(e.target.value)}
        placeholder="http://127.0.0.1:8380"
        autoCapitalize="off" autoCorrect="off" spellCheck={false}
        className="w-full rounded-lg bg-neutral-900 px-3 py-2 outline-none ring-1 ring-neutral-700"
      />
      <div className="text-[11px] opacity-60 mt-1">
        If this doesn’t open, verify GSX Remote is enabled and the port matches your setup.
      </div>
      <button
        onClick={onSaveGsx}
        className="rounded-lg px-3 py-2 bg-blue-600 hover:bg-blue-500"
      >
        Save GSX URL
      </button>
    </div>
  );
}
