# My Next Landing (Visual Studio friendly)

A clean Next.js 14 + Tailwind landing page with a cinematic video hero and sticky nav.
Open this folder directly in **Visual Studio** (or **VS Code**) and run:

```bash
npm install
npm run dev          # localhost only

# LAN HTTP
npm run dev:lan      # http://<your-ip>:3000

# LAN HTTPS (needed for Twitch embeds on non-localhost)
# Requires cert.pem and key.pem in project root (self-signed is fine)
npm run dev:https    # https://<your-ip>.nip.io:3000
```

### Twitch on iPad / LAN
- Twitch blocks embeds on plain HTTP when not localhost. Use the HTTPS command above and browse via `https://<your-ip>.nip.io:3000` (accept self-signed once).
- If the embed still refuses, use the “Open chat in new window” link shown in the chat panel.

Generate a quick self-signed cert (PowerShell example):
```powershell
# install mkcert (recommended) or use openssl if you prefer
# mkcert example after installation:
mkcert -install
mkcert -key-file key.pem -cert-file cert.pem "127.0.0.1" "localhost" "<your-ip>.nip.io"
```

## Replace media
- Put your background video at: `public/hero.mp4` (we intentionally do not include one here)
- Replace poster: `public/hero-poster.jpg`
- Replace split image: `public/sample-split.jpg`

## Notes
- Works great on desktop and iPadOS.
- The hero video is `muted`, `playsInline`, `autoPlay`, and `loop` for Safari compatibility.
- The header respects iOS safe areas via CSS env variables.

## Hosting plan (GitHub Pages + local PSX bridge)

GitHub Pages cannot run Next.js API routes, so use this split:

1) **Static frontend on GitHub Pages** at `https://efb.actuallyleviticus.xyz`.
	- Set DNS CNAME to the Pages hostname.
	- Build a static bundle (or migrate to a static-friendly build) and deploy to `gh-pages`.
	- Set environment: `NEXT_PUBLIC_TWITCH_PARENTS=efb.actuallyleviticus.xyz` and `NEXT_PUBLIC_API_BASE=https://<your-proxy-host>`.

2) **Cloud proxy for APIs** (e.g., Cloudflare Worker / Fly / Render microservice).
	- Re-create needed routes from `/app/api/*` (SimBrief, VATSIM, Hoppie ACARS, etc.).
	- Keep secrets on the proxy; enable CORS for `https://efb.actuallyleviticus.xyz`.

3) **Local PSX bridge** on the sim PC.
	- Small HTTPS server exposing only PSX endpoints with CORS open to `https://efb.actuallyleviticus.xyz`.
	- Use a self-signed cert installed on the tablet/desktop. Access via `https://psx.localhost:4443` or a LAN DNS name.

4) **Mixed-content/HTTPS**
	- Everything must be HTTPS (frontend, proxy, local bridge). For Twitch, ensure the parent host list includes your public domain.

If you want code scaffolding for the proxy or the local bridge, ask and we’ll add minimal Node/Express examples you can deploy.

### New scaffolds
- `proxy/express-proxy.js`: CORS-enabled HTTPS-friendly proxy for SimBrief/VATSIM, etc. (add ACARS as needed). Run with `node proxy/express-proxy.js` after `npm install express cors`.
- `psx-bridge/server.js`: Local HTTPS bridge shell for PSX; CORS open to your public site. Run with `node psx-bridge/server.js` after `npm install express cors` (reuse your `cert.pem`/`key.pem`).
