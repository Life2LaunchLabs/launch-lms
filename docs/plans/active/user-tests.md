# User tests: test personas, captured test mail and admin login links

Design: the "Test personas and user-test console" plan doc (claude.ai artifact
JTbgXV43LWDfWCDM62iAd3). This file tracks what is built.

## Objective

Let a platform admin, or Claude acting for one, run simulated user tests on the real
product without making accounts by hand. That means creating test personas, catching
the email they cause, and opening the site as any persona without a password, with no
way for a test to email, impersonate or change a real person.

## Acceptance (phase 1)

- Only platform admins (superadmin or owner-org admin) can use Platform › User tests,
  and only while `LAUNCHLMS_USER_TESTS_ENABLED` is on. It is off by default.
- A cohort holds up to 50 personas, closes itself after 1 to 30 days, and closing it
  signs every persona in it out on their next request. At most 5 cohorts are open.
- Personas are fresh accounts on the reserved test domain (default
  `test.life2launch.app`, which has no mail server). Their password is random and never
  shown. They join the main org as learners only. An `owner:` persona also gets a new,
  unlisted test org they administer. An org any persona creates joins their cohort.
- Mail to a test address, and any mail sent while a persona is acting, is stored as
  test mail and never delivered, even when storing it fails.
- A login link is minted only for a test persona in an open cohort, only by a platform
  admin. It works once, for 60 seconds, and only its hash is stored. It lands only on a
  path on this site.
- A persona session carries `test_operator` and `test_cohort` claims and lasts 4 hours.
  Every request rechecks the flag, the admin's access, the persona and the cohort. A
  token for a test address without those claims is refused, refresh keeps the claims,
  and host handoff refuses personas.
- The audit log records the admin behind a persona session.
- A banner shows on every page while a persona is signed in.

## Progress

- [x] Phase 1: cohorts, personas, test mail, login links, console, banner, tests.
- [x] Turn on for unstable (`LAUNCHLMS_USER_TESTS_ENABLED=true` in the infra repo).
- [x] Phase 2: cohort seal, blocked persona actions, search filters, leak audit, purge.
- [x] Personas left out of Insights for real viewers (`insights/context.py` population).
- [ ] Maybe later: a Test badge in Platform › Users and Organizations (persona emails on the
  test domain already show who they are; both tables are over the size limit).
- [x] Phase 3: stories, stages, run board, persona panel, findings report, connector tools.
- [x] Phase 4: checkpoints per stage (automatic when the last persona finishes) and publishing one as the demo.
- [x] Phase 5: replays (Run again) and limits sized for 30 persona browsers.

## Decisions

- Personas are marked by side tables (`test_persona`, `test_cohort_org`) instead of a
  column on `user` and `organization`. Core tables stay unchanged, and every persona
  check is a primary-key lookup. Real users never reach those tables: the cheap test is
  the email domain.
- The test tables are FORBIDDEN in demo checkpoints, so they never reach a visitor copy.
- Login tickets live in the database, not Redis, so redeeming is one atomic update.
- The cohort boundary is a data-layer seal (`services/user_tests/seal.py`), not a check per
  router. After every flush it looks at new rows, and changed people columns, and refuses any
  row that names people or orgs from two worlds (the real world or one cohort). It follows a
  row into the conversation, goal, portfolio or resource comment it belongs to, and reads
  invited addresses. The main org is shared and never counts on its own, except for resource
  comments, which real learners read. Test worlds can't write listings, plan requests,
  payments, API tokens, OAuth grants or SSO, and a persona can't change its email, password
  or platform role. Rows naming only real people never match, so real traffic pays two indexed
  lookups per flush.
- What the seal can't see (a main-org group or conversation whose members mix worlds), the
  leak audit finds. Purge runs only on a closed cohort with a clean audit, so cascading deletes
  never reach a real person's rows.
- A persona session is refused password changes, account deletion, API tokens, payments,
  Google and SSO sign-in, and OAuth grants (`sessions.BLOCKED`).
