# Launch LMS — Claude Code Reference

## Project Overview

Launch LMS is an open-source LMS (Learning Management System) for creating and managing educational content. It is a multi-tenant platform supporting self-hosted (OSS), SaaS, and Enterprise deployment modes.

Key capabilities: courses with block-based editor, real-time collaborative whiteboards, AI-assisted content creation, code execution (30+ languages), communities/discussions, podcasts, analytics, and Stripe payments.

---

## Monorepo Structure

```
launch-lms/
├── apps/
│   ├── web/        # Next.js 16 frontend (React 19, TailwindCSS v4)
│   ├── api/        # FastAPI backend (Python)
│   ├── collab/     # Real-time collaboration server (Node.js/TypeScript, Hocuspocus)
│   └── cli/        # Setup & management CLI (Node.js/TypeScript)
├── docker/         # Nginx config, entrypoint scripts
├── .launch-lms/    # Dev docker-compose (PostgreSQL + Redis)
├── .github/        # GitHub Actions workflows
└── Dockerfile      # Multi-stage production build (5 stages)
```

---

## Tech Stack

### API (`apps/api/`)
- **Language**: Python (async/await throughout)
- **Framework**: FastAPI 0.135+ with Uvicorn (ASGI)
- **ORM**: SQLModel (Pydantic + SQLAlchemy hybrid)
- **Database**: PostgreSQL 16 + pgvector extension
- **Migrations**: Alembic
- **Auth**: PyJWT HS256, Argon2 password hashing
- **AI**: Google Gemini (google-genai), LlamaIndex for RAG/embeddings
- **Payments**: Stripe
- **Code Execution**: Judge0
- **Email**: Resend or SMTP
- **File Storage**: AWS S3 or local filesystem
- **Analytics**: Tinybird
- **Cache**: Redis (via ioredis, also used by collab)
- **Package Manager**: uv

### Web (`apps/web/`)
- **Framework**: Next.js 16 with App Router + Turbopack
- **Language**: TypeScript
- **UI**: React 19, TailwindCSS v4, Radix UI primitives, Shadcn components
- **Editor**: Tiptap (rich text) + CodeMirror (code blocks)
- **Real-time**: Yjs + Hocuspocus WebSocket provider
- **Data Fetching**: SWR
- **Forms**: Formik + Yup
- **i18n**: i18next
- **Icons**: Phosphor Icons, Lucide React
- **Error Tracking**: Sentry
- **Package Manager**: Bun

### Collab (`apps/collab/`)
- **Server**: Hocuspocus (WebSocket-based CRDT sync)
- **CRDTs**: Yjs
- **Cache**: Redis (1-hour TTL, 5-second flush debounce)
- **Language**: TypeScript / Bun

---

## API Architecture

**Base URL**: `/api/v1`
**Port**: 8000 (default)

### Authentication Methods
1. **JWT Bearer** — login at `/api/v1/auth/login`, tokens in httpOnly cookies
   - Access token: 8-hour expiry
   - Refresh token: 30-day expiry, rotated via `/api/v1/auth/refresh`
   - Algorithm: HS256; secret: `LAUNCHLMS_AUTH_JWT_SECRET_KEY`
2. **API Tokens** — Bearer `lh_<token>`, scoped to org, stored hashed in DB
3. **Anonymous** — public endpoints require no auth

### Middleware (in order)
1. CORS (origin regex configurable)
2. GZip (≥ 1000 bytes)
3. Sentry (conditional)
4. Enterprise Edition hooks (conditional)

### Router Map (30+ routers under `apps/api/src/routers/`)
| Prefix | Domain |
|---|---|
| `/auth` | Login, logout, refresh, OAuth (Google), email verification |
| `/users` | User profile, settings |
| `/orgs` | Organization CRUD, custom domains, packs |
| `/roles` | RBAC role definitions |
| `/usergroups` | User groups & resource access |
| `/api_tokens` | API token management (pro plan) |
| `/courses` | Course CRUD, publishing, thumbnails |
| `/courses/.../chapters` | Chapter management |
| `/courses/.../activities` | Activity/lesson content |
| `/courses/.../assignments` | Tasks + submissions |
| `/courses/.../certifications` | Certificates (pro plan) |
| `/courses/.../collections` | Course collections |
| `/boards` | Collaborative whiteboards (pro plan) |
| `/playgrounds` | Interactive playground elements (pro plan) |
| `/podcasts` | Podcast + episode management |
| `/communities` | Community forums |
| `/discussions` | Discussion threads |
| `/trail` | Learning paths |
| `/ai` | AI features, magic blocks, course planning, RAG |
| `/code` | Code execution (Judge0) |
| `/stream` | HLS video streaming |
| `/analytics` | Course analytics |
| `/search` | Global search |
| `/instance` | Public instance metadata |
| `/plans` | Plan definitions (public) |
| `/health` | Health checks |
| `/dev` | Dev-mode only endpoints |
| `/internal` | Internal endpoints (protected by `X-Internal-Key` header) |

