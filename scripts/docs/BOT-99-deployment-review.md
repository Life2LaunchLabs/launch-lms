# BOT-99 deployment review

Reviewed 2026-09-08 against local app commit `1abb36a5c` and infra commit
`cec0e2c`, including the infra working tree. This is a design proposal; running
servers, GitHub settings, DNS, and remote branch freshness have not been verified.
Existing infra edits to README.md, setup.sh, and .env.example were preserved.

The owner selected periodic production copies with experimental changes kept
separate and approved implementation with a separate test domain. BOT-99 is now
In Progress. This file preserves the initial review; use [deployment.md](deployment.md)
and the infra README for the implemented operating procedure.

## Recommended deployment model

Keep Docker Compose and the infra repository. Use a second droplet with its own
PostgreSQL, Redis, content storage, secrets, and deployment target. Use the
existing `dev` branch as the experimental source unless a different branch is
preferred. Deploy each successful candidate automatically; a nightly timer is
only necessary if daily batching is desirable.

Build once per source commit and supported architecture, record the resulting
multi-platform digest, then run image checks against that artifact. Publish a
candidate as eligible for deployment only after required checks for that exact
commit and digest pass. Reject releases with missing or failed evidence.

Deploy the tested candidate digest to the experimental environment. Release
promotion adds version tags to that same manifest and opens the production infra
lock PR without rebuilding. Production remains a deliberate lock promotion.
If main contains a different merge commit, build and check that commit first;
do not silently promote the dev artifact as if it represented main.

