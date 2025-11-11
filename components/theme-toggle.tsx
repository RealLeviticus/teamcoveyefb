"use client";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { theme, setTheme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null; // avoid hydration mismatch

  const active = theme === "system" ? systemTheme : theme;

  return (
    <div className="inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm">
      <span>Theme:</span>
      <button
        onClick={() => setTheme("light")}
        className={`rounded px-2 py-1 ${active === "light" ? "bg-black text-white dark:bg-white dark:text-black" : "hover:bg-neutral-100 dark:hover:bg-neutral-800"}`}
      >
        Light
      </button>
      <button
        onClick={() => setTheme("dark")}
        className={`rounded px-2 py-1 ${active === "dark" ? "bg-black text-white dark:bg-white dark:text-black" : "hover:bg-neutral-100 dark:hover:bg-neutral-800"}`}
      >
        Dark
      </button>
      <button
        onClick={() => setTheme("system")}
        className={`rounded px-2 py-1 ${theme === "system" ? "bg-black text-white dark:bg-white dark:text-black" : "hover:bg-neutral-100 dark:hover:bg-neutral-800"}`}
        title="Match OS"
      >
        System
      </button>
    </div>
  );
}
