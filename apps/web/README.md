# `apps/web`

This app uses the Next.js App Router, but routing behavior is not defined by the
filesystem alone. Request routing, host and org resolution, URL generation, and
UI navigation are all part of the routing system.

This README is the baseline for how routing is expected to work today. If we
find inconsistencies later, this is the document we should compare them against.

## Routing Model

Routing in `apps/web` is split into four layers:

1. Filesystem routes under [`app/`](./app)
   These define the internal page contracts and server component entrypoints.

2. Request-time routing policy in [`proxy.ts`](./proxy.ts)
   This decides whether a request should `next`, `rewrite`, or `redirect`
   before the App Router sees it.

3. Shared routing modules under [`services/routing/`](./services/routing)
   These resolve host and org context, define request-routing policy, and expose
   the shared route manifest used by the UI.

4. Runtime URL helpers in [`services/config/config.ts`](./services/config/config.ts)
   These expose `routePaths`, `getUriWithOrg`, and runtime API/domain config to
   the rest of the app.

The main rule is:

- Filesystem routes describe internal implementation.
- `proxy.ts` and `services/routing/requestPolicy.ts` decide how requests map
  onto those internals.
- Components and pages should generate links with `routePaths` and
  `getUriWithOrg`, not with raw path strings.

## Source Of Truth

Each routing concern should have one primary owner:

- Request resolution:
  [`services/routing/requestPolicy.ts`](./services/routing/requestPolicy.ts)

- Host and org context resolution:
  [`services/routing/context.ts`](./services/routing/context.ts)

- Route manifest and path builders:
  [`services/routing/paths.ts`](./services/routing/paths.ts)

- Runtime config and absolute URL generation:
  [`services/config/config.ts`](./services/config/config.ts)

- Next.js adapter between requests and routing decisions:
  [`proxy.ts`](./proxy.ts)

If a routing bug is found, first determine which of these concerns owns it
before making changes.

## Request Routing

The incoming request flow is:

1. `proxy.ts` fetches instance info from the backend or uses local fallback.
2. It resolves custom-domain info and limited org-subdomain access state.
3. It calls `resolveRequestRouting(...)`.
4. The returned `RoutingDecision` is applied as a `next`, `rewrite`, or
   `redirect`, plus any cookies and headers.

`proxy.ts` should stay thin. It is an adapter, not the place to encode new
 routing rules.

### What The Request Policy Handles

The request policy currently owns:

- Main-domain vs org-subdomain vs custom-domain request handling
- Multi-org vs single-org behavior
- Admin-host migration behavior
- Auth page rewriting to `/auth/*`
- Public course and guest-access exceptions
- Dashboard redirects onto org subdomains when needed
- Editor and board route rewrites
- Feed, sitemap, and robots rewrites
- Stripe OAuth callback normalization
- Custom-domain rewriting into internal `/orgs/[orgslug]/...` page space

Behavior changes should normally be made in
[`services/routing/requestPolicy.ts`](./services/routing/requestPolicy.ts),
then verified with routing tests.

## Org And Host Resolution

All "where am I?" logic should flow through
[`services/routing/context.ts`](./services/routing/context.ts).

The shared host context resolves:

- `hostMode`: `main | subdomain | custom`
- `resolvedOrgSlug`
- `subdomainOrgSlug`
- `defaultOrgSlug`
- whether the request is on localhost
- whether the request is on a custom domain
- whether the resolved org is the owner org

### Expected Host Modes

- `main`
  Requests on the main frontend domain, such as `life2launch-core.com`.
  Org resolution falls back to cookie or default org.

- `subdomain`
  Requests on an org subdomain, such as `acme.life2launch-core.com`.
  The subdomain slug is the resolved org.

- `custom`
  Requests on a mapped custom domain. The backend resolves the custom domain to
  an org slug, and the request is internally rewritten into `/orgs/[orgslug]`.

### Reserved Subdomains

Reserved subdomains are defined in
[`services/routing/context.ts`](./services/routing/context.ts) and currently
include:

- `auth`
- `www`
- `api`
- `admin`

These are not treated as org slugs.

## Cookie Baseline

Routing cookies are centralized in
[`services/routing/cookies.ts`](./services/routing/cookies.ts).

The important rules are:

- One canonical cookie name per concept
- Temporary backward-compatible reads are allowed
- New writes should go through the canonical helpers

In practice, routing uses cookies for:

- current org slug
- legacy org slug compatibility
- multi-org mode
- default org slug
- frontend domain
- top domain
- custom domain context

Do not invent new ad hoc cookie names in components or page files.

## URL Generation

The shared route manifest lives in
[`services/routing/paths.ts`](./services/routing/paths.ts) and is re-exported
from [`services/config/config.ts`](./services/config/config.ts) as
`routePaths`.

This is the baseline rule for navigation:

- Use `routePaths` to build a pathname
- Use `getUriWithOrg(orgslug, path)` when the final URL must be org-aware

Examples:

