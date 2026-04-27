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

## Tenant-First Hosting Baseline

`apps/web` now follows a tenant-first hosting model.

That means:

- The request host is the source of truth for tenant context.
- Auth cookies identify the user only. They do not select the active org.
- Switching orgs is navigation to another host, not mutation of a global
  "current org" cookie.

The expected mappings are:

- Main/default host
  Always resolves to the default org.

- Org subdomain
  Resolves to that org if subdomain-hosted learner/auth access is allowed for
  that org.

- Custom domain
  Resolves to the org mapped to that domain.

The main host must never impersonate the last visited org because of cookie
state. If a user visits `acme.example.com` and later returns to
`example.com/login`, the auth experience must still be branded for the default
org.

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
- Editor and board route rewrites
- Feed, sitemap, and robots rewrites
- Stripe OAuth callback normalization
- Custom-domain rewriting into internal `/orgs/[orgslug]/...` page space

The current tenant-first rule is:

- Main-host requests rewrite into the default org's internal page tree.
- Subdomain requests rewrite into that subdomain org's internal page tree.
- Custom-domain requests rewrite into the mapped org's internal page tree.
- Main-host requests do not redirect onto another org because of prior cookie
  state.

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
  Always resolves to the default org.

- `subdomain`
  Requests on an org subdomain, such as `acme.life2launch-core.com`.
  The subdomain slug is the resolved org.

- `custom`
  Requests on a mapped custom domain. The backend resolves the custom domain to
  an org slug, and the request is internally rewritten into `/orgs/[orgslug]`.

### Auth Branding Rules

Auth page branding must be explicit and predictable:

- Login, signup, and forgot-password pages use host-derived org context.
- Reset-password and verify-email pages may use token-derived org context when
  the token carries org identity.
- Main-host auth pages must brand as the default org unless a token explicitly
  points at another org.

This is why auth pages should use the explicit helpers in
[`services/org/orgResolution.ts`](./services/org/orgResolution.ts) rather than
reading org cookies directly.

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

In practice, runtime cookies now fall into two groups:

- Identity/session cookies
  Auth/session state only. These identify the user and support refresh.

- Environment cookies
  Default org slug, frontend domain, top domain, multi-org mode, and custom
  domain context when needed.

The org-slug cookies are no longer part of request routing or auth-page
branding. They may still exist for compatibility, but new code must not treat
them as the active tenant.

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

## Container Breakpoints

Some learner and dashboard pages need to react to the width of the content
column they actually receive, not just the browser viewport. That is especially
important when sidebars, drawers, or nested layouts can shrink the usable space
without changing `window.innerWidth`.

For these cases, `apps/web` now provides a reusable container-breakpoint
framework in
[`components/Contexts/ContainerBreakpointContext.tsx`](./components/Contexts/ContainerBreakpointContext.tsx).

### When To Use It

- Use viewport breakpoints when the whole page should respond to screen size.
- Use container breakpoints when a component should respond to the width of its
  own content area.

Typical use cases:

## Learner Dashboard Quickstart

The signed-in org home page supports org-specific learner quickstart cards
through the existing landing customization flow in
[`components/Dashboard/Pages/Org/OrgEditLanding/OrgEditLanding.tsx`](./components/Dashboard/Pages/Org/OrgEditLanding/OrgEditLanding.tsx).

Quickstart is implemented as a landing section type, not as a separate config
system. The section shape lives in
[`components/Dashboard/Pages/Org/OrgEditLanding/landing_types.ts`](./components/Dashboard/Pages/Org/OrgEditLanding/landing_types.ts)
and the learner-side rendering lives in
[`components/Landings/QuickstartSection.tsx`](./components/Landings/QuickstartSection.tsx).

Important behavior:

- A quickstart section can contain up to three cards.
- Each card can target either a primary learner feature or a specific
  collection, community, or resource channel.
- Learner rendering resolves targets against the org's current accessible
  content and silently drops cards whose target no longer exists. That keeps
  stale config from surfacing broken dashboard links.
- Resource-channel quickstart cards deep-link into the resources experience via
  `?channel=<uuid>`, so the resources page should preserve support for that
  query param when its state model changes.

- learner detail pages beside sidebars
- dashboard panels inside resizable shells
- grids and charts that live inside nested cards or panes

### API

Wrap the area you want to measure with `ContainerBreakpointProvider`:

```tsx
<ContainerBreakpointProvider
  breakpoints={{
    stacked: 0,
    split: 980,
    spacious: 1240,
  }}
  className="pt-2"
>
  <CourseDetailResponsiveSection />
</ContainerBreakpointProvider>
```

Inside any descendant, call `useContainerBreakpoints()`:

```tsx
const { width, current, is, atLeast, below, between } = useContainerBreakpoints()

const showSplitLayout = atLeast('split')
const showLargeMedia = atLeast('spacious')
```

The hook returns:

- `width`: current measured container width in pixels
- `current`: the active named breakpoint
- `is(name)`: exact active-breakpoint match
- `atLeast(name)`: width is at or above that breakpoint
- `below(name)`: width is below that breakpoint
- `between(minName, maxName)`: width is between two named breakpoints

### Recommended Pattern

Define breakpoint names around layout intent, not device types.

Prefer:

- `stacked`
- `split`
- `spacious`
- `dense`

Avoid:

- `tablet`
- `desktop`
- `ultrawide`

This keeps the logic tied to available space rather than assumptions about the
viewport.

### Reference Example

The course detail page now uses container breakpoints in
[`app/orgs/[orgslug]/(withmenu)/course/[courseuuid]/course.tsx`](./app/orgs/%5Borgslug%5D/%28withmenu%29/course/%5Bcourseuuid%5D/course.tsx)
so the info panel vs chapter-accordion layout switches based on content-column
width instead of a hard viewport breakpoint.

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

`getUriWithOrg` should be thought of as a host-policy-aware URL builder:

- default org -> main host
- eligible org -> org subdomain
- custom-domain browsing context -> current origin when already on the mapped
  host

It should not infer tenant from org cookies.

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

Auth/session rules:

- Session cookies identify the user, not the tenant.
- A logged-in user can belong to multiple orgs.
- Membership/admin checks are always scoped to the org resolved from the host or
  resource being accessed.
- Cross-org admin switching should happen by navigating to that org's host.

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
