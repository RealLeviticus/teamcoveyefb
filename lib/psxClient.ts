import net from "net";

export type PsxClientOptions = {
  host?: string;
  port?: number;
  timeoutMs?: number;
};

function getOpts(overrides?: PsxClientOptions): Required<PsxClientOptions> {
  const host = overrides?.host || process.env.PSX_HOST || "127.0.0.1";
  const port = overrides?.port || Number(process.env.PSX_PORT || 10747);
  const timeoutMs = overrides?.timeoutMs || 4000;
  return { host, port, timeoutMs };
}

async function writeLine(socket: net.Socket, line: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    socket.write(line, (err) => (err ? reject(err) : resolve()));
  });
}

/**
 * Send a single PSX Q-line command, e.g. `Qi191=198123` or `Qi123=395000`.
 * Note: PSX main/boost server must be reachable on PSX_HOST:PSX_PORT.
 */
export async function sendQ(code: string, value: string, opts?: PsxClientOptions): Promise<{ ok: true } | { ok: false; error: string }> {
  const { host, port, timeoutMs } = getOpts(opts);

  const socket = new net.Socket();
  socket.setTimeout(timeoutMs);

  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("error", reject);
      socket.connect(port, host, () => {
        socket.removeListener("error", reject);
        resolve();
      });
    });

    // Basic format used by PSX for write/demand lines.
    const line = `${code}=${value}\r\n`;
    await writeLine(socket, line);

    // Best-effort graceful close.
    socket.end();
    return { ok: true } as const;
  } catch (e: any) {
    try { socket.destroy(); } catch {}
    return { ok: false, error: e?.message || String(e) } as const;
  }
}

function padHeading(headingDeg: number): string {
  const n = Math.round(((headingDeg % 360) + 360) % 360);
  return n.toString().padStart(3, "0");
}

export type PushDirection = "back" | "forward";

// Mappings derived from PSX.NET.Module.GroundServices.dll
export async function startPushback(direction: PushDirection, headingDeg: number, opts?: PsxClientOptions) {
  const dirDigit = direction === "forward" ? "2" : "1";
  const code = `${dirDigit}98${padHeading(headingDeg)}`; // e.g. 198123 (backwards) or 298123 (forwards)
  return sendQ("Qi191", code, opts);
}

export async function stopPushback(currentHeadingDeg: number, opts?: PsxClientOptions) {
  const code = `120${padHeading(currentHeadingDeg)}`; // Stop
  return sendQ("Qi191", code, opts);
}

export type Turn = "left" | "right" | "straight";

export async function updatePushbackTurn(direction: PushDirection, targetHeadingDeg: number, opts?: PsxClientOptions) {
  const dirDigit = direction === "forward" ? "2" : "1";
  const code = `${dirDigit}97${padHeading(targetHeadingDeg)}`; // maintain/adjust heading while pushing
  return sendQ("Qi191", code, opts);
}

/** Set Zero Fuel Weight. The PSX input (Qi123) expects pounds. */
export async function setZfwLbs(zfwLbs: number, opts?: PsxClientOptions) {
  const v = Math.round(zfwLbs);
  return sendQ("Qi123", String(v), opts);
}

/** Convenience: convert kilograms to pounds (rounded). */
export function kgToLbs(kg: number): number {
  return Math.round(kg * 2.2046226);
}

