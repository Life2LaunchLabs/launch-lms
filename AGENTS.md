# Launch LMS agent map

This repository is the complete source of truth for the Launch LMS product. A
sibling checkout is never required to understand, build, test, or review it.

## Read before changing behavior

- [ARCHITECTURE.md](ARCHITECTURE.md) — applications, data, and dependency boundaries.
- [docs/product/README.md](docs/product/README.md) — durable product map and acceptance context.
- [docs/design/README.md](docs/design/README.md) — design readiness and visual verification.
- [docs/quality/README.md](docs/quality/README.md) — executable checks and debt ratchets.
- [docs/security/README.md](docs/security/README.md) and
  [docs/reliability/README.md](docs/reliability/README.md) — operating constraints.
- [docs/plans/README.md](docs/plans/README.md) — active plans and completed decisions.

Use `./scripts/agent doctor` from a clean checkout, `./scripts/agent check --changed`
during implementation, and `./scripts/agent check --all` before handoff.

Read existing, alternate, legacy and permission-gated implementations before
changing behavior.

## Delivery

Start from current `origin/dev`. Never push directly to dev/main or bypass branch
rules: push a branch, open a PR targeting dev, and wait for the required checks on
its latest head and any browser checks. Merging to dev once those pass is fine;
dev deploys to unstable. Promotion to main and production is the owner's call;
never deploy production from a task.

Run appropriate automated, migration, security, accessibility, and design-system
checks. Keep product data and references current; preserve removed/sunset outcomes
as history. Include exact checks, PR/commit links, and test steps in the PR.

## Interface work

Complete [design readiness](docs/design/README.md) before UI changes. Read
apps/web/design-system/catalog.json and reuse adopted components. When a new shared
component is justified, update its catalog entry and native preview.

Before handoff, inspect current browser-rendered screenshots and exercise changed
interactions at desktop and phone viewports. Builds, source inspection or
screenshot existence alone are not visual verification. Missing browser, fixtures,
access or references is a blocker to state, never a pass.

## Boundaries

Never expose credentials or private learner data in comments, captures, PRs or
artifacts.
