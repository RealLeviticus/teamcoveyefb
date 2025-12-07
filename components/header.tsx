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
  const [httpsNotice, setHttpsNotice] = useState<string | null>(null);
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

    // Show a small hint if running over HTTP on LAN (Twitch embeds need HTTPS unless localhost)
    const proto = window.location.protocol;
    const host = window.location.hostname;
    if (proto !== "https:" && host !== "localhost" && host !== "127.0.0.1") {
      setHttpsNotice(`For Twitch chat, use https://${host}.nip.io:3000 (HTTPS required for non-localhost).`);
    }

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
        flex flex-col gap-2
        px-5 md:px-8 py-3
        bg-white dark:bg-black/70
        border-b border-neutral-200 dark:border-neutral-800
        text-black dark:text-white
      "
    >
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-base md:text-lg font-semibold tracking-wide">
          Team Covey EFB - V0.1
        </h1>

        <div className="flex items-center gap-3">
          <VatsimBadge />
          {psxEnabled && <PsxBadge />}
          <button
            onClick={toggleSettings}
            aria-label={settingsOpen ? "Close settings" : "Open settings"}
            className="inline-flex h-10 w-10 items-center justify-center gap-1 rounded-md border border-neutral-300/70 dark:border-neutral-700/70 bg-white/80 dark:bg-neutral-900/80 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <span className="inline-flex flex-col items-center justify-center gap-1" aria-hidden>
              {settingsOpen ? (
                <>
                  <span className="block h-0.5 w-5 rotate-45 origin-center bg-neutral-900 dark:bg-neutral-100" />
                  <span className="block h-0.5 w-5 -rotate-45 origin-center bg-neutral-900 dark:bg-neutral-100" />
                </>
              ) : (
                <>
                  <span className="block h-0.5 w-5 rounded bg-neutral-900 dark:bg-neutral-100" />
                  <span className="block h-0.5 w-5 rounded bg-neutral-900 dark:bg-neutral-100" />
                  <span className="block h-0.5 w-5 rounded bg-neutral-900 dark:bg-neutral-100" />
                </>
              )}
            </span>
          </button>
        </div>
      </div>

      {httpsNotice && (
        <div className="mt-2 w-full text-[11px] md:text-xs text-yellow-900 dark:text-amber-200 bg-amber-100/90 dark:bg-amber-900/40 border border-amber-300/70 dark:border-amber-800/70 rounded-md px-3 py-2">
          {httpsNotice}
        </div>
      )}
    </header>
  );
}
