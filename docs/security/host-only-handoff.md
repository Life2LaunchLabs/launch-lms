# Host-only organization session handoff

This is a prerequisite for the nested unstable hostname, **not cutover approval**.
It activates only with `NEXT_PUBLIC_LAUNCHLMS_COOKIE_SCOPE=host-only` and
`LAUNCHLMS_COOKIE_SCOPE=host-only`. The configured frontend domain is the
environment root (`unstable.life2launch.app` for nested unstable); the protocol
only accepts that host and one direct organization label beneath it. Custom
domains and links across environments do not receive a session handoff.

An authenticated cross-org link goes to the destination's start route. That
route sets a short-lived, host-only, HttpOnly state cookie, then sends the browser
to the source host. The source confirms its refresh cookie and user, stores a
random one-use ticket in Redis for 60 seconds, and submits the ticket to the
destination in a POST form. The form has a constrained `form-action` CSP, a
hashed auto-submit script, `no-store`, and no-referrer headers. The destination
requires the state cookie, consumes the ticket atomically, and sets fresh
host-only access/refresh cookies before redirecting to a validated local path.
No access or refresh token moves through a URL, browser-readable storage, or the form.
Redis loss fails closed; the user may still sign in directly on the destination.

Focused automated checks cover exact managed hosts, nested/wrong-environment
rejection, local return paths, host-only mode, token issuance, and replay. Before
enabling the topology's `session_handoff_verified` flag, run real browser checks
for credentials login, Google and enterprise SSO, member and admin org links,
direct links, logout, expired/used tickets, phone navigation, and disabled
JavaScript. Verify that no ticket or credential appears in URLs, history,
referrer headers, access logs, or analytics. Keep the flag false until these
checks and rollback are documented.

Existing `Domain=.life2launch.app` cookies are a **separate migration gate**:
the first request to nested unstable can still carry a legacy shared cookie.
Expire legacy parent-domain auth cookies on the existing hosts and verify their
absence in a real browser before nested traffic is enabled. Do not infer that
setting new host-only cookies removed an older parent-domain cookie.
