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
- [ ] Turn on for unstable (`LAUNCHLMS_USER_TESTS_ENABLED=true` in the infra repo).
- [ ] Phase 2: cohort boundary guard, discovery filters, leak audit, purge.
- [ ] Phase 3: stories, stages, run board, connector tools, checkpoints per stage.
- [ ] Phase 4: demos from story checkpoints.
- [ ] Phase 5: replays and scale to 30.

## Decisions

- Personas are marked by side tables (`test_persona`, `test_cohort_org`) instead of a
  column on `user` and `organization`. Core tables stay unchanged, and every persona
  check is a primary-key lookup. Real users never reach those tables: the cheap test is
  the email domain.
- The test tables are FORBIDDEN in demo checkpoints, so they never reach a visitor copy.
- Login tickets live in the database, not Redis, so redeeming is one atomic update.
- Until phase 2 a persona can still reach real members of the main org (for example by
  messaging them). Run phase 1 on unstable only.

## Verification

- `apps/api/src/tests/test_user_tests.py`: real accounts refused by the switch, non-admin
  and persona operators refused, one-use and expiring links, off-site landing paths
  refused, sessions ended by cohort close, admin demotion and the flag, plain tokens
  for personas refused by authentication, refresh keeping claims, mail captured (to a
  test address, from a persona to an outside address, and when saving fails) and real
  mail still delivered.
