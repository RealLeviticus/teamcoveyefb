"use client";

import { useEffect, useState } from "react";

type AuthState =
  | { loading: true }
  | { loading: false; authenticated: false }
  | { loading: false; authenticated: true; user: { id: string; username: string; roles: string[] } };

type SetupConfig = {
  psxHost: string;
  psxPort: number;
  psxReferencesDir: string;
  x32Host: string;
  x32Port: number;
  updatedAt?: string | null;
};

export default function SetupPage() {
  const [auth, setAuth] = useState<AuthState>({ loading: true });
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [config, setConfig] = useState<SetupConfig>({
    psxHost: "127.0.0.1",
    psxPort: 10747,
    psxReferencesDir: "C:\\Users\\levis\\OneDrive\\Documents 1\\Aerowinx\\Developers",
    x32Host: "127.0.0.1",
    x32Port: 10023,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/setup/auth/me", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setAuth({ loading: false, authenticated: false });
          return;
        }
        const j = await res.json();
        if (!cancelled && j?.authenticated) {
          setAuth({
            loading: false,
            authenticated: true,
            user: {
              id: String(j.user?.id || ""),
              username: String(j.user?.username || "unknown"),
              roles: Array.isArray(j.user?.roles) ? j.user.roles : [],
            },
          });
        } else if (!cancelled) {
          setAuth({ loading: false, authenticated: false });
        }
      } catch {
        if (!cancelled) setAuth({ loading: false, authenticated: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (auth.loading || !auth.authenticated) return;
    void loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.loading, auth.authenticated]);

  async function loadConfig() {
    setLoadingConfig(true);
    setMessage("");
    try {
      const res = await fetch("/api/setup/config", { cache: "no-store" });
      const j = await res.json();
      if (!res.ok || !j?.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      setConfig({
        psxHost: String(j.config?.psxHost || "127.0.0.1"),
        psxPort: Number(j.config?.psxPort || 10747),
        psxReferencesDir: String(
          j.config?.psxReferencesDir || "C:\\Users\\levis\\OneDrive\\Documents 1\\Aerowinx\\Developers",
        ),
        x32Host: String(j.config?.x32Host || "127.0.0.1"),
        x32Port: Number(j.config?.x32Port || 10023),
        updatedAt: j.config?.updatedAt || null,
      });
    } catch (e: any) {
      setMessage(`Load failed: ${e?.message || String(e)}`);
    } finally {
      setLoadingConfig(false);
    }
  }

  async function saveConfig() {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/setup/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const j = await res.json();
      if (!res.ok || !j?.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      setMessage("Saved. Restart backend service if your launcher does not hot-reload config.");
      setConfig({
        psxHost: String(j.config?.psxHost || config.psxHost),
        psxPort: Number(j.config?.psxPort || config.psxPort),
        psxReferencesDir: String(j.config?.psxReferencesDir || config.psxReferencesDir),
        x32Host: String(j.config?.x32Host || config.x32Host),
        x32Port: Number(j.config?.x32Port || config.x32Port),
        updatedAt: j.config?.updatedAt || new Date().toISOString(),
      });
    } catch (e: any) {
      setMessage(`Save failed: ${e?.message || String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  async function testPsx() {
    setTesting(true);
    setMessage("");
    try {
      const res = await fetch("/api/setup/test-psx", { method: "POST" });
      const j = await res.json();
      if (!res.ok || !j?.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      const refsHint = j.referencesDirExists ? "found" : "not found";
      setMessage(`PSX reachable at ${j.host}:${j.port}. References folder ${refsHint}: ${j.referencesDir}`);
    } catch (e: any) {
      setMessage(`PSX test failed: ${e?.message || String(e)}`);
    } finally {
      setTesting(false);
    }
  }

  if (auth.loading) {
    return <div className="p-6 text-sm opacity-70">Checking setup authentication...</div>;
  }

  if (!auth.authenticated) {
    return (
      <div className="p-6 max-w-xl">
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 space-y-3">
          <h2 className="text-base font-semibold">Backend Setup</h2>
          <p className="text-sm opacity-80">
            Sign in with Discord to configure this backend instance. Access is restricted to allowed role IDs.
          </p>
          <a
            href="/api/setup/auth/login?next=%2Fsetup"
            className="inline-flex px-3 py-1.5 text-sm rounded-md border bg-black text-white dark:bg-white dark:text-black border-neutral-300 dark:border-neutral-700"
          >
            Sign in with Discord
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl space-y-4">
      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
        <div className="flex items-center justify-between gap-3 mb-2">
          <h2 className="text-base font-semibold">Backend Setup</h2>
          <a
            href="/api/setup/auth/logout"
            className="text-xs px-2 py-1 rounded-md border bg-white/70 dark:bg-neutral-900/40 border-neutral-200 dark:border-neutral-700"
          >
            Logout
          </a>
        </div>
        <p className="text-xs opacity-60">
          Signed in as <span className="font-medium">{auth.user.username}</span>
        </p>
      </div>

      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 space-y-3">
        <h3 className="text-sm font-semibold">PSX and Audio Connections</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="block text-xs opacity-70 mb-1">PSX Host</span>
            <input
              value={config.psxHost}
              onChange={(e) => setConfig((c) => ({ ...c, psxHost: e.target.value }))}
              className="w-full rounded-md border px-3 py-1.5 text-sm bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700"
            />
          </label>

          <label className="text-sm">
            <span className="block text-xs opacity-70 mb-1">PSX Port</span>
            <input
              value={String(config.psxPort)}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  psxPort: Number.parseInt(e.target.value || "0", 10) || 0,
                }))
              }
              inputMode="numeric"
              className="w-full rounded-md border px-3 py-1.5 text-sm bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700"
            />
          </label>

          <label className="text-sm">
            <span className="block text-xs opacity-70 mb-1">X32 Host</span>
            <input
              value={config.x32Host}
              onChange={(e) => setConfig((c) => ({ ...c, x32Host: e.target.value }))}
              className="w-full rounded-md border px-3 py-1.5 text-sm bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700"
            />
          </label>

          <label className="text-sm">
            <span className="block text-xs opacity-70 mb-1">X32 Port</span>
            <input
              value={String(config.x32Port)}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  x32Port: Number.parseInt(e.target.value || "0", 10) || 0,
                }))
              }
              inputMode="numeric"
              className="w-full rounded-md border px-3 py-1.5 text-sm bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700"
            />
          </label>
        </div>

        <label className="text-sm block">
          <span className="block text-xs opacity-70 mb-1">PSX References Folder</span>
          <input
            value={config.psxReferencesDir}
            onChange={(e) => setConfig((c) => ({ ...c, psxReferencesDir: e.target.value }))}
            className="w-full rounded-md border px-3 py-1.5 text-sm bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700"
          />
          <span className="block text-[11px] opacity-60 mt-1">
            Used for Aerowinx developer/reference files (default: C:\Users\levis\OneDrive\Documents 1\Aerowinx\Developers).
          </span>
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => void saveConfig()}
            disabled={saving || loadingConfig}
            className="text-xs px-3 py-1.5 rounded-md border bg-black text-white dark:bg-white dark:text-black border-neutral-300 dark:border-neutral-700"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            onClick={() => void testPsx()}
            disabled={testing || loadingConfig}
            className="text-xs px-3 py-1.5 rounded-md border bg-white/70 dark:bg-neutral-900/40 border-neutral-200 dark:border-neutral-700"
          >
            {testing ? "Testing..." : "Test PSX"}
          </button>
          <button
            onClick={() => void loadConfig()}
            disabled={loadingConfig}
            className="text-xs px-3 py-1.5 rounded-md border bg-white/70 dark:bg-neutral-900/40 border-neutral-200 dark:border-neutral-700"
          >
            Reload
          </button>
        </div>

        {config.updatedAt && <p className="text-xs opacity-60">Last updated: {config.updatedAt}</p>}
        {message && <p className="text-xs opacity-80">{message}</p>}
      </div>

      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
        <h3 className="text-sm font-semibold mb-2">Split Mode Notes</h3>
        <ul className="list-disc pl-5 text-xs opacity-80 space-y-1">
          <li>Set `EFB_REQUIRE_SERVICE_TOKEN=1` on this backend in production.</li>
          <li>Set the same token value in Cloudflare Pages as `BACKEND_SERVICE_TOKEN`.</li>
          <li>Keep `EFB_ALLOW_CLIENT_PSX_TARGET=0` so users cannot override host/port from the public app.</li>
          <li>Keep `EFB_ALLOW_CLIENT_X32_TARGET=0` so users cannot override mixer target from the public app.</li>
          <li>Set references folder to `C:\Users\levis\OneDrive\Documents 1\Aerowinx\Developers` unless you use another PSX docs path.</li>
        </ul>
      </div>
    </div>
  );
}
