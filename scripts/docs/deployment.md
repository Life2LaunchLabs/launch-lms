# Deploying Launch LMS: unstable → production

Both installations run the production Docker image with `LAUNCHLMS_ENV=prod` and
`LAUNCHLMS_DEVELOPMENT_MODE=false`. **Unstable is a deployment target for `dev`,
not development runtime mode.** It has a separate droplet, domain, database,
Redis, files, and secrets. Organization URLs work as `<org>.<environment-domain>`.

The app repo owns builds, automated checks, and release promotion. The
[infra repo](https://github.com/Life2LaunchLabs/launch-lms-infra) owns server setup,
Compose, migrations, readiness, backups, and data refresh. Its README contains
fresh-droplet and existing-production walkthroughs; land both repos' BOT-99
changes before enabling deployment automation.

## Normal feature/update walkthrough

1. Branch from current `dev`:
   ```bash
   git switch dev
   git pull --ff-only origin dev
   git switch -c feature/my-change
   ```
2. Implement and test locally. Push the feature branch and open a PR targeting
   `dev`. CI builds both amd64 and arm64, checks migrations and runtime readiness,
   and runs API tests/lint. PR builds never log into GHCR or deploy.
3. Review and merge the PR into `dev`. The **Build Community Images** workflow
   checks the actual merged commit. After all required jobs pass, it publishes
   the multi-platform digest, saves the `candidate` artifact, and requests an
   unstable deployment (when `UNSTABLE_DEPLOY_ENABLED=true`).
4. Watch **Deploy environment** in the infra repo and select its `unstable` run.
   The host pulls the digest, runs migrations, starts services, checks readiness,
   and backfills search. A failed build never requests deployment. A failed
   deployment retains attempted-release evidence and does not record success.
5. Test at the unstable domain: enter the shared tester HTTP credentials, then
   sign in with your copied account. Exercise org switching, files, learning
   changes, and collaboration. Record feedback outside unstable because a data
   refresh replaces experimental changes. Confirm production stayed unchanged.
6. Fix problems through another feature PR to `dev`; repeat until clear.
7. Open a PR from `dev` to `main`. Keep `main` releasable. After merging, wait for
   **Build Community Images** on the resulting `main` commit to succeed. If the
   source SHA already has retained successful candidate evidence, the image is
   reused. A merge/squash that creates a different SHA gets one new build/check.
   Source identity is never inferred from similar file trees.
8. Tag the checked main commit:
   ```bash
   git switch main
   git pull --ff-only origin main
   git tag -a v0.2.0 -m 'Release v0.2.0'  # use the next unused version
   git push origin v0.2.0
   ```
   **Release** finds a successful main candidate for that exact SHA, downloads
   its digest evidence, adds version tags to the existing manifest, publishes a
   GitHub release with `release.lock.json`, and opens an infra lock PR. It does
   **not** run a Docker build. If you tagged too early, wait for main CI and rerun
   the failed Release workflow. Never move a published version tag.
9. Review the infra PR's source SHA, digest, and migration requirements. Take a
   production snapshot before changes that require a recovery point. Merge the
   PR when ready; approve the GitHub `production` environment if you configured
   reviewers. This merge is the production deployment decision.
10. Verify the production URL, login, org routing, files, search, and collaboration.
    On the host, inspect `.deploy-state/deployed-release.json` and run
    `bash scripts/verify-deploy.sh` from `/opt/launch-lms`.

A `main` push alone does not deploy production. A `dev` push never changes the
production lock. Neither server pulls a moving branch image during deployment.
Stable release tags must be `vMAJOR.MINOR.PATCH`; prereleases are rejected.
The workflow does not update `latest`, so historical releases/rollback tags cannot
silently change that alias. Consumers must use version tags or, preferably, digests.

## One-time GitHub setup

In the **app repository**:

- Add `INFRA_REPO_TOKEN`, scoped to the infra repository with Contents read/write
  and Pull requests read/write. It is used consistently for checkout, release
  PR creation, and the unstable repository dispatch. A GitHub App installation
  token can replace the PAT if you already manage one.
- Keep repository variable `UNSTABLE_DEPLOY_ENABLED` unset/false during bootstrap.
  Set it to `true` after the unstable droplet is initialized and its infra
  environment is enabled. To retry a missing dispatch, rerun the candidate job
  or the workflow on `dev`; it can reuse successful retained evidence.
- Protect `dev` and `main`: require the build/smoke jobs, API tests, API lint, and
  single-head migration check. Run the new workflow once to populate selectable
  status names. The publication job itself explicitly waits for these checks.
- Grant the **infra repository** read access to the `launch-lms` GHCR package via
  package settings → Manage Actions access. Keep package deletion policies from
  removing digests still used by releases/deployments.

In the **infra repository**:

- Create GitHub environments named exactly `unstable` and `production`.
- In each environment add `DROPLET_HOST`, `DROPLET_USER`, `DROPLET_SSH_KEY`, and
  `DROPLET_SSH_FINGERPRINT`. Each environment points at its own droplet. Avoid
  repository-level fallback secrets that could accidentally send unstable to
  production. The host also checks `.deployment-environment` before doing work.
- Set environment variable `DEPLOY_ENABLED=true` only after that host is ready.
  Initially leave it false/unset. Add required reviewers to `production` if your
  GitHub plan supports them; leave `unstable` automatic.
- The infra default branch must be `main`; `repository_dispatch` executes its
  workflow from the default branch. A production push deploys its exact infra
  SHA, and an unstable dispatch uses the default-branch SHA at dispatch time.
- The droplet's Git checkout needs persistent read access to the infra repository
  (a read-only deploy key for a private repo). GHCR pulls during Actions use the
  short-lived workflow token; its temporary Docker credential directory is
  removed on both success and failure.

## Build and release contract

The root Dockerfile produces Next.js on port 8000, FastAPI on 9000, Hocuspocus
on 4000, and internal Nginx on port 80. Runtime frontend configuration is injected
by `server-wrapper.js`; selecting a domain does not require an image rebuild.
The web build continues to use `next build --webpack`.

`/app/build-info.json` records the original build's commit, version identifier,
image label, build timestamp, and Alembic head. Promotion cannot rewrite this
file without creating a different image. The deployment lock supplies the human
release version/time and exact digest; verification compares actual image identity,
commit, and schema. Seeing `sha-...` inside a promoted image is expected.

Image builds are per architecture and local-loaded for smoke testing. The tested
image is pushed with `docker push`, not rebuilt. The multi-platform manifest is
published only after image smoke, API tests/lint, and migration checks succeed.
`sha-<full-commit>`, `dev`, and `main` are convenience tags; candidate artifacts
record the immutable digest used for all deployments. Evidence retention is 90
days. If it expires before release, rerun the branch build and inspect its new
candidate; do not manufacture a lock from a branch tag. Image rebuilding after
expired evidence may produce different contents due to upstream dependencies.

The manual **Deploy Readiness** workflow accepts an immutable image reference
and expected full commit and tests that existing artifact. It never rebuilds or
marks a candidate eligible for release on its own.

## Checks and recovery

Smoke runs apply migrations to disposable PostgreSQL/pgvector, verify the vector
column/index, pull the pinned Ollama model, evaluate hybrid search relevance,
then start and probe the API, frontend, collaboration runtime, and login with
the configured initial administrator password. Both supported
architectures receive the image smoke checks. They do not constitute owner signoff.

Production migrations run while the previous app still exists. Failure prevents
switching to the new app, but a migration may already have changed the schema.
For compatible schema changes, revert the infra lock in a **new PR/commit** to a
previous good digest and deploy. For incompatible/destructive migrations, use the
pre-deploy database and content backup; rolling back an image does not undo data
changes. See infra README for recovery commands and refresh behavior.

External integrations are intentionally unavailable on unstable initially. The
app and migration containers have no public network route; Caddy and Ollama have
separate egress for TLS and model downloads. This includes external AI, SMTP,
payments, remote resource previews, and external SSO. Filesystem uploads, local
embeddings/search, password accounts, and collaboration remain available. An
integration-specific test mode requires a separate reviewed configuration change.

Do not copy `.env`, signing keys, Redis data, or production custom domains to the
unstable droplet. The supported snapshot helper handles local PostgreSQL and
filesystem storage. S3/managed-database installations need an explicit export
adapter before using that helper; it refuses those configurations.
