"use client";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function CornerToggle() {
  const { theme, setTheme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const current = theme === "system" ? systemTheme : theme;
  const isDark = current === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={isDark}
      className={`
        relative flex items-center
        w-14 h-7
        rounded-full border shadow-sm backdrop-blur
        bg-neutral-200 text-black
        dark:bg-neutral-700 dark:text-white
        transition-colors duration-300
        hover:bg-neutral-300 dark:hover:bg-neutral-600
      `}
    >
      <div
        className={`
          absolute top-0.5 left-0.5
          h-6 w-6 rounded-full
          flex items-center justify-center
          bg-white dark:bg-black
          shadow-sm transition-transform duration-300
          ${isDark ? "translate-x-7" : "translate-x-0"}
        `}
      >
        {isDark ? (
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-white" fill="currentColor">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
          </svg>
        ) : (
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4 text-yellow-500 drop-shadow-[0_0_4px_rgba(255,200,0,0.7)]"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="4" fill="currentColor" />
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M4.6 19.4L6 18M18 6l1.4-1.4" />
          </svg>
        )}
      </div>
    </button>
  );
}
