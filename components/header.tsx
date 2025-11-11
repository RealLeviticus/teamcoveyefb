"use client";

import { CornerToggle } from "@/components/corner-toggle";
import { VatsimBadge } from "@/components/VatsimBadge";

export function Header() {
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
        {/* VATSIM Status Badge */}
        <VatsimBadge />

        {/* Light/Dark toggle */}
        <CornerToggle />
      </div>
    </header>
  );
}
