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
| `LAUNCHLMS_AUTH_OAUTH_ENABLED` | API, web | `true` enables Google sign-in. See [auth.md](auth.md). |
| `LAUNCHLMS_GOOGLE_CLIENT_ID` | web | Google OAuth client ID. |
| `LAUNCHLMS_GOOGLE_CLIENT_SECRET` | web | Google OAuth client secret. |
| `SSO_REDIRECT_URI` | API | Enterprise SSO callback URL, e.g. `https://<frontend-domain>/auth/sso/callback`. See [auth.md](auth.md). |
| `WORKOS_API_KEY` | API | Only for the WorkOS SSO provider. |
| `WORKOS_CLIENT_ID` | API | Only for the WorkOS SSO provider. |
| `LAUNCHLMS_EMAIL_PROVIDER` | API | `resend` or `smtp`. See [email.md](email.md). |
| `LAUNCHLMS_RESEND_API_KEY` | API | Required when Resend email is enabled. |
| `LAUNCHLMS_SYSTEM_EMAIL_ADDRESS` | API | Sender address. Must be on the provider-verified domain. |
| `LAUNCHLMS_SMTP_HOST` | API | SMTP host. Required for the `smtp` provider. |
| `LAUNCHLMS_SMTP_PORT` | API | SMTP port. Default `587`. |
| `LAUNCHLMS_SMTP_USERNAME` | API | SMTP login. Optional. |
| `LAUNCHLMS_SMTP_PASSWORD` | API | SMTP password. Optional. |
| `LAUNCHLMS_SMTP_USE_TLS` | API | STARTTLS. Default `true`. |
| `LAUNCHLMS_REQUIRE_EMAIL_VERIFICATION` | API | Require new accounts to verify their email before login. Default `false`. |
| `LAUNCHLMS_CONTENT_DELIVERY_TYPE` | API | `filesystem` or `s3api`. |
| `LAUNCHLMS_S3_API_BUCKET_NAME` | API | S3-compatible bucket. |
| `LAUNCHLMS_S3_API_ENDPOINT_URL` | API | S3-compatible endpoint. |
| `AWS_ACCESS_KEY_ID` | API | S3 credential. |
| `AWS_SECRET_ACCESS_KEY` | API | S3 credential. |
| `LAUNCHLMS_IS_AI_ENABLED` | API | Enables AI features when true and configured. |
| `LAUNCHLMS_GEMINI_API_KEY` | API | Gemini API key. |
| `LAUNCHLMS_RESOURCE_VECTOR_SEARCH_ENABLED` | API | `true` enables hybrid resource retrieval. Requires pgvector and the local embedding endpoint. Defaults to `false` for safe lexical fallback. |
| `LAUNCHLMS_RESOURCE_EMBEDDING_URL` | API | Ollama embed endpoint. Managed Compose uses `http://embeddings:11434/api/embed`. |
| `LAUNCHLMS_RESOURCE_EMBEDDING_MODEL` | API, embeddings | Locally hosted embedding model. The supported default is `all-minilm:33m` (384 dimensions). |
| `LAUNCHLMS_RESOURCE_SEMANTIC_MAX_DISTANCE` | API | Maximum pgvector cosine distance admitted as a semantic candidate. Defaults to `0.65`; lower is stricter. |
| `LAUNCHLMS_TINYBIRD_API_URL` | API | Enables analytics when set. |
| `LAUNCHLMS_TINYBIRD_INGEST_TOKEN` | API | Tinybird ingest token. |
| `LAUNCHLMS_TINYBIRD_READ_TOKEN` | API | Tinybird read token. |
| `LAUNCHLMS_STRIPE_SECRET_KEY` | API | Stripe secret key. |
| `LAUNCHLMS_STRIPE_PUBLISHABLE_KEY` | API, web | Stripe publishable key. |
| `LAUNCHLMS_STRIPE_WEBHOOK_STANDARD_SECRET` | API | Standard webhook secret. |
| `LAUNCHLMS_STRIPE_WEBHOOK_CONNECT_SECRET` | API | Connect webhook secret. |
| `LAUNCHLMS_RELEASE_CHANNEL` | API | Set to `unstable` on the testing deployment. A `dev` source build is also recognized as unstable. |
| `LAUNCHLMS_FEEDBACK_JIRA_BASE_URL` | API | Jira Cloud site URL used by tester feedback. HTTPS is required. |
| `LAUNCHLMS_FEEDBACK_JIRA_EMAIL` | API | Dedicated least-privilege Jira integration account. Never expose it to the browser. |
| `LAUNCHLMS_FEEDBACK_JIRA_API_TOKEN` | API | Server-only Jira token able to create/edit/transition feedback issues and add attachments/comments. |
| `LAUNCHLMS_FEEDBACK_JIRA_PROJECT_KEY` | API | Jira project that owns tester feedback. Prefer a dedicated board/project; falls back to `JIRA_PROJECT_KEY`. |
| `LAUNCHLMS_FEEDBACK_JIRA_ISSUE_TYPE` | API | Jira issue type for feedback. Defaults to `Task`. |
| `LAUNCHLMS_FEEDBACK_JIRA_STATUS_OPEN` | API | Open status name. Defaults to `To Do`. |
| `LAUNCHLMS_FEEDBACK_JIRA_STATUS_IN_PROGRESS` | API | “In the works” status name. Defaults to `In Progress`. |
| `LAUNCHLMS_FEEDBACK_JIRA_STATUS_CONFIRM` | API | Awaiting tester confirmation status. Defaults to `In Review`. |
| `LAUNCHLMS_FEEDBACK_JIRA_STATUS_SOLVED` | API | Confirmed solution status. Defaults to `Done`. |
| `LAUNCHLMS_FEEDBACK_JIRA_STATUS_IGNORED` | API | Ignored status. Defaults to `Done`; an issue label preserves the distinction. |
| `LAUNCHLMS_GITHUB_REPOSITORY` | API | GitHub `owner/repository` used for candidate notes. Defaults to `Life2LaunchLabs/launch-lms`. |
| `LAUNCHLMS_GITHUB_TOKEN` | API | Server-only read token for commit/PR history; required for private repositories. |

Candidate notes compare `/app/build-info.json` with the signed-in tester’s
last-viewed commit. Put concise language under `## Release note` in a pull
request, or add `Release note: ...` to the merge/commit body. The merge or
squash title is the fallback. Jira feedback and GitHub release notes never
expose their server credentials to the web client.
