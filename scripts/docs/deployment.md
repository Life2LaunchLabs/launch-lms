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

Keep all deployment switches disabled until both hosts pass their manual setup.
The current topology is:

| Environment | Domain | Droplet | Application source |
| --- | --- | --- | --- |
| Production | `life2launch.app` | `146.190.134.27` | Tagged, verified `main` release |
| Unstable | `life2launch.dev` | `137.184.34.50` | Verified `dev` candidate |

### Give the app workflow access to infra

1. In GitHub, open your profile settings, then **Developer settings → Personal
   access tokens → Fine-grained tokens → Generate new token**. Select the
   `Life2LaunchLabs` resource owner and restrict repository access to
   `launch-lms-infra`. Grant **Contents: Read and write** and **Pull requests:
   Read and write**. Metadata read access is automatic. If the organization
   requires token approval, approve it before testing the workflows.
2. Copy the token once. In `Life2LaunchLabs/launch-lms`, open **Settings →
   Secrets and variables → Actions → Secrets → New repository secret**. Name it
   `INFRA_REPO_TOKEN` and paste the token. This belongs to the app repository,
   because app workflows dispatch unstable deployments and open release-lock
   PRs in infra.
3. On the same page, open **Variables → New repository variable** and create
   `UNSTABLE_DEPLOY_ENABLED=false`. This switch is repository-level. Change it
   to `true` only after the unstable host and its infra environment work.

### Create the infra environments

1. In `Life2LaunchLabs/launch-lms-infra`, open **Settings → Environments → New
   environment** and create names exactly `unstable` and `production`.
2. Open `unstable`. Under **Environment secrets**, add:

   | Name | Unstable value |
   | --- | --- |
   | `DROPLET_HOST` | `137.184.34.50` |
   | `DROPLET_USER` | `root`, unless a dedicated Docker-capable user was created |
   | `DROPLET_SSH_KEY` | The complete private deploy key, including its BEGIN/END lines |
   | `DROPLET_SSH_FINGERPRINT` | The droplet host key fingerprint beginning `SHA256:` |

3. Under **Environment variables**, create `DEPLOY_ENABLED=false`. This is an
   environment-level variable, not a repository variable or secret. Repeat the
   same setup in `production` with the production host and its separate SSH key.
   Do not create repository-level droplet fallbacks.
4. Leave `unstable` without approval rules so checked candidates can deploy.
   Add required reviewers to `production` when the GitHub plan supports them.
   The production environment remains the final deployment boundary.

### Create and install each Actions SSH key

Generate a different key for each droplet on a trusted workstation. These keys
cannot use a passphrase because GitHub Actions is non-interactive:

```bash
ssh-keygen -t ed25519 -C 'launch-lms-actions-unstable' \
  -f ~/.ssh/launch-lms-actions-unstable
ssh-keygen -t ed25519 -C 'launch-lms-actions-production' \
  -f ~/.ssh/launch-lms-actions-production
```

For each command, leave the passphrase blank. Install only the matching `.pub`
file on that droplet. If your normal administration key already connects, run
this from the workstation:

```bash
cat ~/.ssh/launch-lms-actions-unstable.pub | \
  ssh -i ~/.ssh/YOUR_ADMIN_KEY -o IdentitiesOnly=yes root@137.184.34.50 \
  'umask 077; mkdir -p /root/.ssh; cat >> /root/.ssh/authorized_keys; chmod 600 /root/.ssh/authorized_keys'
```

Alternatively, use the DigitalOcean console to open
`/root/.ssh/authorized_keys`, paste the complete single line from the `.pub`
file on a new line, save it, and run `chmod 600 /root/.ssh/authorized_keys`.

Test from the workstation before putting the private key in GitHub:

```bash
ssh -i ~/.ssh/launch-lms-actions-unstable -o IdentitiesOnly=yes \
  root@137.184.34.50
ssh -i ~/.ssh/launch-lms-actions-production -o IdentitiesOnly=yes \
  root@146.190.134.27
```

If `ssh` or `scp` reports `Permission denied (publickey)`, supply the same `-i`
and `-o IdentitiesOnly=yes` options; a successful interactive login proves the
public key is installed. Copy the private key into `DROPLET_SSH_KEY` with:

```bash
cat ~/.ssh/launch-lms-actions-unstable
```

From the DigitalOcean console, obtain the server identity used by the Actions
fingerprint check:

```bash
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub -E sha256
```

Paste only the displayed `SHA256:...` fingerprint into
`DROPLET_SSH_FINGERPRINT`. Do not use the deploy key's fingerprint here.

### Allow package and repository reads

Open the `launch-lms` container package in the GitHub organization, then
**Package settings → Manage Actions access → Add repository**. Add
`Life2LaunchLabs/launch-lms-infra` with read access. This lets the infra workflow's
short-lived `GITHUB_TOKEN` pull the private package.

The infra repository is currently public, so droplets can clone and fetch it
over HTTPS without a Git deploy key. If it becomes private, create a separate
read-only deploy key for each host checkout under **infra repository Settings →
Deploy keys**. That outbound repository key is separate from the inbound Actions
key above.

### Protect branches and enable deployment

Run **Build Community Images** at least once so GitHub knows its check names.
Then create rulesets or branch protection for `dev` and `main` under **Settings →
Rules → Rulesets**. Require a pull request and the image smoke/build, API tests,
API lint, and single-head migration checks emitted by the workflow. Protect
`main` from direct feature pushes and tag stable releases only from a checked
`main` commit.

Enable in this order after manual host verification:

1. Set infra environment variable `DEPLOY_ENABLED=true` in `unstable`.
2. Run **Deploy environment** manually with `unstable` and verify it.
3. Set app repository variable `UNSTABLE_DEPLOY_ENABLED=true`.
4. Keep production `DEPLOY_ENABLED=false` until its current installation has
   been migrated to the new infra contract and `life2launch.app` passes TLS,
   login, organization routing, file, search, and collaboration checks.
5. Enable production last. A merge to infra `main` can then deploy the exact
   infra revision and production lock, subject to its environment reviewers.

To retry a missing unstable dispatch, rerun the successful candidate workflow
on `dev`; it can reuse retained candidate evidence. Never replace a droplet
environment secret to redirect a pending run between environments.

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

### Tester feedback and candidate notes

When the unstable host is allowed outbound access for reviewed integrations,
set `LAUNCHLMS_RELEASE_CHANNEL=unstable`, configure the
`LAUNCHLMS_FEEDBACK_JIRA_*` variables for a dedicated Jira integration account,
and provide a read-only `LAUNCHLMS_GITHUB_TOKEN` when the application repository
is private. Feedback is stored directly as Jira issues, comments, attachments,
priorities, and transitions. Human-authored GitHub merge messages and explicit
release notes supply the candidate change feed; technical commit subjects are
omitted. See [deploy-env.md](deploy-env.md) for the full contract.
