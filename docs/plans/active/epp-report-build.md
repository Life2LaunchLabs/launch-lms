# EPP report build

Oregon's Education Plan and Profile (EPP) report for connected schools, built in slices from the
build plan (Claude Doc "EPP report build plan", 2026-11-03), the design proposal and the sample report.
Oregon CIS access ends 2026-12-11, and SB 3 verification starts 2027-01-01.

## Slices

| Slice | What ships | Status |
|---|---|---|
| 1. School connection | Staff ask to support a learner, the learner accepts a consent card, staff open the learner's school record | Merged (#305) |
| 2. EPP framework and plan | Oregon EPP framework with stable codes, assignable yearly plan | Merged (#306) |
| 3. Course plan | Course list and the 24-credit tally | Merged (#307) |
| 4. Live report | Report builder, staff view and print, student preview | Merged (#309) |
| 5. Review and freeze | Stored records, corrections, exit record | Merged (#310) |
| 6. Caseload and bulk PDF | Caseload screen, class export | In review |
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

## Slice 3: course plan

- `eppcourse` (`src/db/epp_courses.py`, migration `c3e8f1a6d9b4`): one row per course a learner plans or
  took with a school: grade 9 to 12, diploma subject area, title, credits, status (`planned`,
  `in_progress`, `completed`), course code, dual credit, source (`student`, `staff`, `cis`) and who
  confirmed it and when.
- `SUBJECTS` holds the Oregon Diploma areas and credits (24 from the class of 2027). `services/epp/courses.tally`
  counts completed and planned (in progress counts as planned) per area; credits past what an area needs
  count as electives. The sample report's table is a test.
- Only staff can mark a course school confirmed, only once it's completed. Any change to a confirmed course
  clears the confirmation, and a learner can't change or remove a confirmed course.
- Staff reach the plan through `require_support`; learners reach their own plan while the school supports
  them. Oregon CIS course planner rows (the "Course Plan" sheet kept with a CIS import) come in with
  "Bring in from Oregon CIS": a course with a letter grade is completed, the rest planned, and a course
  already there is skipped.
- Staff see the Course plan card under the school record on a learner's profile. The learner's own editor
  comes with the student preview in slice 4.
- API (`/epp`): `GET/POST /orgs/{org_id}/students/{user_id}/courses`, `PUT/DELETE .../courses/{course_uuid}`,
  `POST .../courses/{course_uuid}/confirm`, `POST .../courses/import_cis`, and for learners
  `GET/POST /orgs/{org_id}/courses`, `PUT/DELETE /orgs/{org_id}/courses/{course_uuid}`.

## Slice 4: live report

- `services/epp/report.py`: `build` returns the report as JSON with `schema_version` 1: the learner and
  school record, a summary of the five required components, graduation progress (the tally, PFE and HECPS
  credit lines, CRLE, Extended Application, Essential Skills), the course grid, each requirement's work
  found by code, the evidence the learner picked, and "to talk about" prompts. Slice 5 freezes this JSON.
- Only plans the school gave the learner count (`steps_for_code` now skips personal goals). Work is shown as
  plain text with "Student entered" or "Teacher reviewed by …"; file links, staff notes, reviewer notes,
  private items, budgets and contact details never enter it, and `_scrub` drops such keys as a last check.
- Only a completed, staff-confirmed SB 3 course makes the report say "Credit recorded by school".
- Evidence picks live on the support link (`learnersupport.report_picks`, migration `d5a2c9e7b3f1`). Learners
  pick from their public portfolio items; an item made private later drops out of the report.
- Staff: "EPP report" on the School record opens `/admin/threads/profiles/people/{username}/epp`, a white
  report page with Print (each part starts a new sheet). Learners: `/epp` has their course plan, "What I
  show", and a preview of what the school sees; "My plan" on the accepted consent card links there.
- API (`/epp`): `GET /orgs/{org_id}/students/{user_id}/report`, and for learners `GET /orgs/{org_id}/report`
  and `PUT /orgs/{org_id}/report/picks`.

## Slice 5: review and freeze

- `epprecord` (`src/db/epp_records.py`, migration `e8b4d1f6a7c2`): a frozen copy of the report JSON with the
  kind (`annual`, `final`, `transfer`, `exit`), version, outcome, staff and learner comments, the reviewer's
  name and the date. The learner's name and student ID are copied in, and `user_id` is set to null when the
  account goes, so the school keeps its record. Records are never edited.
- `services/epp/records.py`: `review` (staff with an active link) freezes the live report and marks the
  progress component reviewed. `correct` makes a new version pointing at the one it replaces
  (`supersedes_id`) with a reason; a superseded version can't be corrected again. Any of the school's staff
  can list and open records, even after the link ends.
- `freeze_exits` saves an exit record ("Left the organization") and ends the link when a supported learner
  leaves or is removed (`cleanup_after_removal`), loses a membership through a superadmin, or deletes their
  account. It's skipped where the tables don't exist.
- The live report counts a review this school year (from the record history) as "Reviewed this year", and
  lists the review history.
- Staff: "Review and save" on the report page, the saved records under it, and
  `/admin/threads/profiles/epp/{record_uuid}` for one record (with Correct). Record IDs read
  `EPP-{student_id}-{school_year}-v{n}`.
- Uploaded files aren't copied into records: the report carries no files, only text.
- API (`/epp`): `POST /orgs/{org_id}/students/{user_id}/records`, `GET /orgs/{org_id}/records`
  (`user_id`, `include_superseded`), `GET /orgs/{org_id}/records/{uuid}`,
  `POST /orgs/{org_id}/records/{uuid}/corrections`, and for learners `GET /orgs/{org_id}/my_records`.

## Slice 6: caseload and bulk PDF

- `services/epp/caseload.py`: `caseload` lists every learner the school supports (or only those the viewer
  counsels, `mine`) with the five components, evidence count, last review, whether a review is due, the
  first thing to talk about, and a state: `reviewed` (this school year), `ready` (everything but the review
  is complete), `missing`, or `waiting` (asked, not yet said yes). Any of the organization's staff can see
  it; opening a learner still needs an active link. It builds each live report, one per learner, which is
  the first thing to cache if caseloads reach the thousands.
- PDFs are made on the server with ReportLab (`services/epp/pdf.py`, a new dependency), not headless
  Chromium: the production image has no browser, and this keeps it that way. The PDF follows the web
  report's parts and wording, so a change to one needs the other. Text uses ReportLab's bundled Vera
  fonts; check marks use the standard ZapfDingbats font, and characters Vera lacks drop their accent.
- File names read `Last_First_StudentID_EPP_2026-27.pdf` (accents dropped), with `_v2` and up for
  corrected versions. The class export is a zip of each listed learner's newest reviewed record this
  school year (exit records and corrected versions left out).
- Staff: Education plans at `/admin/threads/profiles/epp` (`?mine=1` for I counsel), reached from "All
  plans" on a learner's School record; a PDF button on each saved record.
- API (`/epp`): `GET /orgs/{org_id}/caseload` (`mine`), `GET /orgs/{org_id}/caseload/export` (zip), and
  `GET /orgs/{org_id}/records/{uuid}/pdf`.
