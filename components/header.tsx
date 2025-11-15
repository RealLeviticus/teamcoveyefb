"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { VatsimBadge } from "@/components/VatsimBadge";
import { PsxBadge } from "@/components/PsxBadge";
import { loadSettings, SETTINGS_UPDATE_EVENT } from "@/lib/settings";

export function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const [psxEnabled, setPsxEnabledState] = useState(false);
  const settingsOpen = pathname === "/settings";

  useEffect(() => {
    const update = () => {
      try {
        const s = loadSettings();
        setPsxEnabledState(!!s.psxEnabled);
      } catch {}
    };
    update();
    window.addEventListener(SETTINGS_UPDATE_EVENT, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(SETTINGS_UPDATE_EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, []);

  const toggleSettings = () => {
    router.push(settingsOpen ? "/" : "/settings");
  };

  return (
    <header
      className="
        fixed top-0 left-0 right-0 z-40
        flex items-center justify-between
        px-5 md:px-8 h-14
        bg-white dark:bg-black/70
        border-b border-neutral-200 dark:border-neutral-800
        text-black dark:text-white
      "
    >
      <h1 className="text-base md:text-lg font-semibold tracking-wide">
        Team Covey EFB - V0.1
      </h1>

      <div className="flex items-center gap-3">
        <VatsimBadge />
        {psxEnabled && <PsxBadge />}
        <button
          onClick={toggleSettings}
          aria-label={settingsOpen ? "Close settings" : "Open settings"}
          className="p-2 rounded-md border border-neutral-300/70 dark:border-neutral-700/70 bg-white/70 dark:bg-neutral-900/70 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        >
          <span className="inline-flex h-full w-full flex-col items-center justify-center gap-0.5">
            {settingsOpen ? (
              <>
                <span className="block h-0.5 w-4 rotate-45 origin-center bg-neutral-900 dark:bg-neutral-100" />
                <span className="block h-0.5 w-4 -rotate-45 origin-center bg-neutral-900 dark:bg-neutral-100" />
              </>
            ) : (
              <>
                <span className="block h-0.5 w-4 rounded bg-neutral-900 dark:bg-neutral-100" />
                <span className="block h-0.5 w-4 rounded bg-neutral-900 dark:bg-neutral-100" />
                <span className="block h-0.5 w-4 rounded bg-neutral-900 dark:bg-neutral-100" />
              </>
            )}
          </span>
        </button>
      </div>
    </header>
  );
}
