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
  extraParents?: string[]; // add prod/LAN domains if needed
};

export const TwitchChat = memo(function TwitchChat({
  channel = "teamcovey",
  className,
  extraParents = [],
}: Props) {
  const { theme, systemTheme } = useTheme();
  const [host, setHost] = useState<string>("localhost");
  const [reloadIndex, setReloadIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [httpBlocked, setHttpBlocked] = useState(false);
  const loadTimer = useRef<NodeJS.Timeout | null>(null);
  const first = useRef(true);

  // Host discovery for Twitch parent requirement
  useEffect(() => {
    if (typeof window !== "undefined" && window.location?.hostname) {
      setHost(window.location.hostname);
      const proto = window.location.protocol;
      const hn = window.location.hostname;
      if (proto !== "https:" && hn !== "localhost" && hn !== "127.0.0.1") {
        // Twitch requires HTTPS for non-localhost parents; flag so we can guide the user.
        setHttpBlocked(true);
      }
    }
  }, []);

  // Auto-redirect LAN IP -> nip.io over HTTPS so Twitch parent validation passes
  useEffect(() => {
    if (typeof window === "undefined") return;
    const proto = window.location.protocol;
    const hn = window.location.hostname;
    const port = window.location.port ? `:${window.location.port}` : "";
    const isLanIp = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hn);
    if (proto === "https:" && isLanIp && !hn.endsWith(".nip.io")) {
      const target = `${proto}//${hn}.nip.io${port}${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.location.replace(target);
    }
  }, []);

  // Start/clear fallback timer if iframe never signals load
  useEffect(() => {
    if (httpBlocked || failed || loaded) {
      if (loadTimer.current) {
        clearTimeout(loadTimer.current);
        loadTimer.current = null;
      }
      return;
    }
    if (!loadTimer.current) {
      loadTimer.current = setTimeout(() => setFailed(true), 6000);
    }
    return () => {
      if (loadTimer.current) {
        clearTimeout(loadTimer.current);
        loadTimer.current = null;
      }
    };
  }, [httpBlocked, failed, loaded]);

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
    const hostNoPort = host.split(":")[0] || host;
    const isLanIp = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostNoPort);
    const lanAlias = isLanIp ? `${hostNoPort}.nip.io` : null; // nip.io resolves to the same IP

    const base = `https://www.twitch.tv/embed/${encodeURIComponent(channel)}/chat`;
    const envParents =
      (process.env.NEXT_PUBLIC_TWITCH_PARENTS || "")
        .split(/[\,\s]+/)
        .map((p) => p.trim())
        .filter(Boolean) || [];
    const parents = [hostNoPort, host, lanAlias, isLanIp ? hostNoPort : null, "localhost", "127.0.0.1", ...envParents, ...extraParents]
      .map((p) => (p || "").replace(/^https?:\/\//, ""))
      .filter(Boolean);

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
    <div className="relative h-full w-full">
      {!httpBlocked && (
        <iframe
          key={`${channel}-${isDark ? "dark" : "light"}-${host}-${reloadIndex}`}
          src={src}
          title="Twitch Chat"
          className={className ?? ""}
          frameBorder={0}
          scrolling="no"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen"
          allowFullScreen
          onLoad={() => {
            setLoaded(true);
            setFailed(false);
            if (loadTimer.current) {
              clearTimeout(loadTimer.current);
              loadTimer.current = null;
            }
          }}
          onError={() => {
            setFailed(true);
            setLoaded(false);
          }}
        />
      )}

      {(httpBlocked || failed) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 text-white text-sm px-4 text-center">
          <p className="font-semibold">Twitch chat is blocked on this connection.</p>
          <div className="text-xs opacity-80 space-y-2">
            <p>Twitch requires HTTPS for non-localhost embeds.</p>
            <p>
              Try: <code className="px-1 py-0.5 bg-white/10 rounded">https://{host.split(":")[0]}.nip.io:3000</code>
            </p>
          </div>
          <a
            href={`https://www.twitch.tv/popout/${encodeURIComponent(channel)}/chat?popout=`}
            target="_blank"
            rel="noreferrer noopener"
            className="px-3 py-1.5 rounded-md bg-white text-black text-xs font-semibold"
          >
            Open chat in new window
          </a>
        </div>
      )}
    </div>
  );
});
