# Launch LMS architecture

## System map

| Area | Path | Responsibility |
| --- | --- | --- |
| Web | `apps/web` | Next.js interface, tenant routing, browser integrations |
| API | `apps/api` | FastAPI boundaries, domain services, persistence, migrations |
| Collaboration | `apps/collab` | Hocuspocus/Yjs real-time document transport |
| CLI | `apps/cli` | Local development and self-hosted instance operations |
| Release image | `Dockerfile`, `docker/` | One immutable Web/API/Collab/Nginx artifact |
| Verification | `scripts/ci`, `scripts/ui` | Release contract, image smoke, browser fixtures |

Hosted environment state and deployment execution are external. The application
publishes an immutable candidate manifest; protected operations workflows pin and
deploy its exact digest. Self-hosting remains application-owned.

## Dependency direction

API request boundaries validate input and delegate to services. Services own
business behavior and use database/integration modules; database modules do not
depend on routers or web concerns. Auth, audit, and configuration enter through
explicit shared boundaries.

Web routes and server components stay thin. Routing/configuration modules own URL
and tenant decisions, service modules own HTTP contracts, reusable components own
interaction patterns, and feature components compose them. Cross-service contracts
are HTTP/WebSocket protocols and persisted schemas, not package imports.

## Data and trust boundaries

- PostgreSQL is durable application state; Redis is ephemeral coordination.
- Organization context comes from the request host, not a current-org cookie.
- Browser credentials never cross into the operations platform.
- Production secrets and deploy credentials do not enter source, images, evidence,
  or application databases.
- Browser automation uses isolated synthetic data, never production copies.

Architecture checks ratchet existing debt: new violations fail while known legacy
exceptions stay visible in `docs/quality/`. Improve this map or encode a rule when
a boundary is unclear; do not rely on session memory.
