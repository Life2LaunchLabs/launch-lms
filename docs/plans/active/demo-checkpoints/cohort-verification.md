# Shared demo scenario verification

Owner amendment: 2026-10-07. PR [#90](https://github.com/Life2LaunchLabs/launch-lms/pull/90)
on `feat/disposable-demo-checkpoints`. Verified code revision:
[`cffae72bd6560377524b275bc2dc9d35e8dbe433`](https://github.com/Life2LaunchLabs/launch-lms/commit/cffae72bd6560377524b275bc2dc9d35e8dbe433).
The following evidence commit changes documentation/captures only. Owner signoff and approved dev deployment remain pending.
All records and captures use synthetic fixtures.

## Reference and scope

Selected reference v4 in [the brief](README.md): one fictional live organization,
20 designated fake people, three pilotable accounts, actual account identities and
optional descriptions. One manual checkpoint captures the scenario; each visit is
a separate workspace with permissions belonging to its selected pilot. Preserve
fictional cohort identities and progress; drop real accounts and references.

Reuse adopted controls and the existing 48px bar. Back confirms discard and returns
to selection. Reset retains the pilot. Operators manage accounts on live `/demo`,
enter even nonpilot members with normal editors, switch users and publish together.
New settings/design changes supersede the initial single-user brief; earlier
[verification](verification.md) remains historical evidence for the first iteration.

## Checks and evidence

- `./scripts/agent check --all`: documentation/product/source-size/architecture gates,
  frontend lint/typecheck and five unit test files passed; API Ruff passed;
  491 API tests passed with three dedicated PostgreSQL cases skipped in the default
  suite. Those cases passed separately with `DEMO_TEST_DATABASE_URL` below.
- Focused PostgreSQL checks: 25 passed, including 20-member capture with three
  progress stages, real author/staff exclusion, fake pending invitation retention,
  cross-org resource preservation, private copy isolation and revocation.
- Migration roundtrip in a separate disposable DB: stamp current schema, downgrade
  to `u1v2w3x4y5z6`, seed enabled legacy configuration, upgrade `v2w3x4y5z6a7`.
  Admission disabled, old checkpoint cleared, source retained, cohort empty and
  pilot selection column present. Active browser fixture was not downgraded.
- `node scripts/verify-demo-browser.cjs`: desktop/phone entry, cancellation, reset,
  Back, focus/Escape, settings, live editing, publication and switching.
- `node scripts/verify-demo-cohort-browser.cjs`: public three-account selection,
  operator 20-account management, nonpilot editing, program progress and permission
  checks. [Scenario results](evidence/cohort-browser-results.json).

- `test_demo_http_capacity.py`: 200 admissions across three pilots over 32 workers
  in 5.71 seconds; visitor 201 returned 503. All copies contained 20 fake people,
  private edits matched 200 authenticated reads, all three live pilot accounts stayed
  unchanged. Cold preparation plus verification took 298.61 seconds.
  [Scenario capacity results](evidence/cohort-capacity-results.json). This is synthetic
  local evidence, not production sizing; warm copies prepare before admission.
- Expiry/feature probe at both sizes: warning visible at four minutes, extension
  preserved the session, assigned plan GET 200, cross-org badge start 200 and the
  test-provider chat action appeared. [Feature results](evidence/expiry-feature-results.json).

Required latest-head CI and browser jobs are available on [PR checks](https://github.com/Life2LaunchLabs/launch-lms/pull/90/checks).
They must pass on the delivery head before owner-approved merge; earlier-head CI
is historical and does not approve the amendment. See the PR description for the
final delivery head and check links. No deployment is claimed.
Paid provider transport is mocked and browser chat uses the explicit test provider;
no paid production call, production activation or production deployment is involved.

## Rendered inspection

Current Chromium captures were inspected against reference v4 at 1440×900 and
390×844: [public selection](evidence/entry-desktop.png),
[phone selection](evidence/entry-phone.png), [dark selection](evidence/entry-dark-phone.png),
[cohort management](evidence/cohort-manager-desktop.png),
[phone management](evidence/cohort-manager-phone.png),
[org-admin programs](evidence/org-admin-desktop.png),
[phone org-admin programs](evidence/org-admin-phone.png),
[expiry warning](evidence/expiry-phone.png) and existing reset/settings/live-editor
views. Selection uses three equal cards on desktop and a vertical phone list, with
actual fake names and descriptions. Management uses native controls and normal page
scroll for 20 members; there is no phone horizontal overflow. Normal admin templates
and their existing scrolling mobile tabs remain the product interface. The demo
bar remains 48px, keeps Back/Reset reachable and shows no persistent countdown.
The org-admin pilot has no platform navigation; ordinary platform-admin pages have
no demo bar until entering /demo or live setup mode.

Interaction evidence confirmed save feedback after the manager refresh, nonpilot live
editing, all three prepared stages, learner/admin permission differences, Back
revocation (401), Reset retaining the pilot, and source unchanged. Tests also verify
published identity/description metadata survives draft changes and raster portraits
are bound to their captured fake owner, never fetched from live profiles.

Inspection/testing found and fixed wrong default-org entry routing, cross-org badge
paths/issuer permissions omitted from export, and manager feedback lost on refresh.
The optional PostgreSQL regression captures badge versions/paths/pages, permissions,
cohort resource links and fake pending invitations. No owner-accepted deviations or
new screenshot baseline are implied; owner signoff remains pending.

## Owner test steps

1. On live `/demo`, configure a fictional organization and designate its fake cohort.
   Mark two or three accounts pilotable, including an org admin; add descriptions.
2. Enter different members with Edit live account, prepare plans and progress using
   normal editors, switch accounts, then Save checkpoint once.
3. Open separate private browser windows on the demo link. Only pilotable accounts
   appear. Their actual names/avatars/descriptions come from publication.
4. Try the learner and org-admin views. Check normal cohort interactions, badges,
   assigned plans and chat. Edits stay private to each visit.
5. Reset retains the pilot. Back discards work and returns to the selector. Choosing
   another pilot starts a clean workspace without replenishing AI allowance.
6. Change live profiles, descriptions or progress. Visitors keep the published
   scenario until the next manual Save checkpoint; existing visits remain pinned.
