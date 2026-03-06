"use client";

import React, { useCallback, useEffect, useState } from "react";

function clampInt(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(v)));
}

function clampPct(v: number): number {
  return clampInt(v, 0, 100);
}

function pctToLevel(pct: number): number {
  return clampPct(pct) / 100;
}

function levelToPct(level: number): number {
  if (!Number.isFinite(level)) return 0;
  return clampPct(level * 100);
}

function summarizeErrorPayload(text: string, status: number): string {
  const trimmed = String(text || "").trim();
  if (!trimmed) return `HTTP ${status}`;

  const isHtml = /<!doctype html|<html[\s>]/i.test(trimmed);
  if (isHtml) {
    if (/error\s*1016|origin dns error/i.test(trimmed)) {
      return "Backend unavailable (Cloudflare 1016 Origin DNS error). Check backend DNS/tunnel and BACKEND_BASE_URL.";
    }
    return `Upstream returned HTML error (HTTP ${status})`;
  }

  return trimmed.replace(/\s+/g, " ").slice(0, 220);
}

async function parseJsonSafe(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: summarizeErrorPayload(text, res.status) };
  }
}

export default function AudioX32Panel() {
  const [status, setStatus] = useState<"checking" | "up" | "down">("checking");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [target, setTarget] = useState("X32 target unknown");

  const [channel, setChannel] = useState(1);
  const [channelOn, setChannelOn] = useState(true);
  const [channelFaderPct, setChannelFaderPct] = useState(75);

  const [bus, setBus] = useState(1);
  const [sendOn, setSendOn] = useState(true);
  const [sendLevelPct, setSendLevelPct] = useState(50);
  const [busOn, setBusOn] = useState(true);
  const [busFaderPct, setBusFaderPct] = useState(75);

  const [mainOn, setMainOn] = useState(true);
  const [mainFaderPct, setMainFaderPct] = useState(75);

  const refreshStatus = useCallback(
    async (showMessage = false) => {
      setStatus("checking");
      try {
        const res = await fetch("/api/audio/x32", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "status", channel, bus }),
          cache: "no-store",
        });
        const j = await parseJsonSafe(res);
        if (!res.ok || !j?.ok) throw new Error(j?.error || `HTTP ${res.status}`);

        setTarget(`${j.host}:${j.port}`);
        setChannelOn(!!j.channelOn);
        setChannelFaderPct(levelToPct(Number(j.channelFader)));
        setMainOn(!!j.mainOn);
        setMainFaderPct(levelToPct(Number(j.mainFader)));
        setSendOn(!!j.sendOn);
        setSendLevelPct(levelToPct(Number(j.sendLevel)));
        setBusOn(!!j.busOn);
        setBusFaderPct(levelToPct(Number(j.busFader)));
        setStatus("up");
        if (showMessage) setResult("X32 status refreshed");
      } catch (e: any) {
        setStatus("down");
        setResult(`Status failed: ${e?.message || String(e)}`);
      }
    },
    [channel, bus],
  );

  async function ping() {
    setStatus("checking");
    try {
      const res = await fetch("/api/audio/x32", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ping" }),
        cache: "no-store",
      });
      const j = await parseJsonSafe(res);
      if (!res.ok || !j?.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      setTarget(`${j.host}:${j.port}`);
      setStatus("up");
      setResult(j.model ? `Connected to ${j.model}` : "X32 reachable");
    } catch (e: any) {
      setStatus("down");
      setResult(`Ping failed: ${e?.message || String(e)}`);
    }
  }

  async function applyChannel(nextOn = channelOn, nextPct = channelFaderPct) {
    setBusy(true);
    try {
      const res = await fetch("/api/audio/x32", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "setChannel",
          channel,
          on: !!nextOn,
          fader: pctToLevel(nextPct),
        }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok || !j?.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      setResult(`Channel ${String(channel).padStart(2, "0")} updated`);
      await refreshStatus(false);
    } catch (e: any) {
      setResult(`Channel update failed: ${e?.message || String(e)}`);
      setStatus("down");
    } finally {
      setBusy(false);
    }
  }

  async function applyMain(nextOn = mainOn, nextPct = mainFaderPct) {
    setBusy(true);
    try {
      const res = await fetch("/api/audio/x32", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "setMain",
          mainOn: !!nextOn,
          mainFader: pctToLevel(nextPct),
        }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok || !j?.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      setResult("Main LR updated");
      await refreshStatus(false);
    } catch (e: any) {
      setResult(`Main update failed: ${e?.message || String(e)}`);
      setStatus("down");
    } finally {
      setBusy(false);
    }
  }

  async function applyBusSend(nextOn = sendOn, nextPct = sendLevelPct) {
    setBusy(true);
    try {
      const res = await fetch("/api/audio/x32", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "setBusSend",
          channel,
          bus,
          sendOn: !!nextOn,
          sendLevel: pctToLevel(nextPct),
        }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok || !j?.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      setResult(`Send Ch ${String(channel).padStart(2, "0")} -> Bus ${String(bus).padStart(2, "0")} updated`);
      await refreshStatus(false);
    } catch (e: any) {
      setResult(`Bus send update failed: ${e?.message || String(e)}`);
      setStatus("down");
    } finally {
      setBusy(false);
    }
  }

  async function applyBus(nextOn = busOn, nextPct = busFaderPct) {
    setBusy(true);
    try {
      const res = await fetch("/api/audio/x32", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "setBus",
          bus,
          busOn: !!nextOn,
          busFader: pctToLevel(nextPct),
        }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok || !j?.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      setResult(`Bus ${String(bus).padStart(2, "0")} master updated`);
      await refreshStatus(false);
    } catch (e: any) {
      setResult(`Bus master update failed: ${e?.message || String(e)}`);
      setStatus("down");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refreshStatus(false);
  }, [refreshStatus]);

  const baseButton =
    "text-xs rounded-md border px-2 py-1 bg-white/70 dark:bg-neutral-900/40 hover:bg-white dark:hover:bg-neutral-900 border-neutral-200 dark:border-neutral-700";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span
          className={[
            "px-2 py-0.5 rounded-full",
            status === "checking"
              ? "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400"
              : status === "up"
              ? "bg-green-500/20 text-green-700 dark:text-green-400"
              : "bg-red-500/20 text-red-700 dark:text-red-400",
          ].join(" ")}
        >
          {status === "checking" ? "Checking..." : status === "up" ? "X32 Online" : "X32 Offline"}
        </span>
        <span className="text-xs opacity-70">{target}</span>
        <button onClick={() => void ping()} disabled={busy} className={baseButton}>
          Ping
        </button>
        <button onClick={() => void refreshStatus(true)} disabled={busy} className={baseButton}>
          Refresh
        </button>
      </div>

      <section className="rounded-lg border border-neutral-200 dark:border-neutral-800">
        <header className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60">
          <h3 className="text-sm font-semibold">Input Channel</h3>
        </header>
        <div className="p-3 space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[12px] opacity-80">Channel</label>
            <input
              value={String(channel)}
              onChange={(e) =>
                setChannel(clampInt(Number.parseInt(e.target.value || "1", 10) || 1, 1, 32))
              }
              inputMode="numeric"
              className="w-20 rounded-md border px-2 py-1 bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700"
            />
            <button
              onClick={() => void refreshStatus(true)}
              disabled={busy}
              className={baseButton}
            >
              Load
            </button>
            <button
              onClick={() => {
                const next = !channelOn;
                setChannelOn(next);
                void applyChannel(next, channelFaderPct);
              }}
              disabled={busy}
              className={[
                "text-xs rounded-md border px-2 py-1",
                channelOn
                  ? "bg-green-500/20 text-green-700 dark:text-green-400 border-green-700/40"
                  : "bg-red-500/20 text-red-700 dark:text-red-400 border-red-700/40",
              ].join(" ")}
            >
              {channelOn ? "On" : "Off"}
            </button>
          </div>

          <div className="space-y-1">
            <label className="text-[12px] opacity-80">Fader {channelFaderPct}%</label>
            <input
              type="range"
              min={0}
              max={100}
              value={channelFaderPct}
              onChange={(e) => setChannelFaderPct(clampPct(Number(e.target.value)))}
              className="w-full"
            />
          </div>

          <button
            onClick={() => void applyChannel(channelOn, channelFaderPct)}
            disabled={busy}
            className={baseButton}
          >
            Apply Channel
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-neutral-200 dark:border-neutral-800">
        <header className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60">
          <h3 className="text-sm font-semibold">Main LR</h3>
        </header>
        <div className="p-3 space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const next = !mainOn;
                setMainOn(next);
                void applyMain(next, mainFaderPct);
              }}
              disabled={busy}
              className={[
                "text-xs rounded-md border px-2 py-1",
                mainOn
                  ? "bg-green-500/20 text-green-700 dark:text-green-400 border-green-700/40"
                  : "bg-red-500/20 text-red-700 dark:text-red-400 border-red-700/40",
              ].join(" ")}
            >
              {mainOn ? "On" : "Off"}
            </button>
          </div>

          <div className="space-y-1">
            <label className="text-[12px] opacity-80">Fader {mainFaderPct}%</label>
            <input
              type="range"
              min={0}
              max={100}
              value={mainFaderPct}
              onChange={(e) => setMainFaderPct(clampPct(Number(e.target.value)))}
              className="w-full"
            />
          </div>

          <button
            onClick={() => void applyMain(mainOn, mainFaderPct)}
            disabled={busy}
            className={baseButton}
          >
            Apply Main
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-neutral-200 dark:border-neutral-800">
        <header className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60">
          <h3 className="text-sm font-semibold">Bus Mix</h3>
        </header>
        <div className="p-3 space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[12px] opacity-80">Bus</label>
            <input
              value={String(bus)}
              onChange={(e) =>
                setBus(clampInt(Number.parseInt(e.target.value || "1", 10) || 1, 1, 16))
              }
              inputMode="numeric"
              className="w-20 rounded-md border px-2 py-1 bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700"
            />
            <button
              onClick={() => void refreshStatus(true)}
              disabled={busy}
              className={baseButton}
            >
              Load
            </button>
            <span className="text-[11px] opacity-70">
              Ch {String(channel).padStart(2, "0")} -&gt; Bus {String(bus).padStart(2, "0")}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const next = !sendOn;
                setSendOn(next);
                void applyBusSend(next, sendLevelPct);
              }}
              disabled={busy}
              className={[
                "text-xs rounded-md border px-2 py-1",
                sendOn
                  ? "bg-green-500/20 text-green-700 dark:text-green-400 border-green-700/40"
                  : "bg-red-500/20 text-red-700 dark:text-red-400 border-red-700/40",
              ].join(" ")}
            >
              {sendOn ? "Send On" : "Send Off"}
            </button>
          </div>

          <div className="space-y-1">
            <label className="text-[12px] opacity-80">Send Level {sendLevelPct}%</label>
            <input
              type="range"
              min={0}
              max={100}
              value={sendLevelPct}
              onChange={(e) => setSendLevelPct(clampPct(Number(e.target.value)))}
              className="w-full"
            />
          </div>

          <button
            onClick={() => void applyBusSend(sendOn, sendLevelPct)}
            disabled={busy}
            className={baseButton}
          >
            Apply Bus Send
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const next = !busOn;
                setBusOn(next);
                void applyBus(next, busFaderPct);
              }}
              disabled={busy}
              className={[
                "text-xs rounded-md border px-2 py-1",
                busOn
                  ? "bg-green-500/20 text-green-700 dark:text-green-400 border-green-700/40"
                  : "bg-red-500/20 text-red-700 dark:text-red-400 border-red-700/40",
              ].join(" ")}
            >
              {busOn ? "Bus On" : "Bus Off"}
            </button>
          </div>

          <div className="space-y-1">
            <label className="text-[12px] opacity-80">Bus Fader {busFaderPct}%</label>
            <input
              type="range"
              min={0}
              max={100}
              value={busFaderPct}
              onChange={(e) => setBusFaderPct(clampPct(Number(e.target.value)))}
              className="w-full"
            />
          </div>

          <button
            onClick={() => void applyBus(busOn, busFaderPct)}
            disabled={busy}
            className={baseButton}
          >
            Apply Bus Master
          </button>
        </div>
      </section>

      {result && <div className="text-[11px] opacity-70">{result}</div>}
    </div>
  );
}
