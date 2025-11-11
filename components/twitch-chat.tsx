"use client";

import { useTheme } from "next-themes";
import { memo, useEffect, useMemo, useRef, useState } from "react";

/**
 * Twitch chat that follows site theme.
 * - Remounts only when theme changes (not on other renders).
 * - No opacity transition (avoids any perceived flash).
 */
type Props = {
  channel?: string;
  className?: string;
  extraParents?: string[]; // add prod domains if needed
};

export const TwitchChat = memo(function TwitchChat({
  channel = "teamcovey",
  className,
  extraParents = [],
}: Props) {
  const { theme, systemTheme } = useTheme();
  const [host, setHost] = useState<string>("localhost");
  const [reloadIndex, setReloadIndex] = useState(0);
  const first = useRef(true);

  // Host discovery for Twitch parent requirement
  useEffect(() => {
    if (typeof window !== "undefined" && window.location?.hostname) {
      setHost(window.location.hostname);
    }
  }, []);

  // Determine current theme
  const effectiveTheme = theme === "system" ? systemTheme : theme;
  const isDark = effectiveTheme === "dark";

  // Remount ONLY on theme flips
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setReloadIndex((i) => i + 1);
  }, [isDark]);

  // Build Twitch chat URL
  const src = useMemo(() => {
    const base = `https://www.twitch.tv/embed/${encodeURIComponent(channel)}/chat`;
    const parents = [host, ...extraParents].filter(Boolean);

    const params = new URLSearchParams();
    parents.forEach((p) => params.append("parent", p));
    // For light/dark, Twitch is inconsistent; these settings cover both cases:
    if (isDark) {
      params.set("darkpopout", "true");
    } else {
      params.set("theme", "light");
    }
    // cache-bust only when we intentionally remount (theme flip)
    params.set("v", String(reloadIndex));

    return `${base}?${params.toString()}`;
  }, [channel, host, extraParents, isDark, reloadIndex]);

  return (
    <iframe
      key={`${channel}-${isDark ? "dark" : "light"}-${host}-${reloadIndex}`}
      src={src}
      title="Twitch Chat"
      className={className ?? ""}
      frameBorder={0}
      scrolling="no"
      allowFullScreen={false}
    />
  );
});
