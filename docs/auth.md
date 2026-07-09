# Authentication providers

How users sign in beyond email + password: social Google OAuth and per-org
enterprise SSO. These are two separate systems — configure the one that fits.

| | Social Google OAuth | Enterprise SSO |
| --- | --- | --- |
| Who uses it | Anyone with a Google account | Members of one org, via that org's IdP |
| Where configured | Env vars (platform-wide) | Org admin UI → SSO (per org) |
| Plan gating | None | Enterprise plan only |
| Providers | Google | WorkOS, or any OIDC IdP (Google Workspace, Microsoft Entra, Okta, Keycloak, ...) |
| Shown as | "Continue with Google" on signup/login | SSO button on the org's login page |

Users created by either path get `email_verified = true` (the identity
provider vouches for the mailbox), so they skip the email verification flow
described in [email.md](email.md).

## Social Google OAuth

Implemented in `apps/web/app/api/auth/google/` (authorize + token exchange)
with the browser callback at `/auth/callback/google`. Disabled unless
`LAUNCHLMS_AUTH_OAUTH_ENABLED=true`.

### Environment variables

| Variable | Used by | Notes |
| --- | --- | --- |
| `LAUNCHLMS_AUTH_OAUTH_ENABLED` | API, web | `true` to show and allow Google sign-in. Default `false`. |
| `LAUNCHLMS_GOOGLE_CLIENT_ID` | web | OAuth client ID from Google Cloud Console. |
| `LAUNCHLMS_GOOGLE_CLIENT_SECRET` | web | OAuth client secret. Server-side only. |

In development the client ID/secret belong in `apps/web/.env` (the Next.js
server routes do the token exchange); the enable flag is read by both apps, so
set it in `apps/web/.env` and `apps/api/.env`. In production all three go in
the deployment `.env`.

### Initial setup

1. Create a project at [console.cloud.google.com](https://console.cloud.google.com).
2. **OAuth consent screen**: user type **External**; set app name, support
   email, and app domain. Publish to production — only the non-sensitive
   `openid email profile` scopes are used, so no Google verification review is
   required. Do not leave it in Testing mode (100-user cap).
3. **Credentials → Create OAuth client ID**, type **Web application**:
   - Authorized JavaScript origins: `https://<frontend-domain>`
   - Authorized redirect URIs: `https://<frontend-domain>/auth/callback/google`
   - For local testing add `http://localhost:3000/auth/callback/google`
     (Google accepts plain `http` only for `localhost`).
4. Set the env vars above and restart.
5. Test: the signup/login pages show the Google button.

A `redirect_uri_mismatch` error from Google means the registered redirect URI
does not exactly match what the app sent — the error page shows the sent value.

## Enterprise SSO

Per-organization SSO for orgs on the **enterprise plan**. Backend in
`apps/api/src/services/sso/` (router prefix `/auth/sso`), org-facing settings
in the org admin UI, login callback page at `/auth/sso/callback`.

Each org gets an `SSOConnection` row storing the provider choice, allowed
email domains, auto-provisioning settings, default role, and provider
credentials (note: credentials are stored as plaintext JSON in the database).
Users are auto-provisioned on first SSO login.

### Providers

- **`custom_oidc`** — direct OIDC connection to any compliant IdP. Configured
  per org in the admin UI with: issuer URL, client ID, client secret, scopes
  (default `openid email profile`). No platform-level env vars needed.
- **`workos`** — [WorkOS](https://workos.com) as an SSO aggregator (useful for
  SAML IdPs). Requires platform-wide `WORKOS_API_KEY` and `WORKOS_CLIENT_ID`.

### Environment variables

| Variable | Used by | Notes |
| --- | --- | --- |
| `SSO_REDIRECT_URI` | API | Full callback URL registered with the IdP, e.g. `https://<frontend-domain>/auth/sso/callback`. Set explicitly — the fallback built from `LAUNCHLMS_DOMAIN` lacks a scheme. |
| `WORKOS_API_KEY` | API | Only for the WorkOS provider. |
| `WORKOS_CLIENT_ID` | API | Only for the WorkOS provider. |

### Initial setup (custom OIDC)

1. Put the org on the **enterprise plan** (superadmin → org management). Both
   configuration and login are refused otherwise.
2. Set `SSO_REDIRECT_URI` in the deployment `.env` and restart.
3. Register an application at the identity provider with that exact redirect
   URI; collect issuer URL, client ID, and client secret.
4. Org admin UI → SSO: choose **Custom OIDC**, enter the three values,
   optionally restrict allowed email domains and set a default role, enable.
5. Test from the org's login page — the SSO button appears when enabled.

### Known limitations

- In-flight SSO login state (`state` parameter) is held in API process memory,
  not Redis: an API restart invalidates logins in progress, and state is fine
  only while the API runs a single worker.
- The post-login redirect URL is built as `https://{org_slug}.{domain}/...`,
  which assumes per-org subdomain routing. Verify on first test if the org is
  served on the apex domain.
