import { ReactNode } from "react";

type PanelProps = {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * Theme-aware panel with header and rounded corners.
 * The content area is set to h-full so parents can make Panels fill vertically.
 */
export function Panel({ title, actions, children, className = "" }: PanelProps) {
  return (
    <section
      className={[
        "rounded-xl border shadow-sm backdrop-blur",
        "bg-white/80 text-black",
        "dark:bg-neutral-900/70 dark:text-white",
        "border-neutral-200 dark:border-neutral-800",
        "min-h-0", // allow children to shrink in flex layouts
        className,
      ].join(" ")}
    >
      <header
        className={[
          "flex items-center justify-between rounded-t-xl",
          "px-3.5 py-2.5",
          "bg-neutral-100/80 dark:bg-neutral-800/60",
          "border-b border-neutral-200 dark:border-neutral-800",
          "shrink-0",
        ].join(" ")}
      >
        <h3 className="text-[13px] font-semibold tracking-wide">{title}</h3>
        {actions}
      </header>

      <div className="p-3 rounded-b-xl h-[calc(100%-2.75rem)] min-h-0">
        {/* h-[calc(100%-header)] keeps content filling the rest; min-h-0 allows overflow-hidden parents */}
        {children}
      </div>
    </section>
  );
}
