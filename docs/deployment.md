# Deployment

Production deploys are coordinated by the `launch-lms-infra` repository. This
repo is responsible for producing a release image with enough metadata for infra
to pin, migrate, start, and verify it.

## Release Image Contract

The production image is built from the root `Dockerfile`.

The image contains:

- Next.js web app running on port `8000`
- FastAPI app running on port `9000`
- Hocuspocus collab server running on port `4000`
- internal Nginx listening on port `80`
- `/app/build-info.json` with release metadata and the Alembic head

Required build args for release images:

| Build arg | Purpose |
| --- | --- |
| `LAUNCHLMS_PUBLIC` | Removes enterprise-only web code for public/community images when `true`. |
| `LAUNCHLMS_VERSION` | Human release version written to `/app/build-info.json`. |
| `LAUNCHLMS_COMMIT_SHA` | Source commit written to `/app/build-info.json` and used as the Next.js `BUILD_ID`. |
| `LAUNCHLMS_IMAGE_REF` | Expected immutable or tagged image reference written to `/app/build-info.json`. |
| `LAUNCHLMS_RELEASED_AT` | Release timestamp written to `/app/build-info.json`. |

The Docker image sets production defaults:

- `LAUNCHLMS_ENV=prod`
- `LAUNCHLMS_DEVELOPMENT_MODE=false`
- `LAUNCHLMS_PORT=9000`
- `PORT=8000`
- `COLLAB_PORT=4000`

Do not rely on `apps/api/config/config.yaml` for production defaults. It is
optimized for local development.

## Deploy Order

Production deploy order is infra-authoritative:

1. App repo publishes a release image.
2. App repo opens an infra PR updating `release.lock.json`.
3. Infra deploy pulls the pinned image.
4. Infra runs `docker compose run --rm migrate`.
5. Infra restarts the `launch-lms` service only after migrations succeed.
6. Infra verifies image identity, build metadata, DB revision, and service health.

App startup must not apply Alembic migrations automatically. Schema migrations
stay an explicit deploy step.

## CI Guardrail

`.github/workflows/deploy-readiness.yaml` mirrors the production contract on one
architecture:

1. Builds the root release image.
2. Verifies `/app/build-info.json`.
3. Starts a disposable pgvector database.
4. Runs `./scripts/run_alembic_migrations.sh` from the built image.

This workflow is intentionally heavier than unit tests. It should protect
deploy-sensitive changes to Dockerfiles, dependency locks, migrations, and
runtime startup code.

## Web Build Mode

The web app currently builds with webpack:

```bash
next build --webpack
```

Next 16's Turbopack build path has been observed to stall during production
compile for this repository. Keep webpack as the release path until Turbopack is
re-tested and proven stable in CI.
