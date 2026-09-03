# Launch LMS API

## Database migrations

Run schema migrations explicitly before restarting the API in production:

```bash
cd apps/api
./scripts/run_alembic_migrations.sh
```

The script requires either `LAUNCHLMS_SQL_CONNECTION_STRING` or `DATABASE_URL` to be set.

## CLI commands

Run API CLI commands through the API virtualenv-aware wrapper from the repo root:

```bash
./scripts/api-cli normalize-owner-org-slug
```

If you prefer running it directly, use the API environment instead of system Python:

```bash
apps/api/.venv/bin/python apps/api/cli.py normalize-owner-org-slug
```

## Release order

Schema-changing production releases are orchestrated by `launch-lms-infra`.

1. Publish a new image from this repo.
2. Update the infra release lock to the new immutable image digest.
3. Let the infra deploy step run `./scripts/run_alembic_migrations.sh` before restarting the app.

Do not rely on app startup to apply migrations automatically. Migrations stay an explicit deploy step.

Production Docker images set `LAUNCHLMS_ENV=prod` and
`LAUNCHLMS_DEVELOPMENT_MODE=false`. Keep `config/config.yaml` development-first;
do not change it to simulate production.

## Hub advisor

The first Hub advisor uses OpenAI's Responses API through a server-only, stateless provider boundary. A
Superadmin configures its API key, model, instructions, and enabled state in Platform Settings after deployment.
The key is encrypted in the database and is write-only through the API; it is never returned to the browser.
Each request sends the bounded browser-held conversation with response storage disabled and no tools; Launch
LMS does not persist chat messages.

## Guardrail

CI runs `./scripts/check_single_alembic_head.sh` on API changes and fails if Alembic reports more than one head.

The deploy-readiness workflow also builds the root release image and runs
`./scripts/run_alembic_migrations.sh` against a disposable pgvector database.
