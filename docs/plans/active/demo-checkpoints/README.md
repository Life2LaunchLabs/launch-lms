# Disposable demo checkpoints

Owner authorization: conversation on 2026-10-06, “design it; build it”.
Delivery branch: feat/disposable-demo-checkpoints. Jira configuration is unavailable;
link this plan and the verification report to a BOT Story/workpad when access returns.

## Outcome and decisions

A platform admin enters a designated real live user through the normal application,
then manually publishes an immutable checkpoint. Each visitor starts a private,
disposable copy at the demo entry point. Publishing never changes existing sessions.
Target: 200 concurrent sessions, configurable admission control. Badges, assigned
plans and real AI remain functional. No persistent countdown; warn five minutes
before expiry and allow extension. Reset/end revoke old access, including other tabs.
Reset and extension preserve abuse/spend accounting. External effects are explicitly
simulated or visibly unavailable. Never change ordinary account behavior.

## Design readiness

Existing code target: CandidateToolbar/CandidateExperience and adopted Button,
Popover, Input, Label and Dialog. Owner explicitly authorized agent-designed UI.
Use a slim indigo demo bar outside the normal application layout. Visitor: Demo,
Changes are temporary, Reset demo, End demo. Admin: Demo admin, Editing live account,
Save checkpoint, Settings, Exit admin mode. Settings: source user, entry org,
capacity, session/extension duration, AI request and token budgets. Clearly disclose
that live admin edits persist and publication affects only future sessions.
Settings opens an anchored panel; destructive reset/end use
confirmation. Expiry warning uses Dialog with Extend session as primary action.
No new editor, artificial org or persistent countdown.

Reference v1: this precise brief and existing candidate toolbar code. Viewports:
1440x900 desktop, 390x844 phone; light/dark, settings open, confirmations, expiry,
capacity/error/unconfigured states. Browser plan: local synthetic fixture, keyboard
focus and Escape, reset/end/revisit, expiry extension, admin publish/settings/exit.
Reference v2 bounds the panel on phone with scrolling fields and a fixed Save footer.
This refinement follows the owner's agent-design authorization; owner signoff remains
pending. Current rendered evidence is inspected in [verification](verification.md).

## Architecture

Control state and checkpoints remain in the primary database. Visitor queries use
an isolated database namespace containing every application table, with scoped
checkpoint rows and no fallback to live tables. Source export uses explicit table
policies and dependency closure; excludes credentials and unrelated learner state.
Database, cache, collaboration and media identities must remain isolated together.
Admin tokens retain the authenticated operator, whose current platform permission
is checked for checkpoint controls. Demo sessions must never authenticate as live
accounts. Admission and budget decisions serialize across workers.

## Acceptance and verification

- Two visitors modify the same plan/profile/badge/chat independently; live unchanged.
- Real org assignment and connected badge/resources survive checkpoint materialization.
- Checkpoint updates are manual and atomic; stale publication/settings versions fail.
- End/reset/expiry invalidate old requests; cleanup retries safely after restart.
- Capacity races do not exceed configured maximum; 200-user load evidence required.
- AI remains real, metered across reset and extension, with a global daily ceiling.
- Admin editing uses normal live UI; operator permission revocation prevents controls.
- No live emails/payment/publication effects or secret/unrelated learner export.
- Run changed/all repository gates, focused isolation/authorization/migration tests,
  browser desktop/phone inspection and interactions. Delivery requires PR to dev,
  six latest-head checks and owner Merge approval; production deployment is excluded.

## Progress

- Clean-checkout doctor passed.
- Delivery branch created from freshly fetched origin/dev.
- Repository architecture, security, design catalog and existing auth/guest/candidate
  implementations inspected. Jira credentials unavailable; independent work continues.

## Implemented behavior and capacity

- Manual publication snapshots the designated live learner and connected org content,
  assigned plans, badges, portfolio and chat. Existing visits retain their snapshot.
  A source account must have ordinary product permissions, not platform admin access.
- Admission defaults to a hard, configurable 200-visitor ceiling, counting queued visits.
  At capacity, Start explains that the demo is busy and supplies Retry-After.
  Normal product sessions do not consume this capacity.
- Clean copies prepare in a background pool bounded by capacity. Admission first claims
  a ready copy; cold visits get a cancellable preparation state, restored after reload.
  Four global PostgreSQL DDL lanes and per-session leases bound creation/deletion and
  allow interrupted jobs to restart. Dirty copies are never returned to the pool.
- Reset/end revoke immediately. Cleanup retries database schemas, namespaced Redis and
  session-owned media. Idle collaborative document connections close within 15 seconds.
- Defaults: 60-minute session; warning once at five minutes; 30-minute extension;
  no persistent countdown. Extensions preserve work. Reset preserves daily AI accounting.
- Paid chat, tool/memory processing and AI generators reserve conservative token budgets
  before provider calls: 10 calls/minute/visitor, 100,000 tokens/visitor/day,
  2,000,000 tokens/day globally. These are token allowances, not currency estimates.
  Failed calls retain reservations. Provider credentials stay in the primary control DB.
- Email delivery is simulated. Payments, platform administration, operational mutations,
  SSO/API tokens/custom domains and external publishing are visibly unavailable. The
  entry page and toolbar's Demo limits panel disclose restrictions; rejected actions
  give a specific explanation. Core learner badge/plan/chat workflows remain enabled.
- Namespace transactions have no public search-path fallback. Credentials, unrelated
  learner work and unknown feature tables are excluded by explicit export policies.
  New persisted features require a reviewed export policy. Unsupported required
  dependencies fail publication visibly rather than silently copying private data.
- Stored media is snapshotted (100 MiB publication limit) and owner prefixes rebased.
  Board XML attributes are rebased through Yjs. Schema changes require a fresh manual
  checkpoint; incompatible sessions are revoked rather than querying stale tables.

## Activation and recovery

After approved dev delivery and the separate production release process, route
`demo.life2launch.app` to the same web application and TLS ingress. Configure
`NEXT_PUBLIC_LAUNCHLMS_DEMO_HOST` on web and `LAUNCHLMS_DEMO_HOST` on API if overriding
that default. Keep the demo origin routed through the web API/content proxies, with
host-only demo cookies; do not point visitors directly at the backend or live CDN.
The normal live site remains the place admins edit the source account. No separate
product fork is required.

Apply the migration first; it seeds **disabled** demo settings. As a platform admin,
open Demo settings on the live site, select the existing learner's email and starting
organization, set capacity/expiry/AI budgets and save. Enter Edit demo account, prepare
it with normal editors and Save checkpoint. Enable new visits, let Ready workspaces
fill, then share the demo link. Publish again whenever the source scenario or org
content should become the new starting point. Re-publish after DB schema updates.

Disable new sessions to pause admission and drain unused pool copies; current visitors
keep working until end/expiry. For rollback, disable admission, revoke/drain remaining
sessions and wait for `cleaned_at` before downgrading the control migration. A database
backup contains checkpoint snapshots and must follow normal product retention/access
rules. Never drop the control tables while private schemas still need cleanup.

No production settings, DNS, database or deployment were changed in this task.
Jira credentials are absent: BOT assignment/workpad and exact-revision Merge approval
remain unavailable. Delivery stops at a checked PR; do not mark Jira Done or claim a
verified dev deployment before the approved revision actually deploys.
