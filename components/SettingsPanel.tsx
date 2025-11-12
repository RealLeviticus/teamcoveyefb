"use client";

import { useEffect, useState } from "react";
import { loadSettings, saveSettings, setHoppieLogon } from "@/lib/settings";

export function SettingsPanel() {
  const [cid, setCid] = useState("");
  const [hoppieLogon, setLogon] = useState("");

  useEffect(() => {
    const s = loadSettings();
    setCid(s.vatsimCid ?? "");
    setLogon(s.hoppieLogon ?? "");
  }, []);

  function onSave() {
    const cleaned = cid.trim();
    saveSettings({ vatsimCid: cleaned || undefined });
  }

  function onSaveHoppie() {
    setHoppieLogon(hoppieLogon);
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
        placeholder="e.g. ABCD"
        className="w-full rounded-lg bg-neutral-900 px-3 py-2 outline-none ring-1 ring-neutral-700"
      />
      <button
        onClick={onSaveHoppie}
        className="rounded-lg px-3 py-2 bg-blue-600 hover:bg-blue-500"
      >
        Save Hoppie Logon
      </button>
    </div>
  );
}
