# Disposable demo checkpoints

Owner authorization: conversation on 2026-10-06, “design it; build it”.
Delivery branch: feat/disposable-demo-checkpoints. Jira configuration is unavailable;
link this plan and the verification report to a BOT Story/workpad when access returns.

## Outcome and decisions

A platform admin designates a fictional live organization and its fake cohort,
prepares those accounts through the normal application, then manually publishes one
immutable checkpoint of the whole scenario. Only accounts marked pilotable appear
on the visitor selector; all designated cohort members retain their actual identities.
Each visitor starts a private,
disposable copy at the demo entry point. Publishing never changes existing sessions.
Target: 200 concurrent sessions, configurable admission control. Badges, assigned
plans and real AI remain functional. No persistent countdown; warn five minutes
before expiry and allow extension. Reset/Back revoke old access, including other tabs.
Back discards the copy and
returns to user selection; Reset keeps the selected pilot.
Reset and extension preserve abuse/spend accounting. External effects are explicitly
simulated or visibly unavailable. Never change ordinary account behavior.

## Design readiness

Historical references v1–v3 (superseded where the owner amendment below differs):
CandidateToolbar/CandidateExperience and adopted Button,
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
Reference v3 keeps management controls on the live `/demo` page and active demo bars
at exactly 48px, subtracting that height from the Hub/sidebar viewport. Ordinary
admin pages retain their existing layout. Reference v2 bounds the panel on phone with scrolling fields and a fixed Save footer.
This refinement follows the owner's agent-design authorization; owner signoff remains
pending. Historical verification is in [verification](verification.md); the cohort amendment
is tracked in [cohort verification](cohort-verification.md).

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

- Manual publication snapshots all designated fake accounts and connected org content,
  programs, assigned plans/progress, badges, portfolios and chat. Existing visits retain
  their snapshot. All pilots share that checkpoint, capacity and spend controls.
  Cohort accounts must have ordinary product permissions, not platform admin access.
  Real user records, memberships, personal work, invitations and typed identity references
  are excluded. Fictional invitations and cohort resource links are preserved.
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

Apply the migrations first; settings are **disabled**. The cohort migration also
disables any previous single-user checkpoint. As a platform admin, open `/demo` on
the live site. In Demo settings, choose the fictional organization and set limits.
Use Manage demo accounts to designate its existing fake accounts, add optional
descriptions, mark the few pilotable accounts and Save cohort. Enter Edit live account
for any member, prepare it with normal editors, and use Switch demo user to prepare
the next. Save checkpoint publishes the whole scenario, including the pilot selector.
Enable new visits, let Ready workspaces
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

## Owner amendment: shared fictional scenario (2026-10-07)

The owner selected one fictional org with an explicitly designated fake cohort
(e.g. 20 learners), of which only a few accounts are pilotable. Save checkpoint
captures all designated accounts, memberships, programs, plans and progress in one
atomic snapshot. Each visit gets its own copy of that same snapshot; its selected
pilot determines permissions. Preserve all fake identities. Drop real-user records
and references; never import unrelated memberships or personal work. Actual product
resources/badges remain connected; live chat remains metered. No per-user checkpoints.

Reference v4: extend the existing /demo entry into a responsive card grid, using the
users' actual names/avatars and optional descriptions, without custom display names.
Authenticated platform operators manage cohort membership and pilot toggles from the
same live /demo surface. They enter any cohort account with normal editors, then
publish the whole scenario through the existing bar. Settings retains scenario org,
capacity/duration/AI controls. Visitor End becomes Back to demo users, confirming
that it discards work. Reset keeps the pilot and shared usage accounting. Visitor
cards come from the published snapshot, never live profiles or unpublished changes.

Reuse adopted Button/Input/Label/Switch/Textarea and existing Popover/Dialog/card
patterns. Verify desktop 1440x900 and phone 390x844, light/dark selection, cohort
management, nonpilot exclusion, admin switching/publication, visitor back/reset,
org-admin cohort/progress, and no ordinary-admin banner/layout changes. Refresh
rendered evidence and update PR #90; its earlier checks are historical after edits.

## Owner amendment: demo users without a scenario org (2026-10-07)

Supersedes the scenario-organization design above. A demo user is an ordinary fake
account flagged as demo. It belongs to the main organization like every real learner,
plus whichever schools or issuers its story needs. Publishing captures every demo user,
all organizations they belong to and the main organization; no entry org is configured.
Visitors land on the user's own start page on the main portal (bare paths on the demo
host). An organization admin start page uses that organization's normal routing.

- **Demo Studio** (`/admin/platform/demo`): demo users and supporting cast, New demo user
  (blank, deep copy of a consenting real account, or duplicate of a demo user), per-user
  Profile, Guide and Link & QR tabs, Publish (preflight, publish, version history and
  restore) and Limits & AI. The visitor `/demo` page no longer carries admin controls.
- **Deep copy** (`services/demo/copy.py`) copies the person's own rows (portfolio, badge
  runs and awards, plans, saved resources, media, optionally coach history) with fresh ids
  and identifiers; shared catalog content stays linked. Inbox messages never copy.
- **Live presentation**: card text, guide, start page, link handle and picker visibility
  are read live and need no publish. Account data reaches visitors on publish.
- **Direct links**: `/demo/<handle>` starts that user immediately; `?tag=` labels the
  session's feedback. QR codes download from the user's Link & QR tab.
- **One bar**: visitor bar (Demo/Unstable tags, user menu, Guide, Feedback, Announcements)
  replaces the unstable tester bar while shown. Setup mode has its own striped LIVE bar.
  Visitor feedback and journey ratings post through the control database to the same
  Jira board, labeled `launchlms-demo`, `demo-user-*`, `demo-tag-*`, `demo-journey-*`.
- **Media**: files referenced by captured content are included even when owned by an
  account outside the demo (copied under a pseudonymous owner); missing files are
  warnings. Preflight lists both with the referencing table.
- Default capacity is 100 concurrent visitors (migration lowers higher values).

Activation per environment: set `LAUNCHLMS_DEMO_HOST` (API) and
`NEXT_PUBLIC_LAUNCHLMS_DEMO_HOST` (web), e.g. `demo.unstable.life2launch.app` on unstable
and `demo.life2launch.app` on production, and route that host to the same web app. Then
create demo users in Studio, set them up, publish, and share `/demo/<handle>` links.
