// Minimal Express proxy for GitHub Pages deployment
// - Keeps secrets off the frontend
// - Enables CORS for your public site
// - Replace or extend routes as needed
//
// Setup:
//   npm install express cors
//   node proxy/express-proxy.js
//
// Env:
//   PORT=8788
//   ALLOW_ORIGIN=https://efb.actuallyleviticus.xyz
//   HOPPIE_LOGON=... (if you forward ACARS)
//
// NOTE: This is a starting point. Add auth/rate-limits as appropriate.

const express = require("express");
const cors = require("cors");

const PORT = process.env.PORT || 8788;
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || "*";

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

// VATSIM data passthrough
app.get("/vatsim/data", async (_req, res) => {
  try {
    const r = await fetch("https://data.vatsim.net/v3/vatsim-data.json", { cache: "no-store" });
    if (!r.ok) return res.status(r.status).send(await r.text());
    res.type("application/json").send(await r.text());
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// SimBrief summary passthrough
app.get("/simbrief/summary", async (req, res) => {
  const username = (req.query.username || "").toString().trim();
  if (!username) return res.status(400).json({ ok: false, error: "username required" });
  const url = `https://www.simbrief.com/api/xml.fetcher.php?username=${encodeURIComponent(username)}`;
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return res.status(r.status).send(await r.text());
    res.type("application/xml").send(await r.text());
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// TODO: Add ACARS/Hoppie routes here if needed; keep secrets server-side.
// app.post("/acars/send", ...)

app.listen(PORT, () => {
  console.log(`Proxy listening on http://0.0.0.0:${PORT} (CORS origin: ${ALLOW_ORIGIN})`);
});
