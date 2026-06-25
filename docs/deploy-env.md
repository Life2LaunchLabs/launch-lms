# Deploy Environment

This file is the app-side source of truth for production environment variable
names. Keep it aligned with `launch-lms-infra/.env.example` and `setup.sh`.

## Required Core Vars

| Variable | Used by | Notes |
| --- | --- | --- |
| `LAUNCHLMS_AUTH_JWT_SECRET_KEY` | API, collab | Required. Must be at least 32 characters. |
| `COLLAB_INTERNAL_KEY` | API, collab | Required shared secret for internal ydoc read/write calls. |
| `LAUNCHLMS_SQL_CONNECTION_STRING` | API, migrate | Required for production. Use sync SQLAlchemy-compatible PostgreSQL URLs, for example `postgresql+psycopg2://...`. |
| `LAUNCHLMS_REDIS_CONNECTION_STRING` | API, collab | Preferred Redis variable for production. Collab also accepts `LAUNCHLMS_REDIS_URL` for compatibility. |

## Hosting And Routing

| Variable | Used by | Notes |
| --- | --- | --- |
| `LAUNCHLMS_DOMAIN` | API, infra | Public app domain. |
| `LAUNCHLMS_FRONTEND_DOMAIN` | API | Public frontend domain returned by instance info. |
| `LAUNCHLMS_ALLOWED_ORIGINS` | API | Comma-separated CORS allowlist. |
| `LAUNCHLMS_ALLOWED_REGEXP` | API | CORS origin regex. |
| `LAUNCHLMS_COOKIE_DOMAIN` | API | Cookie domain. |
| `LAUNCHLMS_INTERNAL_API_URL` | web | Server-side internal API URL. In the all-in-one image this should be `http://localhost/api/v1/`. |
| `NEXT_PUBLIC_LAUNCHLMS_DOMAIN` | web | Browser/runtime public frontend domain. |
| `NEXT_PUBLIC_LAUNCHLMS_BACKEND_URL` | web | Public backend origin fallback. Same-origin `/api/v1` is preferred for browser calls. |
| `NEXT_PUBLIC_LAUNCHLMS_API_URL` | web | Leave blank for same-origin production deployments. Set only for split frontend/backend deployments. |
| `NEXT_PUBLIC_COLLAB_URL` | web | Public WebSocket URL, usually `wss://<domain>/collab`. |

## Production Defaults

The production Docker images set these defaults:

| Variable | Value |
| --- | --- |
| `LAUNCHLMS_ENV` | `prod` |
| `LAUNCHLMS_DEVELOPMENT_MODE` | `false` |
| `LAUNCHLMS_PORT` | `9000` |
| `PORT` | `8000` |
| `COLLAB_PORT` | `4000` |

If a deployment overrides them, it owns the consequences. In particular, do not
run the API with `LAUNCHLMS_DEVELOPMENT_MODE=true` in production because Uvicorn
will start in reload mode.

## Optional Integrations

| Variable | Used by | Notes |
| --- | --- | --- |
| `LAUNCHLMS_EMAIL_PROVIDER` | API | `resend` or `smtp`. |
| `LAUNCHLMS_RESEND_API_KEY` | API | Required when Resend email is enabled. |
| `LAUNCHLMS_SYSTEM_EMAIL_ADDRESS` | API | Sender address. |
| `LAUNCHLMS_CONTENT_DELIVERY_TYPE` | API | `filesystem` or `s3api`. |
| `LAUNCHLMS_S3_API_BUCKET_NAME` | API | S3-compatible bucket. |
| `LAUNCHLMS_S3_API_ENDPOINT_URL` | API | S3-compatible endpoint. |
| `AWS_ACCESS_KEY_ID` | API | S3 credential. |
| `AWS_SECRET_ACCESS_KEY` | API | S3 credential. |
| `LAUNCHLMS_IS_AI_ENABLED` | API | Enables AI features when true and configured. |
| `LAUNCHLMS_GEMINI_API_KEY` | API | Gemini API key. |
| `LAUNCHLMS_TINYBIRD_API_URL` | API | Enables analytics when set. |
| `LAUNCHLMS_TINYBIRD_INGEST_TOKEN` | API | Tinybird ingest token. |
| `LAUNCHLMS_TINYBIRD_READ_TOKEN` | API | Tinybird read token. |
| `LAUNCHLMS_STRIPE_SECRET_KEY` | API | Stripe secret key. |
| `LAUNCHLMS_STRIPE_PUBLISHABLE_KEY` | API, web | Stripe publishable key. |
| `LAUNCHLMS_STRIPE_WEBHOOK_STANDARD_SECRET` | API | Standard webhook secret. |
| `LAUNCHLMS_STRIPE_WEBHOOK_CONNECT_SECRET` | API | Connect webhook secret. |
