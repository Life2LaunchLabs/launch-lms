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

Use this order for schema-changing releases:

1. Deploy the new image or code to the server.
2. Run `./scripts/run_alembic_migrations.sh`.
3. Restart the API process after the migration succeeds.

Do not rely on app startup to apply migrations automatically. This repository keeps migrations as an explicit release step.

## Guardrail

CI runs `./scripts/check_single_alembic_head.sh` on API changes and fails if Alembic reports more than one head.