### Key Security Patterns
- Account lockout after N failed login attempts (default: 5 attempts, 30-min lockout)
- IP-based rate limiting on login, refresh, email verification
- CSRF protection
- RBAC via dependency injection (`Depends(...)`)
- Plan-based feature gating via dependency injection
- All file uploads validated for size and MIME type

---

## Database

### Connection
- Env var: `LAUNCHLMS_DATABASE_URL` (PostgreSQL in prod, SQLite in tests)
- Tests auto-use SQLite when `TESTING=true`

### Core Tables / Models (in `apps/api/src/db/models/`)
- `Organization`, `OrganizationConfig` — multi-tenant root entities
- `User`, `UserRoleWithOrg` — users + per-org role assignments
- `Course`, `Chapter`, `Activity`, `ActivityVersion` — content hierarchy
- `Assignment`, `Trail`, `TrailStep`, `Certification` — learning paths
- `Board` — collaborative whiteboard (Yjs doc stored here)
- `Community`, `Discussion` — forums
- `Podcast`, `Episode` — audio content
- `Role` — RBAC role definitions
- `UserGroup`, `UserGroupResource` — bulk access control
- `APIToken` — programmatic access tokens
- `CustomDomain` — domain-to-org resolution
- `CourseEmbeddings` — pgvector embeddings for AI/search

### Conventions
- Every resource has `creation_date` and `update_date` timestamps
- Integer IDs for FK relationships; UUID v4 fields for public APIs (named `*_uuid`)
- JSONB for flexible config (org config, SEO, metadata)
- FK `ondelete="CASCADE"` for data integrity

---

## Frontend Architecture

**Directory**: `apps/web/`

### App Router Layout
- `app/admin/` — admin dashboard
- `app/auth/` — login, register, email verification
- `app/editor/` — course editor
- `app/board/` — board player/editor
- `app/orgs/` — organization pages
- `app/payments/` — Stripe checkout
- `app/home/` — homepage
- `app/embed/` — embeddable content
- `app/api/` — Next.js API routes (proxy to backend)

### Component Structure (`components/`)
- `Admin/` — admin UI
- `Auth/` — auth forms
- `Contexts/` — React Context providers (OrgContext, AuthContext)
- `Copilot/` — AI assistant UI
- `Dashboard/` — layout components
- `Objects/` — domain-specific components (courses, boards, etc.)
- `Pages/` — page-level compositions
- `Payments/` — Stripe payment UI
- `Playground/` — interactive playground
- `ui/` — Shadcn/Radix base components

### Services (`services/`)
One module per API domain (e.g., `services/courses/courses.ts`, `services/ai/ai.ts`). All API calls go through these functions, never inline `fetch` in components.

### State Management
- React Context for cross-app state (auth, org)
- SWR for server state (caching, revalidation, mutations)
- Local `useState`/`useReducer` for component state
- URL params for routing state

### Middleware (`proxy.ts`)
Runs on every request. Handles:
- Custom domain → organization resolution (calls `/api/v1/internal/orgs/resolve/domain`)
- Multi-org subdomain routing
- Instance info caching (30-second TTL)
- Cookie injection for client-side routing

---

## Inter-Service Communication

| From | To | Protocol | Auth |
|---|---|---|---|
| Web | API | HTTP REST | JWT cookie |
| Web | Collab | WebSocket | JWT query param |
| API | Collab | HTTP (internal) | `X-Internal-Key` header |
| API | Stripe | HTTPS webhook | Stripe signature |
| API | Gemini | HTTPS | API key |
| API | Judge0 | HTTPS | API key |
| API | Tinybird | HTTPS | API token |
| API | S3 | HTTPS | AWS credentials |

