"use client";

export function ReloadButton() {
  return (
    <button
      onClick={() => window.location.reload()}
      className="text-xs rounded-md border px-2 py-1
                 bg-white/70 dark:bg-neutral-900/40
                 border-neutral-200 dark:border-neutral-700
                 hover:bg-white dark:hover:bg-neutral-900"
    >
      Reload
    </button>
  );
}