```ts
routePaths.org.course(courseUuid)
routePaths.org.courseActivity(courseUuid, activityId)
routePaths.org.dash.courseSettings(courseUuid, 'general')
routePaths.org.communityDiscussion(communityUuid, discussionUuid)
routePaths.org.store.offer(offerUuid)
```

### When To Use `routePaths` Only

Use a route builder by itself when the destination is intentionally relative and
host context does not need to be re-derived.

Common examples:

- internal redirect targets
- static path comparisons
- page-local navigation within already-resolved dashboard context

### When To Use `getUriWithOrg`

Use `getUriWithOrg(orgslug, routePaths...)` when a component needs a link that
must respect owner-org, subdomain, or custom-domain behavior.

Common examples:

- links rendered in UI components
- redirects after user actions
- links in cards, menus, sidebars, and cross-surface CTAs

The previous helper modules under `services/org/` that wrapped owner-org or
admin-entry URLs have been removed. New code should call
`getUriWithOrg(..., routePaths...)` directly.

### What To Avoid

Do not do this:

```ts
getUriWithOrg(orgslug, '') + `/course/${courseUuid}/activity/${activityId}`
```

Do this instead:

```ts
getUriWithOrg(orgslug, routePaths.org.courseActivity(courseUuid, activityId))
```

Avoid:

- raw `'/dash/...'` strings in components
- raw `'/course/...'` string concatenation
- rebuilding org-aware URLs by hand
- duplicating route patterns across menus, cards, and redirect pages

## Filesystem Route Expectations

The `app/` tree still matters, but it is not the public API by itself.

Important distinction:

- Public URLs are what users and components should target via `routePaths`
- Internal implementation paths may include details like `/orgs/[orgslug]/...`
  that should usually remain hidden behind proxy rewrites

For example, custom-domain and org-aware requests may end up rewritten into
internal page trees under `app/orgs/[orgslug]/...`, but components should not
generally hardcode those internal paths.

## Redirect Baseline

Redirects should follow these rules:

- Page-level redirects should use shared route builders
- Redirects should not manually reconstruct org-aware paths
- Internal implementation paths should not leak into UI-level redirect logic

If a page redirects to "general", "settings", "content", and similar tabs, use
the relevant builder from `routePaths`.

## Auth And Guest Access

The request policy intentionally treats a few paths as public or semi-public.

Current baseline:

- Auth pages are rewritten under `/auth/*`
- Guest and onboarding paths are allowed without a session
- Public course paths are allowed without a session
- Other unauthenticated requests are redirected to `/welcome`

If authentication behavior changes, update both the request policy and this
README.

## API URL Baseline

Browser API requests should prefer same-origin proxying through `/api/v1/...`
when a direct backend origin would be cross-origin or would downgrade HTTPS.

The same principle now applies to uploaded media and asset delivery:

- browser media requests should default to same-origin `/content/...`
- `NEXT_PUBLIC_LAUNCHLMS_MEDIA_URL` is only for explicit external media hosting
- falling back to a raw backend origin in the browser is not the default path
  because it can break on HTTPS, custom domains, or internal-only backend hosts

API origin selection is handled in
[`services/config/config.ts`](./services/config/config.ts).

The important behavior is:

- Server-side code should use absolute API URLs
- Client-side code should prefer same-origin `/api/v1/` when the configured API
  origin would be cross-origin or would downgrade HTTPS
- Custom-domain traffic should proxy API requests through same-origin `/api/v1/`

This protects production HTTPS pages from mixed-content bugs and keeps browser
requests aligned with the current host.

## Testing And Verification

Routing behavior should be verified in three ways:

1. Routing policy unit tests
   [`services/routing/__tests__/routing.test.ts`](./services/routing/__tests__/routing.test.ts)

2. Type safety
   `./node_modules/.bin/tsc --noEmit`

3. Grep-based regression checks
   Search for raw `'/dash'`, `'/course/'`, `'/community/'`, and similar path
   literals in `app/` and `components/` when doing migration work

The dedicated routing test command is:

```bash
npm run test:routing
```

## Practical Rules For Future Changes

When adding or changing a route:

1. Add or update the route builder in `services/routing/paths.ts`
2. Use that builder from components and pages
3. If request behavior changes, update `services/routing/requestPolicy.ts`
4. If org or host resolution changes, update `services/routing/context.ts`
5. Add or update routing tests
6. Update this README if the baseline behavior changed

When fixing an inconsistency:

1. Identify whether the bug is request routing, host resolution, URL generation,
   or UI navigation
2. Fix the owning layer first
3. Remove any duplicated local workaround if possible

## Current Migration Status

The project has been migrated substantially onto the shared route manifest and
request-routing policy, but the guiding intent is larger than any single pass:

- request routing should stay centralized
- org resolution should stay centralized
- path generation should stay centralized
- UI navigation should use builders instead of literals

If a future PR starts spreading raw path strings again, that should be treated
as drift from the current routing baseline.
