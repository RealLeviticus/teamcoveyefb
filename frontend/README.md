# Frontend (Cloudflare Pages)

This folder is the public EFB frontend intended for Cloudflare Pages.

It is a static Next.js export (`out/`) plus Cloudflare Pages Functions for:
- Discord OAuth login
- Discord role-based authorization
- Session cookie handling
- `/api/*` proxy to the backend on the PSX PC

## 1) Configure Cloudflare Pages

- Root directory: `frontend`
- Build command: `npm ci && npm run build`
- Build output directory: `out`
- Production branch: `main` (or your chosen release branch)

## 2) Set Pages environment variables

Use the names from `.dev.vars.example`:

- `FRONTEND_SESSION_SECRET`
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_GUILD_ID`
- `DISCORD_ALLOWED_ROLE_IDS`
- `BACKEND_BASE_URL`
- `BACKEND_SERVICE_TOKEN`

## 3) Discord application settings

Set OAuth redirect URI to:

- `https://efb.teamcovey.org/auth/callback`

The login flow checks the member's role IDs inside `DISCORD_GUILD_ID`. Users without one of `DISCORD_ALLOWED_ROLE_IDS` are denied.

## 4) Local preview

```powershell
cd frontend
copy .dev.vars.example .dev.vars
npm install
npm run cf:preview
```

## 5) API behavior

Browser calls still use `/api/...`.
Pages Functions forward those requests to `${BACKEND_BASE_URL}/api/...` and inject `x-efb-service-token`.

## 6) 404 checklist for custom domain

If `https://efb.teamcovey.org/` returns `HTTP ERROR 404`, verify:

1. Cloudflare Pages has a successful production deployment for your branch.
2. Pages project settings use:
   - Root directory: `frontend`
   - Build command: `npm ci && npm run build`
   - Build output: `out`
3. `efb.teamcovey.org` is attached under Pages `Custom domains` for this project.
4. DNS has a proxied CNAME:
   - Name: `efb`
   - Target: `<your-pages-project>.pages.dev`
5. Visiting `https://<your-pages-project>.pages.dev/` works first. If that URL fails, the issue is build/deploy settings, not DNS.
