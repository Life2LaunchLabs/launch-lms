# Email

How Launch LMS sends transactional email (account verification, welcome,
password reset), and how to set it up from scratch.

## How it works

The API never delivers mail itself. All emails go through a single sender in
`apps/api/src/services/email/utils.py` (`send_email`), which hands the message
to one of two providers based on `LAUNCHLMS_EMAIL_PROVIDER`:

- **`resend`** (default) — calls the [Resend](https://resend.com) HTTPS API.
- **`smtp`** — speaks SMTP to any mail server (a company relay, Mailpit for
  local dev, etc.).

Email templates (HTML) live in `apps/api/src/services/users/emails.py`. The
logo SVG at the top of that file is a placeholder — replace it when branding.

Emails currently sent:

| Email | Trigger |
| --- | --- |
| Verify your email | Signup, when email verification is enabled |
| Welcome | OAuth signup, or any signup when verification is disabled |
| Reset your password | Password reset request |

## Environment variables

| Variable | Notes |
| --- | --- |
| `LAUNCHLMS_EMAIL_PROVIDER` | `resend` (default) or `smtp`. |
| `LAUNCHLMS_SYSTEM_EMAIL_ADDRESS` | Sender address, e.g. `noreply@support.example.com`. Must be on a domain verified with the provider. |
| `LAUNCHLMS_RESEND_API_KEY` | Resend API key (`re_...`). Required for the `resend` provider. |
| `LAUNCHLMS_SMTP_HOST` | SMTP server host. Required for the `smtp` provider. |
| `LAUNCHLMS_SMTP_PORT` | SMTP port. Default `587`. |
| `LAUNCHLMS_SMTP_USERNAME` | SMTP login. Optional (Mailpit needs none). |
| `LAUNCHLMS_SMTP_PASSWORD` | SMTP password. Optional. |
| `LAUNCHLMS_SMTP_USE_TLS` | STARTTLS. Default `true`; set `false` for local Mailpit. |
| `LAUNCHLMS_REQUIRE_EMAIL_VERIFICATION` | `true` to require new accounts to verify their email before logging in. Default `false`. |

Set these in `apps/api/.env` for development, or in the deployment `.env`
(`/opt/launch-lms/.env` on the droplet) for production. The API reads them at
request time via `get_launchlms_config`, but restart after changes to be safe.

## Initial setup (Resend, production)

1. Create a free account at [resend.com](https://resend.com) (100 emails/day,
   3,000/month on the free tier).
2. In the Resend dashboard, **Domains → Add Domain**. Use a subdomain dedicated
   to sending, e.g. `support.life2launch-core.com` — Resend recommends this and
   it isolates sending reputation from the root domain.
3. Resend shows DNS records (SPF + DKIM). Add them wherever the domain's DNS is
   managed, then click **Verify**. Note: verifying the root domain does not
   cover subdomains — verify the exact domain the sender address uses.
4. Add a DMARC record on the **root** domain (it covers subdomains). Gmail's
   sender guidelines expect one and its absence hurts inbox placement:

   ```
   Name:  _dmarc.life2launch-core.com
   Type:  TXT
   Value: v=DMARC1; p=none;
   ```

5. **API Keys → Create API Key**, copy the `re_...` value.
6. Set the env vars and restart the API:

   ```bash
   LAUNCHLMS_EMAIL_PROVIDER=resend
   LAUNCHLMS_RESEND_API_KEY=re_...
   LAUNCHLMS_SYSTEM_EMAIL_ADDRESS=noreply@support.life2launch-core.com
   LAUNCHLMS_REQUIRE_EMAIL_VERIFICATION=true
   ```

7. Sign up with a test account and confirm the verification email arrives and
   the link works.

## Local development without Resend

Run [Mailpit](https://mailpit.axllent.org/) — a fake SMTP server with a web
inbox — and point the API at it:

```bash
docker run -d -p 1025:1025 -p 8025:8025 axllent/mailpit
```

```bash
# apps/api/.env
LAUNCHLMS_EMAIL_PROVIDER=smtp
LAUNCHLMS_SMTP_HOST=localhost
LAUNCHLMS_SMTP_PORT=1025
LAUNCHLMS_SMTP_USE_TLS=false
LAUNCHLMS_SYSTEM_EMAIL_ADDRESS=noreply@localhost.test
LAUNCHLMS_REQUIRE_EMAIL_VERIFICATION=true
```

Every email the app sends appears in the Mailpit UI at
[http://localhost:8025](http://localhost:8025). Nothing leaves the machine.

## Email verification flow

With `LAUNCHLMS_REQUIRE_EMAIL_VERIFICATION=true`:

- Signup creates the user with `email_verified = false` and emails a one-time
  verification link (token stored in Redis, 1-hour TTL, single use).
- The link opens `/verify-email` on the frontend, which calls
  `POST /api/v1/auth/verify-email`.
- `POST /api/v1/auth/login` rejects unverified users with an
  `EMAIL_NOT_VERIFIED` error; the login page shows a resend button.
- `POST /api/v1/auth/resend-verification` re-sends the link (rate limited).

Both signup paths are gated:

- The classic form (`POST /auth/signup`) does not log the user in until
  verified.
- The guest-onboarding flow (`POST /auth/signup/welcome`) withholds the session
  and returns a one-time **claim token** instead. The signup tab shows a "check
  your email" screen and polls `POST /auth/signup/welcome/claim` with the token
  (stored in Redis, 1-hour TTL, single use); once the email is verified the
  claim resolves, the session cookies are issued, and the tab continues into
  the onboarding activity automatically — the verification tab just says "you
  can safely close this window". Guest activity progress is transferred to the
  new account at signup. If the signup tab was closed or the claim expired, the
  fallback is a normal login, which resumes onboarding via the login `next`
  parameter.

Exceptions: OAuth and SSO signups are auto-verified (see [auth.md](auth.md)).
Accounts created while the flag was off keep any session they already have —
the gate applies at login.

## Troubleshooting

- **No email arrives** — check the API log: send failures are logged as
  `Failed to send verification email to ...` with a stack trace. Common causes:
  missing/invalid API key, sender address not on the verified domain.
- **Lands in spam** — a brand-new sending domain has no reputation; the first
  emails often land in spam even with correct DNS. In Gmail, open the message →
  "Show original" and check `SPF`, `DKIM`, `DMARC` all say PASS. If they pass,
  it is reputation and resolves with normal sending volume; mark the message
  "Not spam". If DKIM fails, DNS has not propagated yet or the wrong domain was
  verified.
- **Verification link rejected** — tokens expire after 1 hour and are single
  use; use the resend button. Redis must be reachable (tokens live there).
- **Link points at the wrong host** — the base URL comes from the request
  Origin validated against `LAUNCHLMS_ALLOWED_ORIGINS`, falling back to
  `LAUNCHLMS_FRONTEND_DOMAIN`. Check both in the deployment env.