- Real users never see personas or test orgs in search or Connect people search
  (`services/user_tests/visibility.py`). Platform admins still see them in Threads and the
  platform lists.

- A cohort's stages live on `test_cohort.stages`; each persona's place in them on
  `test_persona.stage_state`. A stage can wait for one persona to finish another stage, and the
  board derives "waiting" instead of storing it. Progress, findings and refused actions go to
  `test_event`, so the report is one query. A refused action is written on its own connection,
  because the request that was refused rolls back.
- A persona's own session reaches `/user_tests/me*` (its stages, its mail, progress and
  findings) and never sees briefs. The connector tools (`user_tests:read`/`user_tests:write`,
  platform admins only) let a testing thread do the same for a persona it drives in a browser,
  and record its progress as `by: tester`. Existing connections reconnect to get the scopes.
- With host-only cookies, a persona moving to another org's host (her own test org) goes
  through the normal session handoff, and the ticket carries her test claims: the new host gets
  a persona session that ends when the first one does, plus the banner cookie. A persona whose
  handoff fails lands on the test entry page, never a password page.
- A checkpoint is Demo Studio's own capture of the run's personas (their orgs and the main
  org), rehearsed like a demo publish and stored in `test_checkpoint` with the demo's data
  format. Publishing it creates a demo checkpoint with the same id and points the demo at it;
  the personas become pickable demo users, so Demo Studio edits their cards. Purge waits until
  they are removed from Demo Studio. With Demo Studio's auto-update on, a product update
  re-captures the demo from the personas' current state, not the stage.
- A replay is a new cohort with fresh personas made from the first run's (names, briefs,
  starting state, test-org names) and the same stages, waits remapped to the new handles.
  Nothing the first run did is copied, so the two runs' boards and reports compare directly.
- For 30 persona browsers behind one cloud IP: a verified persona refresh token gets its own
  refresh limit (`refresh:test:<sub>`) instead of the shared per-IP one, and an admin can make
  400 login links an hour.

## Verification

- `apps/api/src/tests/test_user_tests.py`: real accounts refused by the switch, non-admin
  and persona operators refused, one-use and expiring links, off-site landing paths
  refused, sessions ended by cohort close, admin demotion and the flag, plain tokens
  for personas refused by authentication, refresh keeping claims, mail captured (to a
  test address, from a persona to an outside address, and when saving fails) and real
  mail still delivered.
- `apps/api/src/tests/test_user_tests_seal.py`: the seal refusing persona joins of real orgs,
  real joins of test orgs, mixed conversations and messages, cross-cohort links, invitations
  across worlds, persona email and password changes, test-org plan requests, persona comments
  on main-org resources and staff inbox messages to personas; blocked persona paths; hidden
  personas and test orgs; the audit finding a mixed group and blocking purge; purge deleting
  only the cohort and keeping its mail.
- `apps/api/src/tests/test_user_tests_stories.py`: stages waiting on another persona, stuck
  personas first, stage validation, findings and refused actions in the report, the persona view
  hiding briefs, and the persona-only routes refusing operators.
- `apps/api/src/tests/test_user_tests_mcp.py`: a connector creating a cohort, adding personas,
  setting stages, making a login link, reading mail as text (and not another persona's),
  reporting progress and findings, reading the report, and purge refusing an open cohort; the
  tools refused without platform admin, the scope or the flag, and hidden from non-admins.
- `apps/api/src/tests/test_user_tests_checkpoints.py`: a stage captured once, when its last
  persona finishes, with personas only and no test tables; publishing making it the demo with
  the personas on the picker, publishing again without a duplicate, purge waiting on Demo
  Studio; a checkpoint from before a product update refused.
- `apps/api/src/tests/test_user_tests_replays.py`: a replay's fresh personas, test org, stages
  and remapped waits, run numbering, and the per-persona refresh key; `test_user_tests.py`
  checks only a verified persona refresh token gets it.
