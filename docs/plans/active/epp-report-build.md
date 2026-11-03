# EPP report build

Oregon's Education Plan and Profile (EPP) report for connected schools, built in slices from the
build plan (Claude Doc "EPP report build plan", 2026-11-03), the design proposal and the sample report.
Oregon CIS access ends 2026-12-11, and SB 3 verification starts 2027-01-01.

## Slices

| Slice | What ships | Status |
|---|---|---|
| 1. School connection | Staff ask to support a learner, the learner accepts a consent card, staff open the learner's school record | Merged (#305) |
| 2. EPP framework and plan | Oregon EPP framework with stable codes, assignable yearly plan | Built |
| 3. Course plan | Course list and the 24-credit tally | Planned |
| 4. Live report | Report builder, staff view and print, student preview | Planned |
| 5. Review and freeze | Stored records, corrections, exit record | Planned |
| 6. Caseload and bulk PDF | Caseload screen, class export | Planned |
| 7. SB 3 course summary | One page per student, class grid | Planned |

## Slice 1: school connection

- `learnersupport` (`src/db/learner_support.py`, migration `b7d1e4f8a2c3`): one row per organization and
  learner with status `requested`, `active`, `declined` or `ended`, the consent date and wording version,
  and the school's facts: student ID, diploma track, graduation year and counselor. It cascades from the
  learner's account; the exit record that outlives deletion comes with slice 5.
- `services/school/support.py`: `require_support` is the one access check. It passes only for the
  organization's staff, with an active link, while the learner is still a learner there. Superadmins get
  no bypass. Every later slice reads a learner's school data through it.
- Asking posts a `support_request` card in the learner's chat with the organization. Each ask has its own
  `request_uuid`, so an old card can't answer a new ask. The learner says yes or not now on the card, and
  can stop sharing from the same card later. Staff can end it from the profile.
- Staff see the school record card on a learner's profile (Threads, Overview tab).
- API: `GET/POST/PUT/DELETE /school/orgs/{org_id}/students/{user_id}/support`,
  `GET /school/orgs/{org_id}/students/{user_id}/record`, and for learners `GET /school/support`,
  `POST /school/support/{support_uuid}/answer` and `/end`.

Decisions taken for the pilot (from the build plan): any staff member with an active link can open a
learner; learners accept even when the school set up their account. The consent wording
(`CONSENT_TEXT`, version `2026-11-pilot`) needs a privacy review before a real school uses it.

## Slice 2: EPP framework and plan

- `services/epp/content/framework.json`: "Oregon Education Plan and Profile (EPP)", 16 requirements under
  `EPP.INTERESTS`, `EPP.GOALS`, `EPP.COURSES`, `EPP.PROGRESS`, `EPP.ACCOMPLISHMENTS`, `EPP.CRLE` and
  `EPP.EXTAPP`. The codes are stable: the report reads them, so never rename one.
- `services/epp/content/plan.json`: "My Education Plan and Profile", a yearly plan in four stages with a step
  for every requirement. Steps name their links by code (`requirement_codes`).
- `services/epp/content.py`: `install` creates both in an organization as drafts; `steps_for_code` finds a
  learner's steps by requirement code, however the plan was changed.
- Both were created as drafts in the Life2Launch organization on 2026-11-03 through the Launch LMS connector
  (framework `requirement_framework_9b570685-db8c-4581-859c-0861d907a336`, plan
  `goal_template_4384270c-e7d1-4a7a-af6a-0414c37684d8`). Publishing is the owner's call.
