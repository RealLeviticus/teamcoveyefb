// Minimal local PSX bridge (HTTPS) for LAN use
// - Serves only PSX-related endpoints
// - CORS-allow your public frontend
// - Uses your self-signed cert (reuse cert.pem/key.pem or set paths via env)
//
// Setup:
//   npm install express cors
//   node psx-bridge/server.js
//
// Env:
//   PORT=4443
//   CERT_PATH=./cert.pem
//   KEY_PATH=./key.pem
//   ALLOW_ORIGIN=https://efb.actuallyleviticus.xyz
//   PSX_HOST=127.0.0.1
//   PSX_PORT=10747
//
// TODO: Replace stub handlers with real PSX integration.

const fs = require("fs");
const https = require("https");
const express = require("express");
const cors = require("cors");

const PORT = Number(process.env.PORT || 4443);
const CERT_PATH = process.env.CERT_PATH || "./cert.pem";
const KEY_PATH = process.env.KEY_PATH || "./key.pem";
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || "*";
const PSX_HOST = process.env.PSX_HOST || "127.0.0.1";
const PSX_PORT = Number(process.env.PSX_PORT || 10747);

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(
  cors({
    origin: ALLOW_ORIGIN === "*" ? true : ALLOW_ORIGIN.split(/[,\s]+/).filter(Boolean),
    credentials: false,
  })
);

// Health
app.get("/health", (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// Example PSX stub endpoints — replace with real calls to your PSX interface
app.get("/psx/ping", (_req, res) => {
  res.json({ ok: true, host: PSX_HOST, port: PSX_PORT });
});

app.post("/psx/doors", (req, res) => {
  // TODO: implement send to PSX
  res.status(501).json({ ok: false, error: "Not implemented" });
});

app.post("/psx/power", (req, res) => {
  // TODO: implement send to PSX
  res.status(501).json({ ok: false, error: "Not implemented" });
});

// Load certs
const cert = fs.readFileSync(CERT_PATH);
const key = fs.readFileSync(KEY_PATH);

https.createServer({ key, cert }, app).listen(PORT, () => {
  console.log(`PSX bridge listening on https://0.0.0.0:${PORT} (CORS origin: ${ALLOW_ORIGIN})`);
});