---

## Environment Variables

### API (`apps/api/.env`)
| Variable | Purpose |
|---|---|
| `LAUNCHLMS_DATABASE_URL` | PostgreSQL DSN |
| `LAUNCHLMS_REDIS_URL` | Redis DSN |
| `LAUNCHLMS_AUTH_JWT_SECRET_KEY` | JWT signing secret (≥ 32 chars) |
| `LAUNCHLMS_DEVELOPMENT_MODE` | Enables dev-only features |
| `LAUNCHLMS_SAAS_MODE` | Enables multi-tenant SaaS mode |
| `LAUNCHLMS_DOMAIN` | API host domain |
| `LAUNCHLMS_FRONTEND_DOMAIN` | Frontend host domain |
| `LAUNCHLMS_ALLOWED_ORIGINS` | CORS origin regex |
| `LAUNCHLMS_PORT` | Server port (default 8000) |
| `GEMINI_API_KEY` | Google Gemini AI key |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `JUDGE0_API_URL` | Judge0 code execution endpoint |
| `TINYBIRD_API_TOKEN` | Tinybird analytics token |
| `RESEND_API_KEY` | Resend email API key |
| `LAUNCHLMS_SYSTEM_EMAIL` | System sender email |
| `AWS_S3_BUCKET` | S3 bucket name (if using S3) |
| `AWS_ACCESS_KEY_ID` | AWS credentials (if using S3) |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials (if using S3) |
| `LAUNCHLMS_INTERNAL_KEY` | Secret for internal API communication |

### Web (`apps/web/.env`)
| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_LAUNCHLMS_API_URL` | API base URL |
| `NEXT_PUBLIC_LAUNCHLMS_WS_URL` | WebSocket URL for collab |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe public key |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry DSN for frontend |

---

## Running Locally

### Dev Environment (Docker)
```bash
# Start PostgreSQL + Redis
docker compose -f .launch-lms/docker-compose.dev.yml up -d

# API
cd apps/api
uv sync
uv run uvicorn src.main:app --reload --port 8000

# Web
cd apps/web
bun install
bun dev

# Collab
cd apps/collab
bun install
bun dev
```

### Database Migrations
```bash
cd apps/api
uv run alembic upgrade head     # apply migrations
uv run alembic revision --autogenerate -m "description"  # create migration
```

### Tests
```bash
cd apps/api
TESTING=true uv run pytest --cov=src tests/
```

---

## Production Build

Multi-stage Dockerfile:
1. Frontend deps (Bun)
2. Frontend build (Next.js standalone)
3. Frontend runtime (Node.js 24)
4. Collab build (TypeScript → Bun)
5. Final image (Python base + all services + Nginx + PM2)

```bash
docker build -t launch-lms .
```

---

## CI/CD (GitHub Actions)

| Workflow | Trigger | What it does |
|---|---|---|
| `api-tests.yaml` | Push/PR to `dev` | `pytest` with coverage |
| `api-lint.yaml` | Push/PR to `dev` | Ruff linting |
| `web-lint.yaml` | Push/PR to `dev` | ESLint |
| `build-community.yaml` | Push to `prod`/`dev`/`main` | Multi-arch Docker build → GHCR |
| `cli-publish.yaml` | Tag push or manual | Publish CLI to npm |
| `release.yaml` | Tag creation | GitHub Release |

**Current working branch**: `dev`

---

## Production Infrastructure

**Infra repo**: `github.com/Life2LaunchLabs/launch-lms-infra`

Deployed on a **DigitalOcean Ubuntu 24.04 Droplet** at `/opt/launch-lms`.

### Stack
- **Caddy** — host systemd service, handles TLS (Let's Encrypt), reverse proxies to `localhost:8080`
- **Launch LMS container** — all-in-one image (`ghcr.io/life2launchlabs/launch-lms:prod`) bound to `127.0.0.1:8080`
- **PostgreSQL** (`pgvector/pgvector:pg16`) — named Docker volume `pgdata`
- **Redis** (`redis:7-alpine`) — named Docker volume `redisdata`, AOF persistence

### Deployment Flow
1. Push to `prod` branch triggers `build-community.yaml` → builds and pushes image to GHCR
2. CI SSHes into droplet and runs `deploy.sh`:
   - `git reset --hard origin/main` (syncs infra config)
   - `docker compose pull` + `docker compose up -d --remove-orphans`
   - `docker image prune -f`
3. Secrets: `DROPLET_HOST`, `DROPLET_USER`, `DROPLET_SSH_KEY` stored as GitHub Actions repo secrets

### Key Config Notes
- All app config via `env_file: .env` (at `/opt/launch-lms/.env`, `chmod 600`)
- `LAUNCHLMS_INTERNAL_API_URL=http://localhost/api/v1/` — **must** use localhost (not the public domain) so server-side Next.js calls hit the internal Nginx directly, avoiding a TLS loop through Caddy
- `LAUNCHLMS_CONTENT_DELIVERY_TYPE` defaults to `filesystem` — uploaded media stored at `/app/api/content` inside the container
- **No volume mount for `/app/api/content`** in the current `docker-compose.yml` — media is lost on redeploy (known issue to fix)

