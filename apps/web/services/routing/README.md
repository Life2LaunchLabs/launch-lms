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

## Context Contract

`resolveOrgHostContext(...)` is the shared answer to:

- what host are we on?
- is this main, subdomain, or custom-domain mode?
- what org slug is currently resolved?

Everything else should compose on top of that instead of recomputing host logic.

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
- org-subdomain redirect behavior

Avoid moving this logic back into `proxy.ts`.

## Change Checklist

When editing this folder:

1. Keep request policy pure
2. Keep host resolution centralized
3. Prefer adding builders over duplicating strings
4. Update tests when behavior changes
5. Update `apps/web/README.md` if the routing baseline changes