Docker supports copying an existing manifest list without rebuilding through
[imagetools create](https://docs.docker.com/reference/cli/docker/buildx/imagetools/create/).
PR builds should validate without registry credentials; they cannot automatically
serve as trusted release artifacts. Preserve both architecture builds if public
ARM support is required, while avoiding duplicate builds of each architecture.

Build metadata must describe the original commit/build. Release version and
promotion time belong in release/deployment metadata: retagging cannot change
`/app/build-info.json` or OCI labels. Verification must compare the digest and
commit, and distinguish build identity from the promoted release name.

## Accounts, resources, and refreshes

Start with an operator-triggered refresh and add scheduling after rehearsing it.
Restore a consistent production database snapshot plus the corresponding content
copy into a fresh experimental database/storage set. Apply experimental migrations
to that restored database before switching the experimental application over.
Do not restore old production schema directly into an already migrated test DB.

Copied password hashes should allow existing password accounts to log in using
their password as of the snapshot. Testers log in again; do not copy active
sessions, signing keys, or production OAuth credentials. OAuth-only accounts need
explicit test-provider setup or a supported test login arrangement.

Before starting the restored app, clear session/token records as appropriate,
disable real email/payment/webhook effects, replace integration credentials,
remove production custom-domain mappings, and rewrite environment-owned URLs.
Copy resource files to independent storage; do not give the test app write access
to production content. Audit external storage and embedded absolute links during
implementation. Restrict access to the intended testers.

A refresh replaces experimental changes, including new accounts, passwords,
progress, and uploads. Display the snapshot time and reset warning, and preserve
tester feedback outside the reset data. Nothing syncs back to production.

## Domains

Prefer a separate registrable test domain, with its apex and wildcard pointing
at the second droplet. Organization URLs remain `<org>.<test-domain>`. The host
utilities already extract org subdomains relative to a configured base domain.

`dev.example.com` with orgs at `<org>.dev.example.com` is also routable, but needs
explicit DNS and TLS coverage for both `dev.example.com` and `*.dev.example.com`.
The production `*.example.com` certificate does not cover that extra level.
The existing Caddy template supports a configured base and wildcard, using
[DNS challenges for wildcard certificates](https://caddyserver.com/docs/automatic-https).

Nested domains need additional auth design: `apps/web/services/auth/cookies.ts`
sets parent-domain cookies, so production cookies scoped to `.example.com` also
reach the experimental subdomain. Setting test cookies to `.dev.example.com`
does not prevent that inheritance. A separate domain avoids this overlap;
separate JWT keys alone do not prevent browser cookie collisions or exposure.
See [cookie Domain semantics](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie).
If using `dev`, check existing org slugs and reserve it across creation/rename
paths before diverting its DNS. Verify login, logout, callbacks, org switching,
and collab URLs on both environments.

## Findings from the current files

| Finding | Consequence / proposed change |
| --- | --- |
| `build-community.yaml` builds amd64 and arm64 on branch pushes and PRs; `deploy-readiness.yaml` independently builds another image; `release.yaml` rebuilds both architectures on tags. | Consolidate image creation and run smoke checks against the produced digest. Separate branch/release cache scopes also reduce cache sharing. |
| Publishing/release workflows do not depend on deployment-readiness passing. | Make eligibility depend on checks for the exact candidate. Verify repository protection settings separately. |
| Release checkout uses `INFRA_TOKEN`, while PR creation uses `INFRA_REPO_TOKEN`. | Standardize the credential contract; current secrets may exist, but that has not been checked. |
| Release tags accept any `v*`, always publish `latest`, and write `source_branch: main`. | Validate release source; explicitly handle prereleases so experimental tags cannot advance production/latest. |
| Infra deploy follows `origin/main` and reads `release.lock.json`. | The app is deployed from a lock, not built from main on the droplet. Introduce separate environment locks/targets and deploy the selected infra revision, avoiding drift to a newer main during queued jobs. |
| The checked-in infra lock has a tag, null digest, and unknown commit. | Enforce digest and commit in new locks; verify the actual deployed lock before claiming production is pinned. |
| `verify-deploy.sh` prints DB/Redis health without asserting it and does not probe HTTP/web/collab readiness. | Fail on unhealthy dependencies and retry meaningful service readiness checks before recording success. |
| Deploy runs migrations before removing the app, but has no automated recovery after failed post-start verification. | Preserve prior release evidence; define compatible app rollback and backup/restore for schema changes. Successful migrations can already affect the old running app. |
| App deployment docs require Ollama/search backfill; local infra Compose/deploy scripts do not provide them. | Reconcile the actual runtime contract before using this infra checkout for a new experimental server. |
| Infra README domain-update commands refer to host Caddy, while Compose runs containerized Caddy. | Align setup, deployment, and repair instructions around the actual service. |

## Proposed deliverables and owner checks

1. One candidate-build/check/promotion pipeline. Demonstrate a tagged release
   reuses the checked digest and a failed candidate cannot deploy.
2. Environment-specific infra locks and deployment configuration. Demonstrate
   experimental updates leave production unchanged and each server reports its
   expected commit/digest with working HTTP and collaboration services.
3. Independent test-data refresh with controlled integrations. Demonstrate a
   copied tester can log in and access files, test edits leave production alone,
   and refresh resets test data as advertised without sending real messages.
4. Domain/session isolation and deploy recovery documentation. Demonstrate
   simultaneous production/test sessions, org routing, and a rehearsed failed
   deployment/restore path.

Before implementation, choose the actual test domain and confirm the source
branch and refresh cadence. Before provisioning, establish droplet sizing from
current workload and embedding-service requirements. No suitable deployment
Activity was found in the current product map; formalization should add durable
operator deployment context rather than attach this to an unrelated admin UI.

## Implementation handoff (2026-09-08)

Implemented in both local repositories. The app operating guide is
[deployment.md](deployment.md); the infra README contains the fresh-host,
existing-production, snapshot, refresh, and recovery walkthroughs. The original
infra changes to production mode, same-origin API configuration, and container
Caddy documentation were preserved in the resulting implementation.

Verification completed:

- Full API suite: **388 passed**, including four new bootstrap-password tests.
- API Ruff check: passed (removed one pre-existing unused import blocking the gate).
- Release contract tests: **3 passed**.
- Infra guard/sanitization tests: **6 passed**.
- `actionlint` with ShellCheck for both repositories' workflows: passed.
- ShellCheck and shell syntax for deploy/setup/snapshot/refresh/smoke: passed.
- Docker Compose resolution: verified internal app/DB/Redis network and edge/model
  egress, plus production runtime settings in the unstable configuration.
- Root application image built successfully on local amd64; its final smoke run
  passed schema bootstrap/migrations, pgvector column/index checks, model dimensions,
  search relevance, API/frontend/collaboration readiness, and login with the
  configured initial administrator password.
- Disposable PostgreSQL integration rehearsal passed dump/restore against the
  current schema, copy sanitization, password preservation, URL rewriting without
  altering the original DB, and denial of outbound networking.
- Caddy bootstrap password hashing tested with a synthetic credential.

The bootstrap review found the app previously ignored INITIAL_ADMIN_PASSWORD and
used a hardcoded password. Deployed bootstrap now requires the configured password,
validates it before any organization is created, and never prints it. The legacy
Redis URL ending in `/launchlms` is replaced with numeric `/0` in new setup and is
called out in the existing-production migration guide.

No production data was copied or modified. No remote application images were
published, no GitHub settings were changed, and no cloud servers/DNS were provisioned.
ARM image execution, registry promotion, SSH deployment, public DNS/TLS, complete
host refresh/cutover, and representative tester journeys remain rollout/owner
checks. Both repositories contain local, uncommitted changes. Deployment automation
is opt-in through the documented variables.