### Known Infrastructure Issue: Media Persistence
The Launch LMS container's `content/` directory (uploaded course photos, thumbnails, etc.) is not mounted as a Docker volume. Every redeploy wipes uploaded media. Fix requires adding to `docker-compose.yml`:
```yaml
services:
  launch-lms:
    volumes:
      - content_data:/app/api/content

volumes:
  content_data:
```
Alternatively, switch to S3 storage (`LAUNCHLMS_CONTENT_DELIVERY_TYPE=s3api`).

---

## Business Domain Concepts

### Plans
`free` → `personal` → `standard` → `pro` → `enterprise`

Plan gating is done via FastAPI dependency injection in route handlers.

### Multi-Tenancy
Every resource belongs to an `Organization`. Orgs have:
- A unique slug (used in URLs)
- Optional custom domain
- Feature flags stored as JSONB in `OrganizationConfig`
- Per-org user roles

### Content Hierarchy
```
Organization
└── Course
    └── Chapter
        └── Activity (lesson)
            └── Blocks (content units)
```

### Access Control
- **Roles** define permissions per org
- **UserGroups** grant bulk access to courses/resources
- **UserRoleWithOrg** links a user to a role within a specific org

---

## Code Conventions

### Backend (Python)
- All DB/IO operations are `async`
- Business logic lives in `src/services/<domain>/`, not in routers
- Route handlers use `Depends(...)` for auth, plan checks, and DB sessions
- DTOs: separate `*Create`, `*Read`, `*Update` models for each entity
- Error responses: `raise HTTPException(status_code=..., detail={...})`
- Never put business logic in models — use service functions

### Frontend (TypeScript)
- All API calls go through service functions in `services/` — never inline `fetch` in components
- Use SWR for data that needs caching/revalidation
- Use React Context for org/auth state, not prop drilling
- Component files: PascalCase; utility files: camelCase
- Never access `window`/`document` during SSR — use `useEffect` or dynamic imports

### General
- UUIDs are public identifiers in APIs; integer IDs are internal DB PKs
- Timestamps on every model: `creation_date`, `update_date`
- Configs are JSON/JSONB blobs — add fields to config models, not new columns, for feature flags

---

## Key Files to Know

| File | Purpose |
|---|---|
| `apps/api/src/main.py` | FastAPI app factory, router registration |
| `apps/api/src/security/auth.py` | JWT auth, user resolution |
| `apps/api/config/config.py` | All config models and env var loading |
| `apps/api/src/db/models/` | All SQLModel table definitions |
| `apps/api/src/routers/` | Route handlers (one file per domain) |
| `apps/api/src/services/` | Business logic (one dir per domain) |
| `apps/api/src/tests/conftest.py` | Test fixtures, DB setup |
| `apps/web/proxy.ts` | Next.js middleware (multi-org routing) |
| `apps/web/app/` | Next.js App Router pages |
| `apps/web/components/Contexts/` | OrgContext, AuthContext |
| `apps/web/services/` | API client functions |
| `apps/collab/src/index.ts` | Hocuspocus server setup |
| `docker/start.sh` | Production entrypoint (PM2) |
| `docker/nginx.conf` | Reverse proxy config |
