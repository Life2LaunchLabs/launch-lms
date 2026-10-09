# Browser UI verification

This harness drives the real Launch LMS UI through normal login. It refuses unnamed remote targets and stores auth,
screenshots, videos, traces and manifests only in ignored directories.

## Local setup

1. Start a disposable/local API and web application with current migrations. Set
   `LAUNCHLMS_UI_TEST_FIXTURES=true` and `LAUNCHLMS_DEVELOPMENT_MODE=true` on the API to use deterministic Hub advice;
   this fixture provider cannot run when development mode is off.
2. Create synthetic test users through the normal supported setup flow. Never use a personal account or shared database.
3. Export the variables in `.env.example` from a protected shell or CI secret store. For organization-subdomain routing,
   make `UI_TEST_BASE_URL` that organization origin and override the Hub/Plans paths to `/hub` and `/plans`.
4. Run `bun run test:ui:install`, `bun run test:ui:doctor`, then `bun run test:ui:capture`.

`scripts/ui/run-local.sh` uses `.next-ui-test` so it can run beside a normal developer server without replacing that
server's build state. Set `UI_TEST_WEB_MODE=start` after building with `NEXT_DIST_DIR=.next-ui-test` to verify the
production application artifact; this mode currently expects `UI_TEST_HTTPS=false`. The default `dev` mode is intended
for local iteration.

The normal suite covers Chromium desktop (1440x900), Chromium phone (390x844), and a mobile-critical WebKit smoke.
Phone emulation does not reproduce every physical device or software-keyboard behavior. `test-results/ui/run-manifest.json`
records the revision, dirty-worktree fingerprint, browser projects and scenario outcomes. Failure traces can contain
sensitive request data; keep them in restricted local/CI storage and delete them according to the CI retention policy.

## CI contract

`.github/workflows/browser-ui.yaml` provisions an isolated Postgres/Redis namespace, migrates and seeds it through the
supported CLI, builds the application, and runs the real-login suite in Chromium desktop, Chromium phone, and mobile
WebKit. It runs both the existing shared-cookie mode and a separate host-only mode using
`life2launch.unstable.127.0.0.1.sslip.io` and `unstable.127.0.0.1.sslip.io` on a disposable database. The host-only
lane verifies a browser login, cross-host one-use handoff, host-only auth cookies, legacy parent-cookie expiry,
absence of credentials in URLs, and replay rejection. Set `UI_TEST_PUBLIC_HOST`, `UI_TEST_BROWSER_HOST`,
`LAUNCHLMS_COOKIE_SCOPE`, `NEXT_PUBLIC_LAUNCHLMS_COOKIE_SCOPE`, and
`NEXT_PUBLIC_LAUNCHLMS_LEGACY_COOKIE_DOMAIN` to reproduce it locally. This synthetic HTTP lane is a prerequisite,
not evidence of live TLS, Google/enterprise SSO, or owner acceptance of the nested-domain cutover.

The release candidate job depends on this lane. Failure traces and reports are retained for seven days; successful
runs retain the run manifest as an artifact. Tests may explicitly attach PNGs named
`synthetic-review:<filename>` to embed those captures (with hashes and project/attempt
metadata) in the manifest for review. Use that prefix only with entirely synthetic
fixtures; ordinary screenshots and traces are never embedded. Decode `png_base64`
from `synthetic_review_captures` to recover the original PNGs for visual inspection. A login page, missing fixture, failed health check or absent expected UI is
a failure; baselines are never accepted automatically.
