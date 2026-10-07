# Demo checkpoint verification

Implementation revision: `680195bf2dcfff1006b0c26b24347c169b965c1f` on
`feat/disposable-demo-checkpoints`. The subsequent evidence commit changes only docs. Owner signoff and approved dev deployment remain
pending. All fixtures are synthetic; captures contain no real learner records.

## Design references and inspection

Selected reference v1: the owner-authorized design brief in [README](README.md),
existing CandidateToolbar/CandidateExperience, and adopted Button, Dialog, Popover,
Switch, Label and Input. Reference v2 retains that composition and fixes the settings
panel to keep its Save footer visible while its fields scroll. DemoToolbar has a
catalog entry and native preview in the existing design-system catalog.

Actual Chromium captures were inspected against those references at 1440×900 and
390×844: entry, visitor toolbar, reset confirmation, admin live editing and settings;
phone dark entry; expiry warning at both sizes. The visitor bar stays outside the
normal Hub layout, with Reset/End always available. The admin bar distinguishes live
editing and checkpoint publication. Phone labels simplify without losing accessible
names. The settings footer remains visible and forms scroll within the viewport.
Entry and dialogs have legible spacing and fit the agreed viewports. No horizontal
page overflow was observed. The existing shared Dialog's phone treatment is retained.
Owner approval is still required; these captures are evidence, not a new baseline.

Inspection found and fixed two issues: Escape did not return confirmation focus to
its trigger, and long settings fields clipped Save settings. The final captures show
the corrected layout. A dismissed expiry warning now stays dismissed for that expiry;
an extended session receives a new warning near its later expiry.

Captures: [desktop entry](evidence/entry-desktop.png),
[phone entry](evidence/entry-phone.png), [desktop visitor](evidence/visitor-desktop.png),
[phone visitor](evidence/visitor-phone.png), [desktop reset](evidence/reset-desktop.png),
[phone reset](evidence/reset-phone.png), [admin live](evidence/admin-live-desktop.png),
[desktop settings](evidence/admin-settings-desktop.png),
[phone settings](evidence/admin-settings-phone.png), [dark entry](evidence/entry-dark-phone.png),
[desktop warning](evidence/expiry-desktop.png), [phone warning](evidence/expiry-phone.png).
Local Next development indicators visible in captures are test-environment UI.

## Executed evidence

- `./scripts/agent doctor`: passed on the clean base checkout.
- `./scripts/agent check --all`: 481 API tests passed, two PostgreSQL-only tests
  skipped in the normal suite; frontend lint/type/unit, docs, product map, architecture
  and source-size checks passed. The final changed/all reruns passed; the PostgreSQL suite is run separately.
  Existing lint debt remains 327 errors/47 warnings with no growth.
- `DEMO_TEST_DATABASE_URL=... TESTING=true .venv/bin/pytest src/tests/test_demo.py -q`
  from `apps/api`: **14 passed**, including private namespace isolation/revocation and qualified pgvector search,
  operator permission revocation, peer/private credential export exclusions, bounded warm pool, admission ceiling,
  schema compatibility, metered provider transport and copied filesystem media.
- `apps/api/scripts/test_demo_capacity.py`: 200 private namespaces, concurrent edits,
  source unchanged, visitor 201 rejected. `test_demo_http_capacity.py`: 200 admissions
  over 32 HTTP workers in 9.07 seconds; 200 private authenticated reads after preparation,
  distinct edits/source unchanged, visitor 201 rejected; total 347.61 seconds.
  [Capacity results](evidence/capacity-results.json). Cold preparation is queued;
  this synthetic checkpoint does not represent production infrastructure sizing.
- `bun run build` in `apps/collab`: TypeScript build passed.
  `bun scripts/verify-demo.ts`: Private/live room credential boundaries, Yjs media rebasing, source unchanged and repeated loads
  stable. Local Hocuspocus integration: private room created, edit persisted, live room access is denied to visitor credentials; ending
  closes the document connection and subsequent internal reads return 401.
  [Collaboration results](evidence/collaboration-results.json).
- `node scripts/verify-demo-browser.cjs` from `apps/web`: actual desktop/phone entry,
  cancel during admission, reset/end, old-token 401, Escape/focus restoration, admin enter/settings/manual
  publish/exit and dark phone capture passed. [Browser results](evidence/browser-results.json).
- Local browser expiry/feature probe: set synthetic registry expiry to four minutes,
  inspect warning, extend same session and verify at least 25 minutes remaining;
  assigned plan GET 200, plan-linked badge start 200, chat's test-provider action visible
  at both sizes. [Expiry/feature results](evidence/expiry-feature-results.json).
- Local TLS hostname probe (browser DNS override, test certificate and development
  websocket proxy): demo entry redirect, org links stay on demo host, assigned plan
  visible, refresh keeps host-only credentials, End returns to entry. Phone settings
  Save succeeded. [Host results](evidence/host-results.json). Local `127.0.0.1` was
  temporarily added to dev origins for this probe and reverted before delivery.
- Local HTTP media probe: owner read 200, other visitor 403, ended visitor 401;
  filesystem copy deleted. [Media results](evidence/media-results.json).
- Isolated migration DB: current-model bootstrap, Alembic stamp head, downgrade to
  `t0u1v2w3x4y5`, upgrade head; defaults disabled/200/60/30 and final signature/aliases/
  duration columns verified. The active fixture DB was not downgraded.

Paid provider transport was mocked and browser chat used the explicit local test
provider. No paid production AI call was made. S3/R2 copy/cleanup code is implemented
but only filesystem storage was exercised here. Production ingress, production
storage and representative checkpoint sizing require dev/activation verification.

## Owner test scenarios

1. Configure the existing non-platform-admin source learner and its org. Enter Edit
   demo account, edit normal portfolio/plan/badge content, then Save checkpoint.
2. Start demos in two separate browser profiles. Edit the same item differently;
   verify neither visitor nor the source account sees the other's edits.
3. Start an assigned badge, inspect an org-assigned plan and use chat. Open Demo limits;
   check disabled external actions explain themselves and AI allowance failures are visible.
4. Reset one profile; its old tabs lose access. End the other; returning starts clean.
5. Verify the five-minute warning extends the same work without a persistent timer.
6. Edit the live account and publish again; an existing visit retains its checkpoint
   while a new visit receives the update. Verify settings and publication reject a
   stale settings revision instead of overwriting another admin's change.
7. On dev, confirm host-only cookies and same-origin private media on the dedicated
   demo hostname, storage deletion, provider configuration and Ready workspaces refill.

## Delivery blockers

BOT/Jira credentials are unavailable. No assigned parent/workpad or exact-revision
Merge approval can be recorded. The PR may be reviewed, but merge and checked dev
candidate deployment must wait for the owner-controlled workflow. No production
release, DNS change or feature activation has been performed.
