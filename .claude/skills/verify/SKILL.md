---
name: verify
description: Build, launch, and drive the Launch LMS dev stack to verify changes end-to-end (API + web UI).
---

# Verifying Launch LMS changes at runtime

## Stack layout (dev)

- PostgreSQL + Redis run in Docker (`launch-lms-db-dev`, `launch-lms-redis-dev`), usually already up.
  Start if needed: `docker compose -f .launch-lms/docker-compose.dev.yml up -d`
- **API entrypoint is `app:app`, not `src.main:app`** (CLAUDE.md is stale on this):
  `cd apps/api && uv run uvicorn app:app --port 1338 &`
- **The web app proxies `/api/v1/*` to port 1338** (`LAUNCHLMS_INTERNAL_BACKEND_URL` in
  `apps/web/.env.local`, handled by `app/api/v1/[...path]/route.ts`). Run the API on 1338,
  not 8000, or UI requests 404.
- Web: `cd apps/web && bun dev &` — serves **HTTPS** at `https://127.0.0.1.sslip.io:3000`
  (local certs in `certs/`). Use `curl -k` / `ignoreHTTPSErrors: true`.

## Login

- Dev seed superadmin: `admin@school.dev` / `Com8com8!` (see `apps/api/cli.py`).
- Login is **two-step**: fill email → click "Continue" → password field appears → Enter.
- API-side: `POST /api/v1/auth/login` with form-encoded `username=<email>&password=...`,
  cookies carry the JWT (`curl -c cookies.txt` then `-b cookies.txt`).

## Driving the UI

- Playwright chromium headless-shell works; `npx playwright install chromium` (no sudo for
  `--with-deps`). Missing `libasound.so.2`: `apt-get download libasound2t64 && dpkg -x *.deb libs/`
  then `LD_LIBRARY_PATH=$PWD/libs/usr/lib/x86_64-linux-gnu node script.mjs`.
- Owner org slug in dev: `life2launch` (instance info: `GET /api/v1/instance/info`).
  Platform admin UI: `https://127.0.0.1.sslip.io:3000/admin/platform`.

## Gotchas

- `getUriWithOrg` server-side falls back to `localhost` when no `NEXT_PUBLIC_LAUNCHLMS_DOMAIN`
  is set — never use it inside server-component `redirect()`; use host-relative paths.
- Unauthenticated visits to admin routes 307 to `/` (proxy middleware) — that's not a bug.
- API tests: `cd apps/api && TESTING=true uv run pytest -q` (SQLite, fast).
