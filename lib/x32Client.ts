import dgram from "node:dgram";
import { resolveX32Target } from "@/lib/backendConfig";

export type X32ClientOptions = {
  host?: string;
  port?: number;
  timeoutMs?: number;
};

export type X32SendResult =
  | { ok: true; host: string; port: number }
  | { ok: false; host: string; port: number; error: string };

export type X32QueryResult =
  | { ok: true; host: string; port: number; address: string; args: Array<string | number | boolean> }
  | { ok: false; host: string; port: number; error: string };

type OscArg = string | number | boolean;

function getOpts(overrides?: X32ClientOptions): Required<X32ClientOptions> {
  const target = resolveX32Target({ host: overrides?.host, port: overrides?.port });
  const host = target.host;
  const port = target.port;
  const timeoutMs = overrides?.timeoutMs ?? 1200;
  return { host, port, timeoutMs };
}

function pad4(len: number): number {
  return (4 - (len % 4)) % 4;
}

function encodeOscString(value: string): Buffer {
  const raw = Buffer.from(value, "utf8");
  const total = raw.length + 1 + pad4(raw.length + 1);
  const out = Buffer.alloc(total);
  raw.copy(out, 0);
  out[raw.length] = 0;
  return out;
}

function readOscString(buf: Buffer, offset: number): { value: string; next: number } | null {
  if (offset < 0 || offset >= buf.length) return null;
  let end = offset;
  while (end < buf.length && buf[end] !== 0) end++;
  if (end >= buf.length) return null;
  const value = buf.toString("utf8", offset, end);
  let next = end + 1;
  while (next % 4 !== 0) next++;
  if (next > buf.length) return null;
  return { value, next };
}

function encodeOscArg(value: OscArg): { tag: string; bytes: Buffer } {
  if (typeof value === "string") {
    return { tag: "s", bytes: encodeOscString(value) };
  }
  if (typeof value === "boolean") {
    return { tag: value ? "T" : "F", bytes: Buffer.alloc(0) };
  }
  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      const b = Buffer.alloc(4);
      b.writeInt32BE(value, 0);
      return { tag: "i", bytes: b };
    }
    const b = Buffer.alloc(4);
    b.writeFloatBE(value, 0);
    return { tag: "f", bytes: b };
  }
  throw new Error(`Unsupported OSC arg type: ${typeof value}`);
}

function encodeOscMessage(address: string, args: OscArg[] = []): Buffer {
  const parts: Buffer[] = [encodeOscString(address)];
  let tags = ",";
  const argBytes: Buffer[] = [];
  for (const arg of args) {
    const encoded = encodeOscArg(arg);
    tags += encoded.tag;
    if (encoded.bytes.length > 0) argBytes.push(encoded.bytes);
  }
  parts.push(encodeOscString(tags), ...argBytes);
  return Buffer.concat(parts);
}

function decodeOscMessage(buf: Buffer): { address: string; args: Array<string | number | boolean> } | null {
  const address = readOscString(buf, 0);
  if (!address || !address.value.startsWith("/")) return null;
  const typetags = readOscString(buf, address.next);
  if (!typetags || !typetags.value.startsWith(",")) return null;

  let offset = typetags.next;
  const args: Array<string | number | boolean> = [];
  for (const tag of typetags.value.slice(1)) {
    if (tag === "i") {
      if (offset + 4 > buf.length) return null;
      args.push(buf.readInt32BE(offset));
      offset += 4;
      continue;
    }
    if (tag === "f") {
      if (offset + 4 > buf.length) return null;
      args.push(buf.readFloatBE(offset));
      offset += 4;
      continue;
    }
    if (tag === "s") {
      const str = readOscString(buf, offset);
      if (!str) return null;
      args.push(str.value);
      offset = str.next;
      continue;
    }
    if (tag === "T") {
      args.push(true);
      continue;
    }
    if (tag === "F") {
      args.push(false);
      continue;
    }
    // Unsupported OSC type in this minimal decoder.
    return null;
  }
  return { address: address.value, args };
}

export async function sendX32(address: string, args: OscArg[] = [], overrides?: X32ClientOptions): Promise<X32SendResult> {
  const { host, port } = getOpts(overrides);
  const socket = dgram.createSocket("udp4");
  const packet = encodeOscMessage(address, args);

  return new Promise((resolve) => {
    let done = false;
    const finish = (result: X32SendResult) => {
      if (done) return;
      done = true;
      try {
        socket.close();
      } catch {}
      resolve(result);
    };

    socket.once("error", (err) => {
      finish({ ok: false, host, port, error: err.message || String(err) });
    });

    socket.send(packet, port, host, (err) => {
      if (err) {
        finish({ ok: false, host, port, error: err.message || String(err) });
        return;
      }
      finish({ ok: true, host, port });
    });
  });
}

export async function queryX32(address: string, overrides?: X32ClientOptions): Promise<X32QueryResult> {
  const { host, port, timeoutMs } = getOpts(overrides);
  const socket = dgram.createSocket("udp4");
  const packet = encodeOscMessage(address, []);

  return new Promise((resolve) => {
    let done = false;
    let timeout: NodeJS.Timeout | null = null;

    const finish = (result: X32QueryResult) => {
      if (done) return;
      done = true;
      if (timeout) clearTimeout(timeout);
      try {
        socket.close();
      } catch {}
      resolve(result);
    };

    socket.once("error", (err) => {
      finish({ ok: false, host, port, error: err.message || String(err) });
    });

    socket.on("message", (msg) => {
      const decoded = decodeOscMessage(msg);
      if (!decoded) {
        finish({ ok: false, host, port, error: "Received invalid OSC response" });
        return;
      }
      finish({
        ok: true,
        host,
        port,
        address: decoded.address,
        args: decoded.args,
      });
    });

    timeout = setTimeout(() => {
      finish({
        ok: false,
        host,
        port,
        error: `Timeout waiting for OSC reply from ${host}:${port}`,
      });
    }, Math.max(100, Math.min(5000, Math.round(timeoutMs))));

    socket.bind(0, () => {
      socket.send(packet, port, host, (err) => {
        if (err) {
          finish({ ok: false, host, port, error: err.message || String(err) });
        }
      });
    });
  });
}

