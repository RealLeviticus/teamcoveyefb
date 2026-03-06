# Backend (PSX PC)

Use the existing Next.js app in this repository as the backend API service on the PC that can reach PSX.

## 1) Prepare backend env

```powershell
copy backend\.env.backend.example .env.backend
```

Set these values:
- `EFB_REQUIRE_SERVICE_TOKEN=1`
- `EFB_SERVICE_TOKEN=...` (must match Cloudflare `BACKEND_SERVICE_TOKEN`)
- `EFB_ALLOW_CLIENT_PSX_TARGET=0`
- `EFB_ALLOW_CLIENT_X32_TARGET=0`
- `SETUP_DISCORD_*`, `SETUP_ALLOWED_ROLE_IDS`, `SETUP_SESSION_SECRET`
- `SETUP_BASE_URL=https://backend-api.teamcovey.org`
- `PSX_REFERENCES_DIR=C:\Users\levis\OneDrive\Documents 1\Aerowinx\Developers` (or your preferred path)
- `X32_HOST=127.0.0.1` (or your mixer IP)
- `X32_PORT=10023`
- `EFB_CALL_MONITOR_ENABLED=1`
- `EFB_CALL_PROVIDER=twilio` (or `webhook`)
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` (when using Twilio)
- Optional button code overrides: `EFB_CALL_PANEL_CODE_1..6` and `EFB_CALL_PANEL_CODE_P`

## 2) Install and run

```powershell
npm ci
npm run build
npm run start
```

By default the backend serves on `http://0.0.0.0:3000`.

## 2b) Build a backend Windows installer (.exe)

From repo root:

```powershell
npm ci
npm run dist:backend
```

The installer is generated in `dist-backend/` as:
- `TeamCoveyEFB-Backend-Setup-<version>.exe`

Install it on the PSX PC, launch "Team Covey EFB Backend", then open:
- `http://localhost:3000/setup`
- or from LAN: `http://<PSX-PC-IP>:3000/setup`

Optional setup OAuth session lifetime:
- `SETUP_SESSION_TTL_DAYS=30` (default 30)

Backend setup OAuth sessions are persisted per device for 30 days by default.

## 3) Expose backend securely

Expose backend with Cloudflare Tunnel (or equivalent) on a dedicated hostname, for example:
- `https://backend-api.teamcovey.org`

The backend API rejects requests without `x-efb-service-token` when `EFB_REQUIRE_SERVICE_TOKEN=1`.

## 4) Setup UI

Open:
- `https://backend-api.teamcovey.org/setup`

Login with Discord (role-gated), then configure PSX host/port, X32 host/port, call-panel phone routes, and references folder.
The values are saved in:
- `%ProgramData%\TeamCoveyEFB\backend-config.json` if `EFB_CONFIG_PATH` is set
- otherwise `%USERPROFILE%\.teamcovey-efb\backend-config.json`

## 4b) Call panel trigger test

Use:

```http
POST /api/psx/call-monitor
Content-Type: application/json

{ "action": "simulate", "button": "P" }
```

This uses the same routing path as live PSX call-panel presses (Qh413).

## 5) Split-mode behavior

- Frontend (Cloudflare Pages) handles user OAuth and role-gating.
- Frontend `/api/*` calls are proxied to backend `/api/*`.
- Backend uses saved PSX/X32 targets and ignores client overrides unless `EFB_ALLOW_CLIENT_PSX_TARGET=1` or `EFB_ALLOW_CLIENT_X32_TARGET=1`.
