"use client";

import { useEffect, useState } from "react";
import { loadSettings } from "@/lib/settings";

export function PsxBadge() {
  const [status, setStatus] = useState<"checking"|"up"|"down">("checking");
  useEffect(() => {
    const s = loadSettings();
    const ping = async () => {
      try {
        const r = await fetch(`/api/psx/ping?host=${encodeURIComponent(s.psxHost || "127.0.0.1")}&port=${encodeURIComponent(String(s.psxPort || 10747))}`, { cache: "no-store" });
        const j = await r.json();
        setStatus(j?.ok ? "up" : "down");
      } catch { setStatus("down"); }
    };
    void ping();
    const t = setInterval(ping, 15000);
    return () => clearInterval(t);
  }, []);

  const base = "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium transition-colors ring-1";
  const variant = status === "up"
    ? "bg-green-100 text-green-700 ring-green-300/60 dark:bg-green-500/20 dark:text-green-300 dark:ring-green-400/30"
    : status === "checking"
    ? "bg-yellow-100 text-yellow-700 ring-yellow-300/60 dark:bg-yellow-500/20 dark:text-yellow-300 dark:ring-yellow-400/30"
    : "bg-red-100 text-red-700 ring-red-300/60 dark:bg-red-500/20 dark:text-red-300 dark:ring-red-400/30";

  const dot = "h-2 w-2 rounded-full " + (status === "up" ? "bg-green-500 dark:bg-green-400" : status === "checking" ? "bg-yellow-500 dark:bg-yellow-400" : "bg-red-500 dark:bg-red-400");

  return (
    <span className={`${base} ${variant}`} title={`PSX ${status}`}>
      <span className={dot} aria-hidden />
      {status === "up" ? "PSX Online" : status === "checking" ? "Checking…" : "PSX Offline"}
    </span>
  );
}
