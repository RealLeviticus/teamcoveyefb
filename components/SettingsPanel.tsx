"use client";

import { useEffect, useState } from "react";
import { loadSettings, saveSettings } from "@/lib/settings";

export function SettingsPanel() {
  const [cid, setCid] = useState("");

  useEffect(() => {
    const s = loadSettings();
    setCid(s.vatsimCid ?? "");
  }, []);

  function onSave() {
    const cleaned = cid.trim();
    saveSettings({ vatsimCid: cleaned || undefined });
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
    </div>
  );
}
