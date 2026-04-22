# Routing Internals

This directory contains the shared routing implementation for `apps/web`.

Use this README when changing the routing system itself. For the broader app
baseline, see [`apps/web/README.md`](../../README.md).

## Modules

- [`paths.ts`](./paths.ts)
  Shared route manifest and path builders

- [`context.ts`](./context.ts)
  Host and org resolution helpers

- [`cookies.ts`](./cookies.ts)
  Canonical routing cookie names and cookie-scoping helpers

- [`requestPolicy.ts`](./requestPolicy.ts)
  Pure request-routing policy returning `RoutingDecision`

- [`__tests__/routing.test.ts`](./__tests__/routing.test.ts)
  Unit tests for routing behavior

## Design Contract

The routing layer is designed around one pure decision point:

```ts
resolveRequestRouting(input): RoutingDecision
```

The decision object is intentionally framework-agnostic. It should encode:

- action: `next | rewrite | redirect`
- destination
- cookies to set
- headers to set

`proxy.ts` is responsible for adapting that decision into `NextResponse`.

## Tenant-First Contract

This routing layer assumes tenant-first hosting.

The non-negotiable rules are:

- Host determines tenant context.
- Session/auth cookies determine user identity.
- Backend authorization determines whether that user may act in that tenant.

Routing must not treat a cookie-stored org slug as the active tenant on the
main host. If the request is on the main frontend domain, the resolved org is
the default org. If the request is on a subdomain or mapped custom domain, the
resolved org comes from that host.

## Context Contract

`resolveOrgHostContext(...)` is the shared answer to:

- what host are we on?
- is this main, subdomain, or custom-domain mode?
- what org slug is currently resolved?

Everything else should compose on top of that instead of recomputing host logic.

The current context contract is:

- `main` host mode always resolves to `defaultOrgSlug`
- `subdomain` host mode resolves to `subdomainOrgSlug`
- `custom` host mode resolves to `resolvedCustomDomainOrgSlug`
- `subdomainAllowed` is additional host-policy metadata, not a source of org
  identity

The context object may still expose legacy fields for compatibility, but new
logic must not rely on org cookies for tenant selection.

## Builder Contract

`paths.ts` should be the single place where route shapes are declared.

Rules:

- builders return pathnames, not fully-qualified URLs
- builders should encode path params explicitly
- query strings should go through `withQuery(...)`
- new core navigation surfaces should get a named builder instead of relying on
  string interpolation in the caller

If you find repeated patterns like:

```ts
`/dash/resources/${id}/general`
```

that is usually a sign a builder should exist.

## Policy Contract

`requestPolicy.ts` owns request-time behavior such as:

- admin host migration
- auth page rewriting
- guest/public access exceptions
- editor rewrites
- sitemap, robots, and feed rewrites
- custom-domain rewriting to internal org routes
- org-subdomain eligibility enforcement

The current policy-specific tenant-first rules are:

- Main-host requests rewrite into `/orgs/{default_org}/...`
- Main-host requests do not redirect onto another org because of org cookies
- Subdomain requests use the subdomain slug as tenant context
- Custom-domain requests use the resolved domain mapping as tenant context
- Non-entitled org subdomains are redirected back to the main host for learner
  routes
- Auth routes rewrite to `/auth/*`, but branding is resolved separately from
  host or explicit token context

## Cookie Contract

`cookies.ts` still centralizes cookie names, but cookie responsibilities are
now narrower:

- session cookies: identity only
- env/runtime cookies: frontend domain, top domain, default org, multi-org mode
- custom-domain cookie: host-context helper when already browsing a mapped
  custom domain

The org slug cookies are no longer routing inputs. Do not reintroduce them as
fallback sources in request policy, host resolution, or auth-page branding.

Avoid moving this logic back into `proxy.ts`.

## Change Checklist

When editing this folder:

1. Keep request policy pure
2. Keep host resolution centralized
3. Prefer adding builders over duplicating strings
4. Update tests when behavior changes
5. Update `apps/web/README.md` if the routing baseline changes
