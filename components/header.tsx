"use client";

import { useEffect, useState } from "react";
import { CornerToggle } from "@/components/corner-toggle";
import { VatsimBadge } from "@/components/VatsimBadge";
import { PsxBadge } from "@/components/PsxBadge";
import { loadSettings } from "@/lib/settings";

export function Header() {
  const [psxEnabled, setPsxEnabledState] = useState(false);
  useEffect(() => {
    try {
      const s = loadSettings();
      setPsxEnabledState(!!s.psxEnabled);
    } catch {}
  }, []);

  return (
    <header
      className="
        fixed top-0 left-0 right-0 z-40
        flex items-center justify-between
        px-5 md:px-8 h-14
        bg-white/80 dark:bg-black/60
        backdrop-blur border-b border-neutral-200 dark:border-neutral-800
        text-black dark:text-white
      "
    >
      <h1 className="text-base md:text-lg font-semibold tracking-wide">
        Team Covey EFB - V0.1
      </h1>

      <div className="flex items-center gap-3">
        <VatsimBadge />
        {psxEnabled && <PsxBadge />}
        <CornerToggle />
      </div>
    </header>
  );
}

